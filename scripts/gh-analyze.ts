/**
 * Robot d'apprentissage — exécuté par GitHub Actions (1×/jour).
 *
 *   1. Récupère la session TikTok depuis Railway
 *   2. Lit les stats (vues/likes/commentaires) via TikTok Studio (navigateur)
 *   3. Envoie les stats à Railway → met à jour la mémoire adaptative de l'agent
 *
 * Secrets : CRON_SECRET, ADMIN_UPLOAD_SECRET, PROFILE_ID (def: animals)
 */

import fs   from 'fs';
import path from 'path';
import { readPostAnalytics } from '../lib/tiktok-analytics-browser';
import { dataPath }          from '../lib/data-dir';
import { DEFAULT_NICHE }     from '../lib/niches';

const RAILWAY = 'https://socialai-production-fb02.up.railway.app';
const CRON    = (process.env.CRON_SECRET || '').trim();
const ADMIN   = (process.env.ADMIN_UPLOAD_SECRET || '').trim();
const PROFILE = (process.env.PROFILE_ID || DEFAULT_NICHE).trim();

async function main() {
  console.log(`[gh-analyze] Profil: ${PROFILE}`);

  // 1. Session
  const sres = await fetch(`${RAILWAY}/api/admin/download-session?profileId=${PROFILE}`, {
    headers: { Authorization: `Bearer ${ADMIN}` },
  });
  if (!sres.ok) throw new Error(`Session indisponible (${sres.status})`);
  const suffix   = PROFILE === DEFAULT_NICHE ? '' : `-${PROFILE}`;
  const sessFile = dataPath(`tiktok-session${suffix}.json`);
  fs.mkdirSync(path.dirname(sessFile), { recursive: true });
  fs.writeFileSync(sessFile, await sres.text(), 'utf-8');

  // 2. Lecture des stats
  console.log('[gh-analyze] Lecture des stats TikTok...');
  const result = await readPostAnalytics(PROFILE);
  if (!result.success) {
    console.error('[gh-analyze] Échec lecture stats:', result.error);
    if (result.debugText) console.error('[gh-analyze] DUMP PAGE:\n' + result.debugText);
    throw new Error(`Lecture stats échouée: ${result.error}`);
  }
  console.log(`[gh-analyze] ${result.stats.length} vidéos lues:`);
  for (const s of result.stats) {
    console.log(`  • "${s.desc.slice(0, 40)}" → ${s.views} vues, ${s.likes} likes, ${s.comments} comm.`);
  }

  // 3. Envoi à la mémoire (Railway)
  const lres = await fetch(`${RAILWAY}/api/agent/learn`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CRON}` },
    body:    JSON.stringify({ profileId: PROFILE, stats: result.stats }),
  });
  const ldata = await lres.json();
  console.log('[gh-analyze] Apprentissage:', JSON.stringify(ldata));
  console.log('[gh-analyze] ✅ Terminé');
}

main().catch((e) => {
  console.error('[gh-analyze] ERREUR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
