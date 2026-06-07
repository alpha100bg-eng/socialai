import { NextRequest, NextResponse } from 'next/server';
import { getPublications, isRunning } from '@/lib/agent-store';

export const dynamic = 'force-dynamic'; // never cache

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

  return NextResponse.json({
    publications: getPublications(limit),
    isRunning:    isRunning(),
  });
}
