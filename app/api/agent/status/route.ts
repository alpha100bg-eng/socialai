import { NextRequest, NextResponse }  from 'next/server';
import { getPublications, isRunning } from '@/lib/agent-store';
import { DEFAULT_NICHE } from '@/lib/niches';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get('profileId') || DEFAULT_NICHE;

  const pubs    = getPublications(profileId, 1);
  const latest  = pubs[0] ?? null;

  return NextResponse.json({
    isRunning:    isRunning(profileId),
    latestRun:    latest,
    totalRuns:    getPublications(profileId, 200).length,
    publishedCount: getPublications(profileId, 200).filter((p) => p.status === 'published').length,
  });
}
