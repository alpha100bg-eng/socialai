import { NextRequest, NextResponse } from 'next/server';
import { getPublications, isRunning } from '@/lib/agent-store';
import { DEFAULT_NICHE } from '@/lib/niches';

export const dynamic = 'force-dynamic'; // never cache

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit     = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const profileId = searchParams.get('profileId') || DEFAULT_NICHE;

  return NextResponse.json({
    publications: getPublications(profileId, limit),
    isRunning:    isRunning(profileId),
  });
}
