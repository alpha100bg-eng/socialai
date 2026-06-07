/**
 * GET /api/agent/memory  — read agent memory (learned patterns)
 * DELETE /api/agent/memory — reset agent memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadMemory, saveMemory }    from '@/lib/agent-memory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const memory = loadMemory();
  return NextResponse.json(memory);
}

export async function DELETE(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  saveMemory({
    bestHooks:         [],
    bestTopics:        [],
    failedStyles:      [],
    avgScore:          0,
    totalPublished:    0,
    recentPerformance: [],
    lastUpdated:       new Date().toISOString(),
  });

  return NextResponse.json({ success: true, message: 'Memory reset' });
}
