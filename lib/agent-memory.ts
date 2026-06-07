/**
 * Agent Memory — persistent learning system for the TikTok animal agent.
 *
 * Stores what works (bestHooks, bestTopics) and what to avoid (failedStyles).
 * Used to improve prompts over time based on real TikTok performance.
 *
 * File location:
 *   Dev  → data/agent-memory.json
 *   Prod → /tmp/agent-memory.json (resets on cold start — use KV in prod)
 */

import fs   from 'fs';
import path from 'path';
import type { Publication } from './agent-store';
import { dataPath } from './data-dir';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PerformanceRecord {
  publicationId:   string;
  topic:           string;
  slot:            string;
  views:           number;
  likes:           number;
  comments:        number;
  shares:          number;
  engagementRate:  number;  // (likes + comments*2 + shares*3) / views
  score:           number;  // 0–10 quality score
  recordedAt:      string;
}

export interface AgentMemory {
  bestHooks:          string[];            // top-performing hook starters
  bestTopics:         string[];            // topic patterns that got high engagement
  failedStyles:       string[];            // patterns that underperformed (<2 score)
  avgScore:           number;              // rolling average 0–10
  totalPublished:     number;
  recentPerformance:  PerformanceRecord[]; // last 30 records
  lastUpdated:        string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MEMORY: AgentMemory = {
  bestHooks:         [],
  bestTopics:        [],
  failedStyles:      [],
  avgScore:          0,
  totalPublished:    0,
  recentPerformance: [],
  lastUpdated:       new Date().toISOString(),
};

// ─── Persistence ─────────────────────────────────────────────────────────────

function memoryPath(): string {
  if (process.env.NODE_ENV === 'production') return '/tmp/agent-memory.json';
  const p = dataPath('agent-memory.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

export function loadMemory(): AgentMemory {
  try {
    const raw = fs.readFileSync(memoryPath(), 'utf-8');
    return { ...DEFAULT_MEMORY, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

export function saveMemory(memory: AgentMemory): void {
  try {
    const updated = { ...memory, lastUpdated: new Date().toISOString() };
    fs.writeFileSync(memoryPath(), JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[agent-memory] Save failed:', e);
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Compute a 0–10 quality score from engagement metrics.
 * Benchmarks: score<3=poor, 3-6=ok, 6-8=good, 8+=viral
 */
function computeScore(views: number, likes: number, comments: number, shares: number): number {
  if (views === 0) return 0;
  // Weighted engagement: shares most valuable, then comments, then likes
  const weightedEngagement = (likes + comments * 2 + shares * 3) / views;
  // Normalize: 1% weighted engagement = score ~2, 5% = ~7, 10% = ~10
  return Math.min(10, weightedEngagement * 70);
}

// ─── Learning API ─────────────────────────────────────────────────────────────

/**
 * Record a video's performance and update the memory with learned patterns.
 * Returns the updated memory (caller must call saveMemory to persist).
 */
export function recordPerformance(
  pub:      Publication,
  views:    number,
  likes:    number,
  comments: number,
  shares:   number,
  memory:   AgentMemory,
): AgentMemory {
  const score          = computeScore(views, likes, comments, shares);
  const engagementRate = views > 0 ? (likes + comments * 2 + shares * 3) / views : 0;

  const record: PerformanceRecord = {
    publicationId: pub.id,
    topic:         pub.topic,
    slot:          pub.slot ?? 'morning',
    views, likes, comments, shares,
    engagementRate,
    score,
    recordedAt: new Date().toISOString(),
  };

  const recentPerformance = [record, ...memory.recentPerformance].slice(0, 30);

  // ── Update bestTopics (top 10) ───────────────────────────────────────────
  let bestTopics   = [...memory.bestTopics];
  let failedStyles = [...memory.failedStyles];

  const topicSnippet = pub.topic.slice(0, 80);
  if (score >= 7 && !bestTopics.some((t) => t.includes(topicSnippet.slice(0, 20)))) {
    bestTopics = [topicSnippet, ...bestTopics].slice(0, 10);
  } else if (score < 2.5 && !failedStyles.some((f) => f.includes(topicSnippet.slice(0, 20)))) {
    failedStyles = [topicSnippet, ...failedStyles].slice(0, 10);
  }

  // ── Update bestHooks (first sentence of caption) ─────────────────────────
  let bestHooks = [...memory.bestHooks];
  if (score >= 7 && pub.caption) {
    const hookLine = pub.caption.split(/[.\n]/)[0]?.trim() ?? '';
    if (hookLine.length > 15 && !bestHooks.some((h) => h.includes(hookLine.slice(0, 20)))) {
      bestHooks = [hookLine, ...bestHooks].slice(0, 10);
    }
  }

  // ── Rolling average ───────────────────────────────────────────────────────
  const scores  = recentPerformance.map((r) => r.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    ...memory,
    bestHooks,
    bestTopics,
    failedStyles,
    avgScore,
    totalPublished: memory.totalPublished + 1,
    recentPerformance,
  };
}

// ─── Prompt Boost ─────────────────────────────────────────────────────────────

/**
 * Generate a prompt context block from learned patterns.
 * Injected into Groq prompts so the agent learns from past performance.
 */
export function getMemoryBoost(memory: AgentMemory): string {
  if (memory.totalPublished === 0) return '';

  const parts: string[] = [
    `\n\n---\nLEARNED FROM ${memory.totalPublished} PUBLISHED VIDEOS (avg score: ${memory.avgScore.toFixed(1)}/10):`,
  ];

  if (memory.bestTopics.length > 0) {
    parts.push(
      `\nHIGH-ENGAGEMENT TOPIC PATTERNS — use as inspiration:\n` +
      memory.bestTopics.slice(0, 5).map((t) => `• ${t}`).join('\n'),
    );
  }

  if (memory.bestHooks.length > 0) {
    parts.push(
      `\nPROVEN HOOK STARTERS — adapt the style:\n` +
      memory.bestHooks.slice(0, 3).map((h) => `• ${h}`).join('\n'),
    );
  }

  if (memory.failedStyles.length > 0) {
    parts.push(
      `\nAVOID THESE (poor engagement):\n` +
      memory.failedStyles.slice(0, 5).map((f) => `• ${f}`).join('\n'),
    );
  }

  return parts.join('\n');
}

/**
 * Returns the most recent topic strings for trend deduplication.
 */
export function getRecentTopics(memory: AgentMemory, limit = 10): string[] {
  return memory.recentPerformance.slice(0, limit).map((r) => r.topic);
}
