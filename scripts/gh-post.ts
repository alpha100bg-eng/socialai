/**
 * Robot de publication TikTok — exécuté par GitHub Actions (PC éteint, 24/7).
 *
 * Étapes :
 *   1. Demande à Railway de générer le contenu du jour (vidéo + caption)
 *   2. Récupère la session TikTok depuis Railway
 *   3. Poste la vidéo sur TikTok via le navigateur (sur le runner GitHub costaud)
 *
 * Variables d'env attendues (secrets GitHub) :
 *   RAILWAY_URL          (def: https://socialai-production-fb02.up.railway.app)
 *   CRON_SECRET          (auth de /api/agent/daily-run)
 *   ADMIN_UPLOAD_SECRET  (auth de /api/admin/download-session)
 *   PROFILE_ID           (def: animals)
 */

import fs   from 'fs';
import path from 'path';
import { uploadViaBrowser } from '../lib/tiktok-browser';
import { dataPath }         from '../lib/data-dir';
import { DEFAULT_NICHE }    from '../lib/niches';

const RAILWAY = process.env.RAILWAY_URL || 'https://socialai-production-fb02.up.railway.app';
const CRON    = process.env.CRON_SECRET || '';
const ADMIN   = process.env.ADMIN_UPLOAD_SECRET || '';
const PROFILE = process.env.PROFILE_ID || DEFAULT_NICHE;

function buildCaption(caption: string, hashtags: string[]): string {
  const tags = (hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  return `${caption}\n\n${tags}`.slice(0, 2200);
}

async function main() {
  console.log(`[gh-post] Profil: ${PROFILE} — serveur: ${RAILWAY}`);

  // ── 1. Récupère la session TikTok depuis Railway ─────────────────────────
  console.log('[gh-post] Téléchargement de la session TikTok...');
  const sres = await fetch(`${RAILWAY}/api/admin/download-session?profileId=${PROFILE}`, {
    headers: { Authorization: `Bearer ${ADMIN}` },
  });
  if (!sres.ok) throw new Error(`Session indisponible (${sres.status})`);
  const sessionJson = await sres.text();

  const suffix   = PROFILE === DEFAULT_NICHE ? '' : `-${PROFILE}`;
  const sessFile = dataPath(`tiktok-session${suffix}.json`);
  fs.mkdirSync(path.dirname(sessFile), { recursive: true });
  fs.writeFileSync(sessFile, sessionJson, 'utf-8');
  console.log(`[gh-post] Session écrite: ${sessFile}`);

  // ── 2. Génère le contenu du jour via Railway ─────────────────────────────
  console.log('[gh-post] Génération du contenu (Railway)...');
  const gres = await fetch(`${RAILWAY}/api/agent/daily-run`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CRON}` },
    body:    JSON.stringify({ force: true, profileId: PROFILE }),
  });
  const data = await gres.json() as {
    videoUrl?: string; caption?: string; hashtags?: string[]; topic?: string; error?: string;
  };
  if (!data.videoUrl) throw new Error(`Génération échouée: ${data.error ?? JSON.stringify(data)}`);
  console.log(`[gh-post] Vidéo prête: ${data.topic}`);

  // ── 3. Poste sur TikTok (navigateur, runner GitHub) ──────────────────────
  const fullCaption = buildCaption(data.caption ?? '', data.hashtags ?? []);
  console.log('[gh-post] Publication sur TikTok...');
  const result = await uploadViaBrowser(
    { videoUrl: data.videoUrl, caption: fullCaption, privacy: 'public' },
    PROFILE,
  );

  if (!result.success) throw new Error(`Publication échouée: ${result.error}`);
  console.log('[gh-post] ✅ Publié sur TikTok !');
}

main().catch((e) => {
  console.error('[gh-post] ERREUR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
