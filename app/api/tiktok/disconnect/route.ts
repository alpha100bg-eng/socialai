import { NextResponse }       from 'next/server';
import { clearTikTokConfig }  from '@/lib/tiktok-config';

export const dynamic = 'force-dynamic';

export async function POST() {
  clearTikTokConfig();
  return NextResponse.json({ success: true });
}
