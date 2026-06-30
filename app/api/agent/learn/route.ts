/**
 * POST /api/agent/learn
 *
 * Reçoit les statistiques (vues/likes/commentaires) scrappées par le robot
 * GitHub, les rattache aux publications, met à jour la mémoire adaptative
 * (sujets/hooks qui marchent vs qui floppent). Protégé par CRON_SECRET.
 *
 * Body: { profileId, stats: [{ desc, views, likes, comments, shares }] }
 */

import { NextRequest, NextResponse }                 from 'next/server';
import { getPublications, updatePublication, type Publication } from '@/lib/agent-store';
import { loadMemory, saveMemory, recordPerformance } from '@/lib/agent-memory';
import { DEFAULT_NICHE }                              from '@/lib/niches';

export const dynamic = 'force-dynamic';

interface StatItem { desc: string; views: number; likes: number; comments: number; shares: number; }

/** Normalise un texte pour comparaison (minuscules, alphanum seulement). */
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Trouve la publication qui correspond le mieux à une description scrappée. */
function matchPub(pubs: Publication[], desc: string): Publication | undefined {
  const d = norm(desc);
  if (!d) return undefined;
  for (const p of pubs) {
    const cap   = norm(p.caption);
    const topic = norm(p.topic);
    const key   = cap.slice(0, 20) || topic.slice(0, 20);
    if (key.length >= 8 && (d.includes(key) || cap.includes(d.slice(0, 20)))) return p;
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body      = await req.json().catch(() => ({})) as { profileId?: string; stats?: StatItem[] };
  const profileId = body.profileId || DEFAULT_NICHE;
  const stats     = Array.isArray(body.stats) ? body.stats : [];

  const pubs   = getPublications(profileId, 50);
  let   memory = loadMemory(profileId);
  let   scored = 0;
  let   matched = 0;

  for (const item of stats) {
    const pub = matchPub(pubs, item.desc);
    if (!pub) continue;
    matched++;

    // Stocke les analytics sur la publication
    updatePublication(profileId, pub.id, {
      analytics: {
        views:    item.views    ?? 0,
        likes:    item.likes    ?? 0,
        comments: item.comments ?? 0,
        shares:   item.shares   ?? 0,
        fetchedAt: new Date().toISOString(),
      },
    });

    // N'apprend qu'une fois par publication, et seulement si elle a des vues
    if ((item.views ?? 0) > 0 && !memory.recentPerformance.some((r) => r.publicationId === pub.id)) {
      memory = recordPerformance(pub, item.views, item.likes, item.comments, item.shares, memory);
      scored++;
    }
  }

  saveMemory(profileId, memory);

  return NextResponse.json({
    success: true,
    received: stats.length,
    matched,
    scored,
    memory: {
      totalPublished:    memory.totalPublished,
      avgScore:          memory.avgScore.toFixed(2),
      bestTopicsCount:   memory.bestTopics.length,
      bestHooksCount:    memory.bestHooks.length,
      failedStylesCount: memory.failedStyles.length,
    },
  });
}
