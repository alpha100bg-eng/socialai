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
const OUT_FILE  = join(DATA_DIR, 'tiktok-session.json');

const EDGE_EXE     = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EDGE_PROFILE = `C:\\Users\\ALPHA\\AppData\\Local\\Microsoft\\Edge\\User Data`;

function waitForEnter(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(msg, () => { rl.close(); resolve(); }));
}

// ─── Ferme Edge si ouvert (ignore si pas lancé) ───────────────────────────────
console.log('\n🐾 TikTok Session Capture\n');
console.log('🔄 Fermeture de Microsoft Edge...');
try { execSync('taskkill /F /IM msedge.exe /T', { stdio: 'pipe' }); } catch { /* Edge n\'était pas ouvert */ }
await new Promise(r => setTimeout(r, 2500));

// ─── Lance Edge avec ton profil existant ─────────────────────────────────────
console.log('🚀 Ouverture de Edge avec ton profil (déjà connecté à TikTok)...\n');

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
console.log('   2. Si pas connecté → connecte-toi maintenant');
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

console.log(`\n✅ Session sauvegardée ! (${cookies.length} cookies dont sessionid)`);
console.log(`   Fichier : ${OUT_FILE}`);
console.log('\n🚀 Prochaine étape :');
console.log('   npm run dev  →  http://localhost:3000/agent\n');

await context.close();
process.exit(0);
