import { NextRequest, NextResponse } from 'next/server';
import { randomBytes }               from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey || clientKey === 'your_tiktok_client_key') {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    return NextResponse.redirect(
      `${base}/agent?error=${encodeURIComponent('TIKTOK_CLIENT_KEY not configured in .env.local')}`,
    );
  }

  const base       = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const redirectUri = `${base}/api/tiktok/callback`;
  const state      = randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_key:    clientKey,
    scope:         'user.info.basic,video.publish,video.upload',
    response_type: 'code',
    redirect_uri:  redirectUri,
    state,
  });

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('tiktok_oauth_state', state, {
    httpOnly: true,
    maxAge:   600, // 10 minutes
    sameSite: 'lax',
    path:     '/',
  });

  return response;
}
