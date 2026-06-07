/**
 * Trend Engine — fetches viral animal content signals from Reddit.
 *
 * - Queries 5 animal subreddits (no API key needed — public JSON)
 * - Caches results for 2 hours to avoid rate limits
 * - Scores trends by upvotes + comment weight
 * - Converts Reddit titles into usable TikTok topic hints
 */

import fs   from 'fs';
import path from 'path';
import { dataPath } from './data-dir';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrendingTopic {
  title:      string;
  score:      number;      // Reddit upvotes
  comments:   number;      // comment count
  subreddit:  string;
  trendScore: number;      // composite engagement score
}

interface TrendCache {
  fetchedAt: string;
  topics:    TrendingTopic[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SUBREDDITS     = ['aww', 'AnimalsBeingBros', 'NatureIsFuckingLit', 'rarepuppers', 'likeus'];
const CACHE_TTL_MS   = 2 * 60 * 60 * 1000; // 2 hours
const FETCH_TIMEOUT  = 8_000;

// ─── Persistence ─────────────────────────────────────────────────────────────

function cachePath(): string {
  if (process.env.NODE_ENV === 'production') return '/tmp/trend-cache.json';
  const p = dataPath('trend-cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

function loadCache(): TrendCache | null {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf-8');
    const cache = JSON.parse(raw) as TrendCache;
    if (Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS) return cache;
    return null;
  } catch { return null; }
}

function saveCache(cache: TrendCache): void {
  try { fs.writeFileSync(cachePath(), JSON.stringify(cache, null, 2), 'utf-8'); }
  catch { /* ignore write errors in prod */ }
}

// ─── Reddit Fetcher ───────────────────────────────────────────────────────────

interface RedditPost {
  title:        string;
  score:        number;
  num_comments: number;
  permalink:    string;
  over_18:      boolean;
  is_video:     boolean;
}

interface RedditResponse {
  data?: { children?: Array<{ data: RedditPost }> };
}

async function fetchSubreddit(subreddit: string): Promise<TrendingTopic[]> {
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=8&t=day`,
      {
        headers: { 'User-Agent': 'TikTokAnimalBot/2.0 (content-research)' },
        signal:  AbortSignal.timeout(FETCH_TIMEOUT),
      },
    );
    if (!res.ok) return [];

    const data = await res.json() as RedditResponse;

    return (data.data?.children ?? [])
      .filter(({ data: p }) => !p.over_18 && p.score > 100)
      .map(({ data: p }) => ({
        title:      p.title,
        score:      p.score,
        comments:   p.num_comments,
        subreddit,
        trendScore: p.score + p.num_comments * 8,  // comments weighted higher (engagement)
      }));
  } catch {
    return [];  // silently fail — Reddit may be rate-limiting
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetch trending animal topics from Reddit (cached 2h). Falls back gracefully. */
export async function fetchTrendingTopics(): Promise<TrendingTopic[]> {
  const cached = loadCache();
  if (cached) return cached.topics;

  const results = await Promise.allSettled(SUBREDDITS.map(fetchSubreddit));
  const topics  = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 25);

  if (topics.length > 0) saveCache({ fetchedAt: new Date().toISOString(), topics });
  return topics;
}

/**
 * Select the best trending topic, avoiding recently used ones.
 * Falls back to the top trend if all are recent.
 */
export function selectBestTrend(
  topics:        TrendingTopic[],
  recentTopics:  string[] = [],
): TrendingTopic | null {
  if (topics.length === 0) return null;

  const recentSnippets = recentTopics.map((t) => t.toLowerCase().slice(0, 30));

  const fresh = topics.filter(
    (t) => !recentSnippets.some((r) => t.title.toLowerCase().includes(r)),
  );

  return (fresh[0] ?? topics[0]) ?? null;
}

/**
 * Convert a Reddit trending title into a short context hint for Groq.
 * Strips Reddit-specific tags like [OC], (xpost), etc.
 */
export function trendToContext(trend: TrendingTopic): string {
  const cleaned = trend.title
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return `Trending on r/${trend.subreddit} with ${trend.trendScore.toLocaleString()} engagement: "${cleaned}"`;
}
