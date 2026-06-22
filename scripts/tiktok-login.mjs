/**
 * TikTok Session Capture — utilise Microsoft Edge déjà connecté.
 * Usage:  npm run tiktok:login
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'data');

// ─── Profil / niche (5 comptes possibles) ─────────────────────────────────────
const NICHE_IDS  = ['animals', 'motivation', 'food', 'space', 'travel'];
const profileId  = (process.argv[2] || 'animals').toLowerCase();

if (!NICHE_IDS.includes(profileId)) {
  console.log(`\n⚠️  Niche inconnue : "${profileId}"`);
  console.log(`   Niches valides : ${NICHE_IDS.join(', ')}\n`);
  process.exit(1);
}

const suffix   = profileId === 'animals' ? '' : `-${profileId}`;
const OUT_FILE = join(DATA_DIR, `tiktok-session${suffix}.json`);

const EDGE_EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// Compte "animals" (le tout premier) → réutilise ton profil Edge déjà connecté.
// Les autres comptes → profil Edge isolé dédié, pour ne pas mélanger les comptes TikTok.
const EDGE_PROFILE = profileId === 'animals'
  ? `C:\\Users\\ALPHA\\AppData\\Local\\Microsoft\\Edge\\User Data`
  : join(DATA_DIR, 'browser-profiles', profileId);

function waitForEnter(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(msg, () => { rl.close(); resolve(); }));
}

// ─── Ferme Edge si ouvert (ignore si pas lancé) ───────────────────────────────
console.log(`\n🐾 TikTok Session Capture — profil "${profileId}"\n`);

if (profileId === 'animals') {
  console.log('🔄 Fermeture de Microsoft Edge...');
  try { execSync('taskkill /F /IM msedge.exe /T', { stdio: 'pipe' }); } catch { /* Edge n\'était pas ouvert */ }
  await new Promise(r => setTimeout(r, 2500));
} else {
  if (!existsSync(EDGE_PROFILE)) mkdirSync(EDGE_PROFILE, { recursive: true });
}

// ─── Lance Edge avec le bon profil ───────────────────────────────────────────
console.log(profileId === 'animals'
  ? '🚀 Ouverture de Edge avec ton profil (déjà connecté à TikTok)...\n'
  : `🚀 Ouverture d'une fenêtre Edge isolée pour le compte "${profileId}"...\n`);

const context = await chromium.launchPersistentContext(EDGE_PROFILE, {
  executablePath: EDGE_EXE,
  headless: false,
  args: [
    '--profile-directory=Default',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
  viewport: null,
});

const page = await context.newPage();

console.log('📌 Instructions :');
console.log('   1. Edge va s\'ouvrir sur tiktok.com');
console.log(`   2. Connecte-toi avec le compte TikTok du profil "${profileId}"`);
console.log('   3. Une fois sur la page d\'accueil TikTok');
console.log('   4. Reviens ici et appuie sur ENTRÉE\n');

await page.goto('https://www.tiktok.com', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
}).catch(() => {});

await waitForEnter('✅ Tu es sur TikTok et connecté ? Appuie sur ENTRÉE → ');

console.log('\n💾 Sauvegarde en cours...');
await page.waitForTimeout(2000);

const cookies = await context.cookies('https://www.tiktok.com');
const storage = await context.storageState();

const sessionCookie = cookies.find(c => c.name === 'sessionid');
if (!sessionCookie) {
  console.log('\n⚠️  Cookie "sessionid" introuvable — tu n\'es pas connecté à TikTok.');
  console.log('   Reconnecte-toi dans le navigateur, puis relance npm run tiktok:login\n');
  await context.close();
  process.exit(1);
}

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ cookies, storage }, null, 2), 'utf-8');

console.log(`\n✅ Session sauvegardée pour "${profileId}" ! (${cookies.length} cookies dont sessionid)`);
console.log(`   Fichier : ${OUT_FILE}`);
console.log('\n🚀 Prochaine étape :');
console.log('   npm run dev  →  http://localhost:3000/agent  (sélectionne le profil dans le menu)\n');

await context.close();
process.exit(0);
