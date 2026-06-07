/**
 * POST /api/agent/feedback
 *
 * Feedback loop: fetches TikTok analytics for recent publications,
 * scores their performance, and updates agent memory so future
 * content adapts to what works.
 *
 * Called by Vercel Cron 6 hours after each daily-run:
 *   - 14:00 UTC (morning slot feedback)
 *   - 00:00 UTC (evening slot feedback)
 *
 * Also callable manually from the dashboard.
 */

import { NextRequest, NextResponse }                         from 'next/server';
import { getPublications, updatePublication }                from '@/lib/agent-store';
import { getTikTokConfig }                                   from '@/lib/tiktok-config';
import { listVideos }                                        from '@/lib/tiktok-comments';
import { loadMemory, saveMemory, recordPerformance }         from '@/lib/agent-memory';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const memory = loadMemory();
  const config = getTikTokConfig();

  // ── If TikTok connected → fetch real analytics ────────────────────────────
  if (config?.accessToken) {
    try {
      const videos = await listVideos(config.accessToken, 30);
      const pubs   = getPublications(50);
      let updated  = memory;
      let count    = 0;

      for (const video of videos) {
        const pub = pubs.find(
          (p) => p.tikTokVideoId === video.id || p.tikTokPublishId === video.id,
        );
        if (!pub) continue;

        // Update analytics in publication store
        updatePublication(pub.id, {
          tikTokVideoId: video.id,
          analytics: {
            views:    video.viewCount    ?? 0,
            likes:    video.likeCount    ?? 0,
            comments: video.commentCount ?? 0,
            shares:   video.shareCount   ?? 0,
            fetchedAt: new Date().toISOString(),
          },
        });

        // Only score if we have some real data (views > 0)
        if ((video.viewCount ?? 0) > 0) {
          updated = recordPerformance(
            pub,
            video.viewCount    ?? 0,
            video.likeCount    ?? 0,
            video.commentCount ?? 0,
            video.shareCount   ?? 0,
            updated,
          );
          count++;
        }
      }

      saveMemory(updated);

      return NextResponse.json({
        success: true,
        source:  'tiktok_api',
        scored:  count,
        memory:  {
          totalPublished:    updated.totalPublished,
          avgScore:          updated.avgScore.toFixed(2),
          bestTopicsCount:   updated.bestTopics.length,
          bestHooksCount:    updated.bestHooks.length,
          failedStylesCount: updated.failedStyles.length,
        },
      });
    } catch (err) {
      console.warn('[feedback] TikTok fetch failed, falling back to local data:', err);
    }
  }

  // ── Fallback: use analytics already stored locally ────────────────────────
  const pubs   = getPublications(20);
  let updated  = memory;
  let count    = 0;

  for (const pub of pubs) {
    if (!pub.analytics || (pub.analytics.views ?? 0) === 0) continue;
    // Skip if already in recentPerformance
    if (updated.recentPerformance.some((r) => r.publicationId === pub.id)) continue;

    updated = recordPerformance(
      pub,
      pub.analytics.views    ?? 0,
      pub.analytics.likes    ?? 0,
      pub.analytics.comments ?? 0,
      pub.analytics.shares   ?? 0,
      updated,
    );
    count++;
  }

  saveMemory(updated);

  return NextResponse.json({
    success: true,
    source:  'local_store',
    scored:  count,
    memory:  {
      totalPublished:    updated.totalPublished,
      avgScore:          updated.avgScore.toFixed(2),
      bestTopicsCount:   updated.bestTopics.length,
      bestHooksCount:    updated.bestHooks.length,
      failedStylesCount: updated.failedStyles.length,
    },
  });
}
