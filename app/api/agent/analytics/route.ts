/**
 * GET /api/agent/analytics
 *
 * Fetches video performance from TikTok Video API and syncs with agent store.
 * Requires TikTok scope: video.list
 */

import { NextResponse }                from 'next/server';
import { getTikTokConfig }              from '@/lib/tiktok-config';
import { listVideos }                   from '@/lib/tiktok-comments';
import { getPublications, updatePublication } from '@/lib/agent-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getTikTokConfig();
  if (!config?.accessToken) {
    return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  }

  try {
    const videos = await listVideos(config.accessToken, 20);

    // Sync analytics back into agent-store publications
    const publications = getPublications(50);
    for (const video of videos) {
      const pub = publications.find(
        (p) => p.tikTokPublishId === video.id || p.tikTokVideoId === video.id,
      );
      if (pub) {
        updatePublication(pub.id, {
          tikTokVideoId: video.id,
          analytics: {
            views:    video.viewCount,
            likes:    video.likeCount,
            comments: video.commentCount,
            shares:   video.shareCount,
            fetchedAt: new Date().toISOString(),
          },
        });
      }
    }

    // Return aggregated stats
    const totalViews    = videos.reduce((s, v) => s + (v.viewCount    ?? 0), 0);
    const totalLikes    = videos.reduce((s, v) => s + (v.likeCount    ?? 0), 0);
    const totalComments = videos.reduce((s, v) => s + (v.commentCount ?? 0), 0);
    const totalShares   = videos.reduce((s, v) => s + (v.shareCount   ?? 0), 0);

    const topVideo = videos.reduce(
      (best, v) => (v.viewCount ?? 0) > (best.viewCount ?? 0) ? v : best,
      videos[0] ?? null,
    );

    return NextResponse.json({
      videos,
      totals: { views: totalViews, likes: totalLikes, comments: totalComments, shares: totalShares },
      topVideo,
      engagementRate: totalViews > 0
        ? (((totalLikes + totalComments + totalShares) / totalViews) * 100).toFixed(2)
        : '0.00',
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
