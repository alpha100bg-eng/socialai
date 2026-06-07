/**
 * TikTok Content Posting API v2 client
 *
 * Required scopes: video.publish, video.upload
 * Setup guide: https://developers.tiktok.com/doc/content-posting-api-get-started
 *
 * ⚠️  You must apply for the Content Posting API in the TikTok Developer Portal.
 *     Sandbox mode is available for testing before approval.
 */

const TIKTOK_API = 'https://open.tiktokapis.com';

export type PrivacyLevel =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'FOLLOWER_OF_CREATOR'
  | 'SELF_ONLY';

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
}

export interface PublishVideoRequest {
  accessToken: string;
  videoUrl: string;          // Publicly accessible URL (fal.ai URL works directly)
  title: string;             // Caption + hashtags inline, max 2 200 chars
  privacyLevel?: PrivacyLevel;
  disableDuet?: boolean;
  disableComment?: boolean;
  disableStitch?: boolean;
  coverTimestampMs?: number;
}

export interface PublishResult {
  publishId: string;
}

export type PublishStatus =
  | 'PROCESSING_UPLOAD'
  | 'PROCESSING_DOWNLOAD'
  | 'SEND_TO_REVIEW'
  | 'FAILED'
  | 'PUBLISH_COMPLETE';

// ─── Publish a video from URL ─────────────────────────────────────────────────
export async function publishVideo(req: PublishVideoRequest): Promise<PublishResult> {
  const res = await fetch(`${TIKTOK_API}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      Authorization:   `Bearer ${req.accessToken}`,
      'Content-Type':  'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title:                   req.title,
        privacy_level:           req.privacyLevel ?? 'SELF_ONLY',
        disable_duet:            req.disableDuet ?? false,
        disable_comment:         req.disableComment ?? false,
        disable_stitch:          req.disableStitch ?? false,
        video_cover_timestamp_ms: req.coverTimestampMs ?? 1000,
      },
      source_info: {
        source:    'PULL_FROM_URL',
        video_url: req.videoUrl,
      },
    }),
  });

  const body = await res.json();

  if (body?.error?.code && body.error.code !== 'ok') {
    throw new Error(`TikTok API error: ${body.error.code} — ${body.error.message}`);
  }

  return { publishId: body.data?.publish_id };
}

// ─── Poll publication status ──────────────────────────────────────────────────
export async function getPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<{ status: PublishStatus; shareUrl?: string }> {
  const res = await fetch(`${TIKTOK_API}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  const body = await res.json();

  if (body?.error?.code && body.error.code !== 'ok') {
    throw new Error(`TikTok status error: ${body.error.code} — ${body.error.message}`);
  }

  return {
    status:   body.data?.status,
    shareUrl: body.data?.share_url,
  };
}

// ─── Refresh access token ─────────────────────────────────────────────────────
export async function refreshAccessToken(
  clientKey: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    clientKey,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const body = await res.json();

  if (body.error) {
    throw new Error(`TikTok token refresh error: ${body.error} — ${body.error_description}`);
  }

  return {
    accessToken:  body.access_token,
    refreshToken: body.refresh_token,
    expiresIn:    body.expires_in,
  };
}

// ─── Build caption string (TikTok allows inline hashtags in title) ────────────
export function buildCaption(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const full = `${caption}\n\n${tags}`;
  return full.length > 2200 ? full.substring(0, 2197) + '…' : full;
}
