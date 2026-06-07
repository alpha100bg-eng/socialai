import { NextResponse }               from 'next/server';
import { getPublications, isRunning } from '@/lib/agent-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const pubs    = getPublications(1);
  const latest  = pubs[0] ?? null;

  return NextResponse.json({
    isRunning:    isRunning(),
    latestRun:    latest,
    totalRuns:    getPublications(200).length,
    publishedCount: getPublications(200).filter((p) => p.status === 'published').length,
  });
}
