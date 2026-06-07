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
import { dataPath } from './data-dir';

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

function sessionPath(): string {
  if (process.env.NODE_ENV === 'production') return '/tmp/tiktok-session.json';
  return dataPath('tiktok-session.json');
}

/** Returns true if a saved TikTok browser session exists */
export function hasBrowserSession(): boolean {
  return fs.existsSync(sessionPath());
}

/** Download a remote video to a local temp file */
async function downloadToTemp(url: string): Promise<string> {
  const dest = path.join(os.tmpdir(), `tt-upload-${Date.now()}.mp4`);
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Video download failed: ${res.status} ${res.statusText}`);
  const buf  = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

/** Upload a video to TikTok using browser automation */
export async function uploadViaBrowser(
  opts: BrowserUploadOptions,
): Promise<BrowserUploadResult> {
  const sess = sessionPath();
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

    // Mask automation
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // ── Navigate to TikTok Studio upload page ─────────────────────────────
    console.log('[tiktok-browser] Navigating to TikTok upload...');
    await page.goto('https://www.tiktok.com/upload', {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });

    // Check if we're still logged in (redirect to login = session expired)
    if (page.url().includes('/login') || page.url().includes('/signup')) {
      return {
        success: false,
        error:   'Session TikTok expirée. Relance : npm run tiktok:login',
      };
    }

    // TikTok upload might be in an iframe
    await page.waitForTimeout(3000);

    // ── Find and use file input (check iframe first) ──────────────────────
    let fileInputLocator;
    const iframes = page.frames();
    let targetFrame = page;

    for (const frame of iframes) {
      const frameUrl = frame.url();
      if (frameUrl.includes('upload') || frameUrl.includes('creator') || frameUrl.includes('studio')) {
        const inp = frame.locator('input[type="file"]');
        if (await inp.count() > 0) {
          // Use frame as page-like object
          fileInputLocator = inp.first();
          targetFrame = frame as unknown as typeof page;
          break;
        }
      }
    }

    // Fallback: main page
    if (!fileInputLocator) {
      fileInputLocator = page.locator('input[type="file"]').first();
    }

    console.log('[tiktok-browser] Uploading video file...');
    await fileInputLocator.setInputFiles(tempFile);

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

    let captionEl;
    for (const sel of captionSelectors) {
      try {
        await (targetFrame as typeof page).waitForSelector(sel, { timeout: 180_000 });
        captionEl = (targetFrame as typeof page).locator(sel).first();
        break;
      } catch { continue; }
    }

    if (!captionEl) {
      return { success: false, error: 'Impossible de trouver le champ description TikTok' };
    }

    // ── Type caption (with hashtags) ─────────────────────────────────────
    await captionEl.click({ force: true });
    await page.waitForTimeout(500);

    // Clear and type
    await captionEl.selectText().catch(() => {});
    const maxCaption = opts.caption.substring(0, 2200);
    await captionEl.pressSequentially(maxCaption, { delay: 10 });

    await page.waitForTimeout(1000);

    // ── Set privacy ────────────────────────────────────────────────────────
    if (opts.privacy === 'private') {
      // Try to find privacy selector
      const privacySelectors = [
        '[data-e2e="permission-container"]',
        '[class*="privacy"]',
        'select[class*="select"]',
      ];
      for (const sel of privacySelectors) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click().catch(() => {});
          break;
        }
      }
    }

    // ── Click Post button ─────────────────────────────────────────────────
    console.log('[tiktok-browser] Posting...');

    const postSelectors = [
      'button[data-e2e="post-button"]',
      'button:has-text("Post")',
      'button:has-text("Publier")',
      'button[class*="submit"]:not([disabled])',
    ];

    let posted = false;
    for (const sel of postSelectors) {
      const btn = page.locator(sel).last();
      if (await btn.count() > 0 && await btn.isEnabled()) {
        await btn.click();
        posted = true;
        break;
      }
    }

    if (!posted) {
      return { success: false, error: 'Bouton Post introuvable — vérifie la session TikTok' };
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
    if (browser) await browser.close();
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    }
  }
}
