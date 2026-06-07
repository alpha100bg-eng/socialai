/**
 * Agent publication store.
 *
 * Dev  → persists to ./data/agent-history.json
 * Prod → in-memory + /tmp/agent-history.json (resets on cold start)
 */

import fs   from 'fs';
import path from 'path';
import { dataPath } from './data-dir';

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
function historyPath(): string {
  if (process.env.NODE_ENV === 'production') return '/tmp/agent-history.json';
  const p = dataPath('agent-history.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

let _cache: Publication[] | null = null;
let _running = false;

function read(): Publication[] {
  if (_cache !== null) return _cache;
  try {
    const raw = fs.readFileSync(historyPath(), 'utf-8');
    _cache = JSON.parse(raw) as Publication[];
  } catch {
    _cache = [];
  }
  return _cache;
}

function write(pubs: Publication[]): void {
  _cache = pubs;
  try {
    fs.writeFileSync(historyPath(), JSON.stringify(pubs, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[agent-store] Could not persist to disk:', e);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function getPublications(limit = 50): Publication[] {
  return read().slice(0, limit);
}

export function getPublication(id: string): Publication | undefined {
  return read().find((p) => p.id === id);
}

export function savePublication(pub: Publication): void {
  const pubs = read();
  const idx  = pubs.findIndex((p) => p.id === pub.id);
  if (idx !== -1) pubs[idx] = pub;
  else            pubs.unshift(pub);
  if (pubs.length > 200) pubs.splice(200);
  write(pubs);
}

export function updatePublication(id: string, patch: Partial<Publication>): void {
  const pubs = read();
  const idx  = pubs.findIndex((p) => p.id === id);
  if (idx !== -1) {
    pubs[idx] = { ...pubs[idx], ...patch };
    write(pubs);
  }
}

export function isRunning():         boolean { return _running; }
export function setRunning(v: boolean): void { _running = v; }

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns true if the given slot already ran (or is running) today */
export function alreadyRanSlot(slot: TimeSlot): boolean {
  const today = todayStr();
  return read().some(
    (p) =>
      p.scheduledFor === today &&
      p.slot === slot &&
      (p.status === 'published' || p.status === 'running' ||
       p.status === 'pending_video' || p.status === 'pending_tiktok'),
  );
}

/** Legacy: true if ANY slot ran today */
export function alreadyRanToday(): boolean {
  return alreadyRanSlot('morning') && alreadyRanSlot('evening');
}

export function getPublishedCount(): number {
  return read().filter((p) => p.status === 'published').length;
}

export function getTotalRuns(): number {
  return read().filter((p) => p.status !== 'running').length;
}
