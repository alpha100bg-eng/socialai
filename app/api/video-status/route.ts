import { NextRequest, NextResponse } from 'next/server';
import { fal }                        from '@fal-ai/client';
import { getWan2GPStatus }             from '@/lib/wan2gp';

export const dynamic = 'force-dynamic';

const FAL_MODEL = 'fal-ai/kling-video/v3/4k/text-to-video';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get('requestId');

  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 });
  }

  // ── Wan2GP job ────────────────────────────────────────────────────────────
  if (requestId.startsWith('wan2gp:')) {
    try {
      const status = await getWan2GPStatus(requestId);
      if (status.status === 'COMPLETED') {
        return NextResponse.json({ status: 'COMPLETED', videoUrl: status.videoUrl });
      }
      if (status.status === 'FAILED') {
        return NextResponse.json({ status: 'FAILED', error: status.error }, { status: 500 });
      }
      return NextResponse.json({ status: status.status });
    } catch (e) {
      console.error('[video-status/wan2gp]', e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // ── fal.ai / Kling job ────────────────────────────────────────────────────
  const falKey = process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: 'FAL_KEY is not set' }, { status: 500 });

  fal.config({ credentials: falKey });

  try {
    const status = await fal.queue.status(FAL_MODEL, { requestId, logs: false });

    if (status.status !== 'COMPLETED') {
      return NextResponse.json({ status: status.status });
    }

    const result = await fal.queue.result(FAL_MODEL, { requestId });
    const data   = result.data as { video?: { url: string; file_name?: string; file_size?: number } };
    const videoUrl = data?.video?.url;

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'No video URL in fal.ai response', raw: JSON.stringify(data) },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status:   'COMPLETED',
      videoUrl,
      fileSize: data.video?.file_size,
      fileName: data.video?.file_name,
    });
  } catch (e) {
    console.error('[video-status/fal]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
