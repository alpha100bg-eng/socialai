import fs   from 'fs';
import path from 'path';
import { dataPath } from './data-dir';

export interface TikTokConfig {
  accessToken:  string;
  refreshToken: string;
  openId:       string;
  expiresAt:    string; // ISO datetime
}

function configPath(): string {
  if (process.env.NODE_ENV === 'production') return '/tmp/tiktok-tokens.json';
  const p = dataPath('tiktok-tokens.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

let _cache: TikTokConfig | null | undefined = undefined;

// Returns tokens from file (OAuth UI flow) or env vars (manual setup), in that order.
export function getTikTokConfig(): TikTokConfig | null {
  // File-based tokens (set via OAuth flow in the UI) take priority
  if (_cache === undefined) {
    try {
      const raw = fs.readFileSync(configPath(), 'utf-8');
      _cache = JSON.parse(raw) as TikTokConfig;
    } catch {
      _cache = null;
    }
  }

  if (_cache?.accessToken) return _cache;

  // Fall back to env vars (manual .env.local setup)
  const envToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (envToken && envToken !== 'your_tiktok_access_token') {
    return {
      accessToken:  envToken,
      refreshToken: process.env.TIKTOK_REFRESH_TOKEN ?? '',
      openId:       '',
      expiresAt:    '',
    };
  }

  return null;
}

export function saveTikTokConfig(config: TikTokConfig): void {
  _cache = config;
  try {
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[tiktok-config] Could not persist to disk:', e);
  }
}

export function clearTikTokConfig(): void {
  _cache = null;
  try {
    const p = configPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch { /* ignore */ }
}
