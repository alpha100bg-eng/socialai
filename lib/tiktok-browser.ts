/**
 * TikTok Browser Upload
 *
 * Uploads a video to TikTok using a saved browser session (no API key needed).
 * Uses Playwright to automate TikTok's web uploader.
 *
 * Prerequisites:
 *   1. Run: npm run tiktok:login
 *   2. Session saved to data/tiktok-session.json
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { dataPath, IS_VERCEL } from './data-dir';
import { DEFAULT_NICHE }       from './niches';

// Lazy-load playwright so it doesn't break Vercel builds
async function getPlaywright() {
  const { chromium } = await import('playwright');
  return chromium;
}

export interface BrowserUploadOptions {
  videoUrl:  string;   // public URL (fal.ai URL works directly)
  caption:   string;   // full caption with hashtags, max 2200 chars
  privacy?:  'public' | 'private';
}

export interface BrowserUploadResult {
  success:   boolean;
  shareUrl?: string;
  error?:    string;
}

function sessionPath(profileId: string = DEFAULT_NICHE): string {
  const suffix = profileId === DEFAULT_NICHE ? '' : `-${profileId}`;
  const file   = `tiktok-session${suffix}.json`;
  if (IS_VERCEL) return `/tmp/${file}`;
  return dataPath(file);
}

/** Returns true if a saved TikTok browser session exists for the given profile */
export function hasBrowserSession(profileId: string = DEFAULT_NICHE): boolean {
  return fs.existsSync(sessionPath(profileId));
}

/** Download a remote video to a local temp file (timeout + 1 retry) */
async function downloadToTemp(url: string): Promise<string> {
  const dest = path.join(os.tmpdir(), `tt-upload-${Date.now()}.mp4`);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`Video download failed: ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      console.log(`[tiktok-browser] Downloaded ${buf.length} bytes to ${dest}`);
      return dest;
    } catch (e) {
      lastErr = e;
      console.warn(`[tiktok-browser] Download attempt ${attempt} failed:`, e);
    }
  }
  throw new Error(`Video download failed after 2 attempts: ${lastErr}`);
}

/** Upload a video to TikTok using browser automation */
export async function uploadViaBrowser(
  opts: BrowserUploadOptions,
  profileId: string = DEFAULT_NICHE,
): Promise<BrowserUploadResult> {
  const sess = sessionPath(profileId);
  if (!fs.existsSync(sess)) {
    return {
      success: false,
      error:   'Session TikTok introuvable. Lance : npm run tiktok:login',
    };
  }

  const { cookies, storage } = JSON.parse(fs.readFileSync(sess, 'utf-8'));

  const chromium = await getPlaywright();
  let   browser;
  let   tempFile: string | null = null;

  try {
    // ── Download video to local temp ──────────────────────────────────────
    console.log('[tiktok-browser] Downloading video...');
    tempFile = await downloadToTemp(opts.videoUrl);
    console.log(`[tiktok-browser] Video downloaded: ${tempFile}`);

    // ── Launch browser with saved session ─────────────────────────────────
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport:  { width: 1280, height: 900 },
      storageState: storage ?? undefined,
    });

    if (cookies?.length) await context.addCookies(cookies);

    const page = await context.newPage();

    // Filet de sécurité : aucune action Playwright ne doit pendre indéfiniment
    page.setDefaultTimeout(60_000);
    page.setDefaultNavigationTimeout(60_000);

    // Mask automation
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // ── Navigate to TikTok Studio upload page ─────────────────────────────
    // TikTok a migré /upload → /tiktokstudio/upload. On vise la nouvelle URL.
    console.log('[tiktok-browser] Navigating to TikTok Studio upload...');
    await page.goto('https://www.tiktok.com/tiktokstudio/upload', {
      waitUntil: 'domcontentloaded',
      timeout:   45_000,
    });

    // Check if we're still logged in (redirect to login = session expired)
    if (page.url().includes('/login') || page.url().includes('/signup')) {
      return {
        success: false,
        error:   'Session TikTok expirée. Relance : npm run tiktok:login',
      };
    }

    // Laisse le studio charger (React + iframes éventuels)
    await page.waitForTimeout(5000);

    // DEBUG : capture la page juste après navigation (pour voir ce que TikTok
    // affiche sur le serveur : vraie page d'upload ? vérification ? captcha ?)
    await page.screenshot({ path: dataPath('debug-nav.png') }).catch(() => {});

    // ── Find the file input across page + all frames (poll up to 60s) ─────
    // Le champ <input type=file> est souvent présent mais caché derrière une
    // drop-zone, et peut vivre dans un iframe creator/studio.
    let fileInputLocator;
    let targetFrame = page;
    const findDeadline = Date.now() + 60_000;

    while (Date.now() < findDeadline && !fileInputLocator) {
      // 1) Page principale
      const mainInput = page.locator('input[type="file"]');
      if (await mainInput.count() > 0) {
        fileInputLocator = mainInput.first();
        targetFrame = page;
        break;
      }
      // 2) Tous les iframes
      for (const frame of page.frames()) {
        try {
          const inp = frame.locator('input[type="file"]');
          if (await inp.count() > 0) {
            fileInputLocator = inp.first();
            targetFrame = frame as unknown as typeof page;
            break;
          }
        } catch { /* frame détaché — ignore */ }
      }
      if (!fileInputLocator) await page.waitForTimeout(2000);
    }

    if (!fileInputLocator) {
      return { success: false, error: 'Champ d\'upload TikTok introuvable (UI changée ?)' };
    }

    console.log('[tiktok-browser] Uploading video file...');
    await fileInputLocator.setInputFiles(tempFile, { timeout: 60_000 });

    // DEBUG : capture ~8s après l'envoi pour voir si l'upload démarre vraiment
    await page.waitForTimeout(8000);
    await page.screenshot({ path: dataPath('debug-upload.png') }).catch(() => {});

    // ── Wait for upload + processing (up to 3 min) ────────────────────────
    console.log('[tiktok-browser] Waiting for video processing...');

    // Look for the caption/description area appearing — signals upload is done
    const captionSelectors = [
      '[data-e2e="video-desc"]',
      '.DraftEditor-root',
      '[contenteditable="true"]',
      '[class*="caption"] [contenteditable]',
      'div[class*="editor"] [contenteditable]',
    ];

    // Poll all selectors together (up to 120s) — échoue plus vite si la page
    // n'est pas la bonne, au lieu d'attendre 180s par sélecteur.
    let captionEl;
    const capDeadline = Date.now() + 120_000;
    while (Date.now() < capDeadline && !captionEl) {
      for (const sel of captionSelectors) {
        const el = (targetFrame as typeof page).locator(sel).first();
        if (await el.count().catch(() => 0) > 0 && await el.isVisible().catch(() => false)) {
          captionEl = el;
          break;
        }
      }
      if (!captionEl) await page.waitForTimeout(2500);
    }

    if (!captionEl) {
      // DEBUG : capture l'écran pour voir pourquoi le champ n'apparaît pas
      await page.screenshot({ path: dataPath('debug-fail.png') }).catch(() => {});
      return { success: false, error: `Champ description introuvable — page: ${page.url()}` };
    }

    // ── Dismiss TikTok popups that steal focus / block the Post button ────
    // (dialogue "Turn on automatic content checks?", tooltip "New editing
    //  features added", etc.) — sinon ils volent le focus du champ caption
    //  et interceptent le clic Post.
    const dismissPopups = async () => {
      const dismissBtns = [
        'button:has-text("Got it")',
        'button:has-text("Cancel")',
        'button:has-text("Annuler")',
        'button:has-text("Not now")',
        'div[class*="TUXModal"] button[aria-label*="lose"]',
        'div[class*="TUXModal"] svg[class*="close"]',
      ];
      for (const sel of dismissBtns) {
        const b = page.locator(sel).first();
        if (await b.count() > 0 && await b.isVisible().catch(() => false)) {
          await b.click({ timeout: 5_000 }).catch(() => {});
          await page.waitForTimeout(400);
        }
      }
    };
    await dismissPopups();
    // La caption est saisie PLUS BAS, après la fin du traitement vidéo :
    // TikTok réécrit la description avec le nom du fichier quand le traitement
    // se termine, donc taper avant serait écrasé.
    void captionEl;

    // NOTE : on ne touche PAS au menu de confidentialité — l'ouvrir laissait
    // un overlay flottant (TUXModal) ouvert qui bloquait le clic sur "Post".
    // La vidéo est postée avec la confidentialité par défaut du compte TikTok.

    // ── Wait for TikTok to FINISH processing the video ───────────────────
    // L'erreur "Something went wrong" venait d'un clic Post trop tôt : le
    // champ caption apparaît avant la fin du traitement vidéo. On attend donc
    // que le bouton Post soit réellement présent ET activé (jusqu'à 3 min).
    console.log('[tiktok-browser] Waiting for upload to finish processing...');

    const postSelectors = [
      'button[data-e2e="post_video_button"]',  // sélecteur réel TikTok Studio
      'button[data-e2e="post-button"]',
      'button:has-text("Post")',
      'button:has-text("Publier")',
      'button[class*="submit"]:not([disabled])',
    ];

    const procDeadline = Date.now() + 180_000;
    let postBtn = null;

    while (Date.now() < procDeadline && !postBtn) {
      for (const sel of postSelectors) {
        const btn = (targetFrame as typeof page).locator(sel).last();
        // aria-disabled="false" = traitement vidéo terminé, bouton prêt
        if (await btn.count() > 0
            && await btn.getAttribute('aria-disabled').catch(() => 'true') !== 'true'
            && await btn.isVisible().catch(() => false)) {
          postBtn = btn;
          break;
        }
      }
      if (!postBtn) await page.waitForTimeout(3000);
    }

    if (!postBtn) {
      return { success: false, error: 'Bouton Post jamais activé (traitement vidéo trop long ?)' };
    }

    // ── Set privacy to PUBLIC (sinon par défaut "Only me" = invisible) ───
    if (opts.privacy !== 'private') {
      console.log('[tiktok-browser] Setting privacy to public...');
      await dismissPopups();
      try {
        // Ouvre le menu "Who can watch this video" (affiche la valeur courante)
        const privacyTrigger = page.locator(
          '[data-e2e="privacy-container"], [data-e2e*="privacy"], div[class*="privacy"]'
        ).filter({ hasText: /Only me|Friends|Everyone|Public|Followers/i }).first();

        if (await privacyTrigger.count() > 0) {
          await privacyTrigger.click({ timeout: 8_000 }).catch(() => {});
          await page.waitForTimeout(800);
          // Sélectionne "Everyone" / "Public" dans le menu déroulant
          const publicOpt = page.locator(
            'li:has-text("Everyone"), li:has-text("Public"), div[role="option"]:has-text("Everyone"), span:has-text("Everyone")'
          ).first();
          if (await publicOpt.count() > 0) {
            await publicOpt.click({ timeout: 8_000 }).catch(() => {});
            await page.waitForTimeout(500);
          }
        }
      } catch { /* on continue même si le réglage échoue */ }
      if (process.env.TIKTOK_DEBUG_SHOTS === '1') {
        await page.screenshot({ path: dataPath('debug-privacy.png'), fullPage: true }).catch(() => {});
      }
    }

    // ── Type caption MAINTENANT (traitement vidéo terminé) ───────────────
    // À ce stade TikTok a fini de traiter et a mis le nom de fichier comme
    // description. On le remplace par notre vraie caption.
    console.log('[tiktok-browser] Typing caption...');
    await dismissPopups();
    const editable = (targetFrame as typeof page)
      .locator('div[contenteditable="true"], [data-e2e="video-desc"] [contenteditable="true"], .DraftEditor-root [contenteditable="true"]')
      .first();
    const typeTarget = (await editable.count().catch(() => 0)) > 0 ? editable : captionEl;

    await typeTarget.click({ force: true });
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+A').catch(() => {});
    await page.waitForTimeout(150);
    await page.keyboard.press('Backspace').catch(() => {});
    await page.waitForTimeout(300);
    const maxCaption = opts.caption.substring(0, 2200);
    await page.keyboard.type(maxCaption, { delay: 15 });
    await page.waitForTimeout(1500);

    if (process.env.TIKTOK_DEBUG_SHOTS === '1') {
      await page.screenshot({ path: dataPath('debug-after-caption.png'), fullPage: true }).catch(() => {});
    }

    console.log('[tiktok-browser] Posting...');
    await page.waitForTimeout(1000);

    // DEBUG : capture l'écran avant le clic Post pour diagnostiquer l'overlay
    if (process.env.TIKTOK_DEBUG_SHOTS === '1') {
      await page.screenshot({ path: dataPath('debug-before-post.png'), fullPage: true }).catch(() => {});
    }

    // Ferme tout popup TikTok resté ouvert (dialogue content-checks, tooltips)
    // avant de cliquer Post, sinon l'overlay intercepte le clic.
    await dismissPopups();
    await page.waitForTimeout(500);

    try {
      await postBtn.click({ timeout: 10_000 });
    } catch {
      console.log('[tiktok-browser] Overlay détecté — clic forcé...');
      await postBtn.click({ force: true, timeout: 10_000 });
    }

    // ── Wait for success ───────────────────────────────────────────────────
    try {
      await page.waitForFunction(
        () => {
          const url = window.location.href;
          return (
            url.includes('/@') ||
            url.includes('/profile') ||
            document.querySelector('[data-e2e="upload-success"]') !== null
          );
        },
        { timeout: 30_000, polling: 1000 },
      );
    } catch {
      // Even if we can't detect success, the post might have gone through
      console.warn('[tiktok-browser] Could not confirm success via URL, checking for errors...');
      if (process.env.TIKTOK_DEBUG_SHOTS === '1') {
        await page.screenshot({ path: dataPath('debug-after-post.png'), fullPage: true }).catch(() => {});
      }
      const errorEl = page.locator('[class*="error"], [data-e2e="upload-error"]').first();
      if (await errorEl.count() > 0) {
        const errText = await errorEl.textContent();
        return { success: false, error: `TikTok error: ${errText}` };
      }
    }

    console.log('[tiktok-browser] ✅ Video posted!');
    return { success: true };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tiktok-browser] Error:', msg);
    return { success: false, error: msg };

  } finally {
    // browser.close() peut pendre dans Docker headless → on le borne à 15s
    if (browser) {
      await Promise.race([
        browser.close(),
        new Promise((r) => setTimeout(r, 15_000)),
      ]).catch(() => {});
    }
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    }
  }
}
