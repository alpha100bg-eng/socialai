/**
 * GET  /api/agent/comments?videoId=xxx  — list comments on a video
 * POST /api/agent/comments              — AI reply to a comment
 * PUT  /api/agent/comments              — like a comment
 *
 * Requires TikTok scopes: comment.list, comment.create, comment.like
 */

import { NextRequest, NextResponse }        from 'next/server';
import { getTikTokConfig }                   from '@/lib/tiktok-config';
import { listComments, replyToComment, likeComment } from '@/lib/tiktok-comments';
import { getPublications }                   from '@/lib/agent-store';
import { buildCommentReplyPrompt }           from '@/lib/content-prompts';
import { getNiche, DEFAULT_NICHE }           from '@/lib/niches';

export const dynamic = 'force-dynamic';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

async function groq(prompt: string): Promise<string> {
  const res  = await fetch(GROQ_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  80,
      temperature: 0.85,
      messages:    [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── GET: list comments for a video ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const config = getTikTokConfig();
  if (!config?.accessToken) {
    return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  }

  const videoId = new URL(req.url).searchParams.get('videoId');
  if (!videoId) {
    return NextResponse.json({ error: 'videoId required' }, { status: 400 });
  }

  try {
    const comments = await listComments(config.accessToken, videoId, 30);
    return NextResponse.json({ comments });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ── POST: AI-generate + post a reply ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const config = getTikTokConfig();
  if (!config?.accessToken) {
    return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  }

  const { videoId, commentId, commentText, previousReplies, profileId } = await req.json();
  if (!videoId || !commentId || !commentText) {
    return NextResponse.json({ error: 'videoId, commentId, commentText required' }, { status: 400 });
  }

  const niche = getNiche(profileId || DEFAULT_NICHE);

  // Find video topic from store to give context
  const publications = getPublications(profileId || DEFAULT_NICHE, 50);
  const pub = publications.find((p) => p.tikTokVideoId === videoId || p.tikTokPublishId);
  const videoTopic = pub?.topic ?? 'an amazing moment';

  // Generate AI reply
  const replyText = await groq(
    buildCommentReplyPrompt(niche, videoTopic, commentText, previousReplies ?? []),
  );

  if (!replyText) {
    return NextResponse.json({ error: 'Failed to generate reply' }, { status: 500 });
  }

  try {
    const result = await replyToComment(config.accessToken, videoId, commentId, replyText);
    return NextResponse.json({ success: true, replyText, commentId: result.commentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ── PUT: like a comment ───────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const config = getTikTokConfig();
  if (!config?.accessToken) {
    return NextResponse.json({ error: 'TikTok not connected' }, { status: 401 });
  }

  const { videoId, commentId } = await req.json();
  if (!videoId || !commentId) {
    return NextResponse.json({ error: 'videoId, commentId required' }, { status: 400 });
  }

  try {
    await likeComment(config.accessToken, videoId, commentId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
