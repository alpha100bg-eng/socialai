/**
 * Agent publication store — supports multiple TikTok accounts ("profiles").
 *
 * Dev  → persists to ./data/agent-history[-<profileId>].json
 * Prod → persists to PERSISTENT_DATA_DIR (Railway) or /tmp (Vercel)
 *
 * The default profile ('animals', the original account) keeps the
 * legacy filename `agent-history.json` for backward compatibility.
 */

import fs   from 'fs';
import path from 'path';
import { dataPath, IS_VERCEL } from './data-dir';
import { DEFAULT_NICHE } from './niches';

// ─── Types ────────────────────────────────────────────────────────────────────
export type RunStatus =
  | 'running'
  | 'pending_video'
  | 'pending_tiktok'
  | 'published'
  | 'failed';

export type TimeSlot = 'morning' | 'evening';

export interface VideoAnalytics {
  views?:    number;
  likes?:    number;
  comments?: number;
  shares?:   number;
  fetchedAt?: string;
}

export interface Publication {
  id:            string;
  createdAt:     string;
  scheduledFor:  string;  // YYYY-MM-DD
  slot?:         TimeSlot;
  status:        RunStatus;
  topic:         string;
  videoPrompt:   string;
  caption:       string;
  hashtags:      string[];
  falRequestId?: string;
  videoUrl?:     string;
  tikTokPublishId?: string;
  tikTokVideoId?:   string;
  tikTokStatus?:    string;
  tikTokShareUrl?:  string;
  analytics?:       VideoAnalytics;
  error?:        string;
  durationMs?:   number;
  videoReadyAt?: string;
  publishedAt?:  string;
}

// ─── File path ────────────────────────────────────────────────────────────────
const FILE_SUFFIX = (profileId: string) =>
  profileId === DEFAULT_NICHE ? '' : `-${profileId}`;

function historyPath(profileId: string): string {
  const file = `agent-history${FILE_SUFFIX(profileId)}.json`;
  if (IS_VERCEL) return `/tmp/${file}`;
  const p = dataPath(file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

const _cache:   Map<string, Publication[]> = new Map();
const _running: Map<string, boolean>       = new Map();

function read(profileId: string): Publication[] {
  if (_cache.has(profileId)) return _cache.get(profileId)!;
  let pubs: Publication[] = [];
  try {
    const raw = fs.readFileSync(historyPath(profileId), 'utf-8');
    pubs = JSON.parse(raw) as Publication[];
  } catch {
    pubs = [];
  }
  _cache.set(profileId, pubs);
  return pubs;
}

function write(profileId: string, pubs: Publication[]): void {
  _cache.set(profileId, pubs);
  try {
    fs.writeFileSync(historyPath(profileId), JSON.stringify(pubs, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[agent-store:${profileId}] Could not persist to disk:`, e);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function getPublications(profileId: string = DEFAULT_NICHE, limit = 50): Publication[] {
  return read(profileId).slice(0, limit);
}

export function getPublication(profileId: string, id: string): Publication | undefined {
  return read(profileId).find((p) => p.id === id);
}

export function savePublication(profileId: string, pub: Publication): void {
  const pubs = read(profileId);
  const idx  = pubs.findIndex((p) => p.id === pub.id);
  if (idx !== -1) pubs[idx] = pub;
  else            pubs.unshift(pub);
  if (pubs.length > 200) pubs.splice(200);
  write(profileId, pubs);
}

export function updatePublication(profileId: string, id: string, patch: Partial<Publication>): void {
  const pubs = read(profileId);
  const idx  = pubs.findIndex((p) => p.id === id);
  if (idx !== -1) {
    pubs[idx] = { ...pubs[idx], ...patch };
    write(profileId, pubs);
  }
}

export function isRunning(profileId: string = DEFAULT_NICHE): boolean {
  return _running.get(profileId) ?? false;
}
export function setRunning(profileId: string, v: boolean): void {
  _running.set(profileId, v);
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns true if the given slot already ran (or is running) today */
export function alreadyRanSlot(profileId: string, slot: TimeSlot): boolean {
  const today = todayStr();
  return read(profileId).some(
    (p) =>
      p.scheduledFor === today &&
      p.slot === slot &&
      (p.status === 'published' || p.status === 'running' ||
       p.status === 'pending_video' || p.status === 'pending_tiktok'),
  );
}

/** Legacy: true if ANY slot ran today */
export function alreadyRanToday(profileId: string = DEFAULT_NICHE): boolean {
  return alreadyRanSlot(profileId, 'morning') && alreadyRanSlot(profileId, 'evening');
}

export function getPublishedCount(profileId: string = DEFAULT_NICHE): number {
  return read(profileId).filter((p) => p.status === 'published').length;
}

export function getTotalRuns(profileId: string = DEFAULT_NICHE): number {
  return read(profileId).filter((p) => p.status !== 'running').length;
}
