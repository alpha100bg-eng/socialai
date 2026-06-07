import Dexie, { type Table } from 'dexie';
import type { Generation, FreemiumState } from './types';

const FREE_LIMIT = 10;

// ─── IndexedDB ────────────────────────────────────────────────────────────────
class SocialAIDB extends Dexie {
  generations!: Table<Generation>;

  constructor() {
    super('SocialAIDB');
    this.version(1).stores({
      generations: '++id, platform, contentType, createdAt',
    });
  }
}

export const db = new SocialAIDB();

export async function saveGeneration(gen: Omit<Generation, 'id'>): Promise<number> {
  return db.generations.add(gen) as Promise<number>;
}

export async function getGenerations(): Promise<Generation[]> {
  return db.generations.orderBy('createdAt').reverse().limit(50).toArray();
}

export async function deleteGeneration(id: number): Promise<void> {
  return db.generations.delete(id);
}

export async function clearAll(): Promise<void> {
  return db.generations.clear();
}

// ─── Freemium (localStorage) ──────────────────────────────────────────────────
const STORAGE_KEY = 'socialai_freemium';

export function getFreemiumState(): FreemiumState {
  if (typeof window === 'undefined') return { used: 0, limit: FREE_LIMIT, isPremium: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { used: 0, limit: FREE_LIMIT, isPremium: false };
    return { limit: FREE_LIMIT, ...JSON.parse(raw) };
  } catch {
    return { used: 0, limit: FREE_LIMIT, isPremium: false };
  }
}

export function incrementUsage(): FreemiumState {
  const state = getFreemiumState();
  const next = { ...state, used: state.used + 1 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function unlockPremium(): void {
  const state = getFreemiumState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, isPremium: true }));
}

export function canGenerate(): boolean {
  const { used, limit, isPremium } = getFreemiumState();
  return isPremium || used < limit;
}
