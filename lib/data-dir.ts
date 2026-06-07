/**
 * Resolves the project `data/` directory reliably, regardless of whether
 * Next.js sets process.cwd() to the monorepo root or the socialai subdir.
 *
 * Next.js 16 with a monorepo can set cwd = C:\Users\ALPHA\cryptoiq (root)
 * instead of C:\Users\ALPHA\cryptoiq\socialai, breaking all path.join(cwd, 'data').
 */

import fs   from 'fs';
import path from 'path';

/**
 * Vercel's filesystem is read-only except /tmp, and /tmp is wiped on every
 * cold start — fine for Vercel (stateless by design), but WRONG for a
 * persistent server like Railway/Render where we want data to survive restarts.
 *
 * Detection:
 *   - Vercel sets process.env.VERCEL = '1'
 *   - Railway/Render run a normal long-lived Node process with a writable FS
 *     (optionally backed by a mounted volume at PERSISTENT_DATA_DIR)
 */
export const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;

function findDataDir(): string {
  if (IS_VERCEL) return '/tmp';

  // On a persistent host (Railway/Render/VPS), prefer an explicit mounted
  // volume path if provided — this is what makes data survive redeploys.
  if (process.env.PERSISTENT_DATA_DIR) {
    fs.mkdirSync(process.env.PERSISTENT_DATA_DIR, { recursive: true });
    return process.env.PERSISTENT_DATA_DIR;
  }

  // Walk up from __dirname (lib/) looking for the package.json that
  // belongs to socialai — that's the true project root.
  const candidates = [
    path.join(process.cwd(), 'data'),                      // cwd = socialai/
    path.join(process.cwd(), 'socialai', 'data'),          // cwd = monorepo root
    path.join(__dirname, '..', 'data'),                    // relative to lib/
    path.join(__dirname, '..', '..', 'socialai', 'data'), // compiled .next/
  ];

  // Return the first candidate whose parent dir contains a package.json
  // that belongs to socialai (has "socialai" in its name field or scripts)
  for (const candidate of candidates) {
    const parentPkg = path.join(path.dirname(candidate), 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(parentPkg, 'utf-8'));
      if (pkg.name === 'socialai' || pkg.scripts?.['tiktok:login']) {
        return candidate;
      }
    } catch { /* keep trying */ }
  }

  // Last resort: return the first existing candidate
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

// Resolved once at module load — deterministic for the lifetime of the process
export const DATA_DIR = findDataDir();

export function dataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}
