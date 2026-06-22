import { NextRequest, NextResponse } from 'next/server';
import { getTikTokConfig }      from '@/lib/tiktok-config';
import { hasBrowserSession }    from '@/lib/tiktok-browser';
import { DEFAULT_NICHE }         from '@/lib/niches';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get('profileId') || DEFAULT_NICHE;

  const browserSession = hasBrowserSession(profileId);
  const apiConfig      = getTikTokConfig();

  // Browser session takes priority
  if (browserSession) {
    return NextResponse.json({
      connected:   true,
      method:      'browser',
      openId:      null,
      expiresAt:   null,
      isExpired:   false,
    });
  }

  if (!apiConfig?.accessToken) {
    return NextResponse.json({ connected: false, method: 'none' });
  }

  const isExpired = apiConfig.expiresAt
    ? new Date(apiConfig.expiresAt) < new Date()
    : false;

  return NextResponse.json({
    connected: true,
    method:    'api',
    openId:    apiConfig.openId  || null,
    expiresAt: apiConfig.expiresAt || null,
    isExpired,
  });
}
