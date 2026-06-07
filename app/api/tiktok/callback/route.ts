import { NextRequest, NextResponse } from 'next/server';
import { saveTikTokConfig }          from '@/lib/tiktok-config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const base        = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const { searchParams } = new URL(req.url);

  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${base}/agent?error=${encodeURIComponent(searchParams.get('error_description') ?? error)}`,
    );
  }

  // CSRF check
  const savedState = req.cookies.get('tiktok_oauth_state')?.value;
  if (!state || state !== savedState) {
    return NextResponse.redirect(`${base}/agent?error=${encodeURIComponent('Invalid OAuth state — try again')}`);
  }

  if (!code) {
    return NextResponse.redirect(`${base}/agent?error=${encodeURIComponent('No authorization code received')}`);
  }

  const clientKey    = process.env.TIKTOK_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
  const redirectUri  = `${base}/api/tiktok/callback`;

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_key:    clientKey,
      client_secret: clientSecret,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  redirectUri,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    const msg = tokenData.error_description ?? tokenData.error;
    return NextResponse.redirect(`${base}/agent?error=${encodeURIComponent(msg)}`);
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  saveTikTokConfig({
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? '',
    openId:       tokenData.open_id ?? '',
    expiresAt,
  });

  const response = NextResponse.redirect(`${base}/agent?connected=true`);
  response.cookies.delete('tiktok_oauth_state');
  return response;
}
