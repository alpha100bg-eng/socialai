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
import os   from 'os';
import { execFileSync }      from 'child_process';
import { uploadViaBrowser } from '../lib/tiktok-browser';
import { dataPath }         from '../lib/data-dir';
import { DEFAULT_NICHE }    from '../lib/niches';

// URL Railway en dur (non secrète) — évite tout souci de secret mal collé.
const RAILWAY = 'https://socialai-production-fb02.up.railway.app';
const CRON    = (process.env.CRON_SECRET || '').trim();
const ADMIN   = (process.env.ADMIN_UPLOAD_SECRET || '').trim();
const PROFILE = (process.env.PROFILE_ID || DEFAULT_NICHE).trim();

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

  // ── 3. Ajoute une musique GRATUITEMENT via ffmpeg (si des musiques existent)
  const localVideo: string | undefined = await addMusic(data.videoUrl);

  // ── 4. Poste sur TikTok (navigateur, runner GitHub) ──────────────────────
  const fullCaption = buildCaption(data.caption ?? '', data.hashtags ?? []);
  console.log('[gh-post] Publication sur TikTok...');
  const result = await uploadViaBrowser(
    { videoUrl: data.videoUrl, videoPath: localVideo, caption: fullCaption, privacy: 'public' },
    PROFILE,
  );

  if (!result.success) throw new Error(`Publication échouée: ${result.error}`);
  console.log('[gh-post] ✅ Publié sur TikTok !');
}

/**
 * Télécharge la vidéo (muette) et y colle une musique aléatoire du dossier
 * music/<profil>/ (ou music/) via ffmpeg — gratuit, sur le runner GitHub.
 * Retourne le chemin du fichier local, ou undefined si pas de musique
 * (dans ce cas on postera la vidéo telle quelle via son URL).
 */
async function addMusic(videoUrl: string): Promise<string | undefined> {
  // Cherche des musiques dans music/<profil>/ puis music/
  const dirs = [path.join('music', PROFILE), 'music'];
  let tracks: string[] = [];
  let musicDir = '';
  for (const d of dirs) {
    if (fs.existsSync(d)) {
      const found = fs.readdirSync(d).filter((f) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(f));
      if (found.length > 0) { tracks = found; musicDir = d; break; }
    }
  }
  if (tracks.length === 0) {
    console.log('[gh-post] Aucune musique trouvée — vidéo postée sans musique ajoutée.');
    return undefined;
  }

  const track = path.join(musicDir, tracks[Math.floor(Math.random() * tracks.length)]);
  console.log(`[gh-post] Musique choisie: ${track}`);

  // Télécharge la vidéo
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'ghpost-'));
  const inVid   = path.join(tmpDir, 'in.mp4');
  const outVid  = path.join(tmpDir, 'out.mp4');
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) { console.warn('[gh-post] Téléchargement vidéo échoué, post sans musique.'); return undefined; }
  fs.writeFileSync(inVid, Buffer.from(await res.arrayBuffer()));

  // Colle la musique (boucle si trop courte, coupe à la longueur de la vidéo)
  try {
    execFileSync('ffmpeg', [
      '-y',
      '-i', inVid,
      '-stream_loop', '-1', '-i', track,
      '-map', '0:v:0', '-map', '1:a:0',
      '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      outVid,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    // Vérifie que le fichier de sortie existe bien et n'est pas vide
    if (!fs.existsSync(outVid) || fs.statSync(outVid).size < 1000) {
      throw new Error('fichier de sortie ffmpeg vide ou manquant');
    }
    console.log(`[gh-post] Musique ajoutée ✓ (${fs.statSync(outVid).size} octets)`);
    return outVid;
  } catch (e) {
    // Erreur VISIBLE (le run échoue en rouge) : ffmpeg + sa sortie d'erreur
    const stderr = (e as { stderr?: Buffer })?.stderr?.toString?.() ?? '';
    const msg    = e instanceof Error ? e.message : String(e);
    throw new Error(`ffmpeg/musique a échoué: ${msg} | ${stderr.slice(-400)}`);
  }
}

main().catch((e) => {
  console.error('[gh-post] ERREUR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
