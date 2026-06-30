/**
 * Lecture des statistiques TikTok via navigateur (sans API officielle).
 *
 * Ouvre TikTok Studio → page "Content", lit les vues/likes/commentaires de
 * chaque vidéo récente. Utilisé par le robot GitHub d'apprentissage.
 */

import fs from 'fs';
import { dataPath, IS_VERCEL } from './data-dir';
import { DEFAULT_NICHE }       from './niches';

export interface PostStat {
  desc:     string;
  views:    number;
  likes:    number;
  comments: number;
  shares:   number;
}

export interface AnalyticsResult {
  success:    boolean;
  stats:      PostStat[];
  error?:     string;
  debugText?: string;   // dump de la page si le parsing échoue (pour ajuster)
}

function sessionPath(profileId: string): string {
  const suffix = profileId === DEFAULT_NICHE ? '' : `-${profileId}`;
  const file   = `tiktok-session${suffix}.json`;
  return IS_VERCEL ? `/tmp/${file}` : dataPath(file);
}

/** Convertit "1.2K" / "3,4 M" / "987" en nombre. */
function parseCount(raw: string): number {
  if (!raw) return 0;
  const s = raw.trim().toLowerCase().replace(/\s/g, '').replace(',', '.');
  const m = s.match(/^([\d.]+)\s*([km]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  if (m[2] === 'k') return Math.round(n * 1_000);
  if (m[2] === 'm') return Math.round(n * 1_000_000);
  return Math.round(n);
}

async function getPlaywright() {
  const { chromium } = await import('playwright');
  return chromium;
}

export async function readPostAnalytics(
  profileId: string = DEFAULT_NICHE,
): Promise<AnalyticsResult> {
  const sess = sessionPath(profileId);
  if (!fs.existsSync(sess)) {
    return { success: false, stats: [], error: 'Session TikTok introuvable' };
  }
  const { cookies, storage } = JSON.parse(fs.readFileSync(sess, 'utf-8'));

  const chromium = await getPlaywright();
  let browser;
  try {
    browser = await chromium.launch({
      headless: process.env.HEADFUL_XVFB === '1' ? false : true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--disable-setuid-sandbox', '--disable-extensions',
      ],
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport:  { width: 1280, height: 1400 },
      storageState: storage ?? undefined,
    });
    if (cookies?.length) await context.addCookies(cookies);
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);

    await page.goto('https://www.tiktok.com/tiktokstudio/content', {
      waitUntil: 'domcontentloaded', timeout: 45_000,
    });
    if (page.url().includes('/login') || page.url().includes('/signup')) {
      return { success: false, stats: [], error: 'Session expirée' };
    }
    await page.waitForTimeout(7000);
    await page.screenshot({ path: dataPath('debug-analytics.png') }).catch(() => {});

    // Scrape générique : chaque "ligne" de post contient une description + des
    // nombres (vues/likes/commentaires). On lit le DOM de façon défensive.
    const stats: PostStat[] = await page.evaluate(() => {
      const toNum = (t: string): number => {
        const s = (t || '').trim().toLowerCase().replace(/\s/g, '').replace(',', '.');
        const m = s.match(/^([\d.]+)\s*([km]?)/);
        if (!m) return 0;
        const n = parseFloat(m[1]) || 0;
        return m[2] === 'k' ? Math.round(n * 1e3) : m[2] === 'm' ? Math.round(n * 1e6) : Math.round(n);
      };
      const rows = Array.from(document.querySelectorAll(
        '[class*="PostInfoCell"], [class*="content_card"], [data-tt*="components_PostItem"], li[class*="post"], div[class*="ContentCard"]',
      ));
      const out: { desc: string; views: number; likes: number; comments: number; shares: number }[] = [];
      for (const row of rows) {
        const txt = (row as HTMLElement).innerText || '';
        // Trouve les nombres (vues, likes, comments) — heuristique
        const nums = (txt.match(/[\d.,]+\s*[KMkm]?/g) || []).map(toNum).filter((n) => n >= 0);
        const descEl = row.querySelector('[class*="desc"], [class*="title"], a[href*="/video/"]');
        const desc = (descEl as HTMLElement)?.innerText?.trim() || txt.split('\n')[0] || '';
        if (desc) {
          out.push({
            desc,
            views:    nums[0] ?? 0,
            likes:    nums[1] ?? 0,
            comments: nums[2] ?? 0,
            shares:   nums[3] ?? 0,
          });
        }
      }
      return out;
    });

    if (stats.length === 0) {
      // Parsing raté → renvoie un dump pour pouvoir ajuster les sélecteurs
      const debugText = await page.locator('body').innerText().catch(() => '');
      return { success: false, stats: [], error: 'Aucune ligne lue', debugText: debugText.slice(0, 2500) };
    }

    return { success: true, stats };
  } catch (e) {
    return { success: false, stats: [], error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (browser) {
      await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15_000))]).catch(() => {});
    }
  }
}
