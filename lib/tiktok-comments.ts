/**
 * TikTok Comment API wrapper.
 *
 * Required scopes (must be approved in TikTok Developer Portal):
 *   - comment.list   → list comments on a video
 *   - comment.create → reply to a comment
 *   - comment.like   → like a comment
 *
 * Video list scope:
 *   - video.list     → fetch your published videos + analytics
 */

const TIKTOK_API = 'https://open.tiktokapis.com';

export interface TikTokVideo {
  id:          string;
  title:       string;
  createTime:  number;
  shareUrl:    string;
  viewCount?:  number;
  likeCount?:  number;
  commentCount?: number;
  shareCount?: number;
}

export interface TikTokComment {
  id:         string;
  videoId:    string;
  text:       string;
  createTime: number;
  likeCount:  number;
  username:   string;
  isLiked:    boolean;
}

// ─── Video list + analytics ───────────────────────────────────────────────────
export async function listVideos(
  accessToken: string,
  maxCount = 20,
): Promise<TikTokVideo[]> {
  const res = await fetch(
    `${TIKTOK_API}/v2/video/list/?fields=id,title,create_time,share_url,view_count,like_count,comment_count,share_count`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ max_count: maxCount }),
    },
  );

  const body = await res.json();
  if (body?.error?.code && body.error.code !== 'ok') {
    throw new Error(`TikTok video list error: ${body.error.code} — ${body.error.message}`);
  }

  return (body.data?.videos ?? []).map((v: Record<string, unknown>) => ({
    id:           v.id as string,
    title:        v.title as string,
    createTime:   v.create_time as number,
    shareUrl:     v.share_url as string,
    viewCount:    v.view_count as number,
    likeCount:    v.like_count as number,
    commentCount: v.comment_count as number,
    shareCount:   v.share_count as number,
  }));
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export async function listComments(
  accessToken: string,
  videoId:     string,
  maxCount = 20,
): Promise<TikTokComment[]> {
  const res = await fetch(
    `${TIKTOK_API}/v2/comment/list/?fields=id,video_id,text,create_time,like_count,username,is_liked`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ video_id: videoId, max_count: maxCount }),
    },
  );

  const body = await res.json();
  if (body?.error?.code && body.error.code !== 'ok') {
    throw new Error(`TikTok comment list error: ${body.error.code} — ${body.error.message}`);
  }

  return (body.data?.comments ?? []).map((c: Record<string, unknown>) => ({
    id:         c.id as string,
    videoId:    c.video_id as string,
    text:       c.text as string,
    createTime: c.create_time as number,
    likeCount:  c.like_count as number,
    username:   c.username as string,
    isLiked:    c.is_liked as boolean,
  }));
}

export async function replyToComment(
  accessToken: string,
  videoId:     string,
  commentId:   string,
  text:        string,
): Promise<{ commentId: string }> {
  const res = await fetch(`${TIKTOK_API}/v2/comment/create/`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ video_id: videoId, parent_comment_id: commentId, text }),
  });

  const body = await res.json();
  if (body?.error?.code && body.error.code !== 'ok') {
    throw new Error(`TikTok comment create error: ${body.error.code} — ${body.error.message}`);
  }
  return { commentId: body.data?.comment?.id };
}

export async function likeComment(
  accessToken: string,
  videoId:     string,
  commentId:   string,
): Promise<void> {
  const res = await fetch(`${TIKTOK_API}/v2/comment/like/`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ video_id: videoId, comment_id: commentId }),
  });

  const body = await res.json();
  if (body?.error?.code && body.error.code !== 'ok') {
    throw new Error(`TikTok comment like error: ${body.error.code} — ${body.error.message}`);
  }
}
