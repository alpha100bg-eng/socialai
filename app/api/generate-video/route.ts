import { NextRequest, NextResponse } from 'next/server';
import { fal }                        from '@fal-ai/client';
import { WAN2GP_URL, submitWan2GPVideo } from '@/lib/wan2gp';

export const dynamic = 'force-dynamic';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const FAL_MODEL = 'fal-ai/kling-video/v3/4k/text-to-video';

async function generateVideoPrompt(
  subject: string,
  platform: string,
  tone: string,
  groqKey: string,
): Promise<string> {
  const toneDesc: Record<string, string> = {
    viral:     'energetic, fast-paced, eye-catching',
    pro:       'clean, professional, polished',
    humour:    'fun, playful, comedic',
    inspirant: 'cinematic, emotional, inspiring',
  };
  const platformStyle: Record<string, string> = {
    instagram: 'vertical 9:16 aesthetic, warm colours, lifestyle feel',
    tiktok:    'vertical 9:16 dynamic, trending visual style, youth energy',
    twitter:   'horizontal 16:9 clean, informative, professional look',
  };

  const res = await fetch(GROQ_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  200,
      temperature: 0.8,
      messages: [{
        role:    'user',
        content: `You are an expert AI video prompt engineer.

Write a single highly detailed video generation prompt for: "${subject}"
Platform style: ${platformStyle[platform] ?? '16:9 cinematic'}
Tone: ${toneDesc[tone] ?? 'dynamic'}

Rules:
- Maximum 2 sentences, 80 words total
- Describe: main subject + action + environment + camera movement + lighting + mood
- Use cinematic vocabulary (dolly shot, golden hour, bokeh, shallow depth of field, etc.)
- NO hashtags, NO dialogue, NO text overlays
- Make it photorealistic and visually stunning

Output ONLY the prompt, nothing else:`,
      }],
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim()
    ?? `Cinematic video of ${subject}, smooth dolly shot, golden hour lighting, photorealistic`;
}

export async function POST(req: NextRequest) {
  try {
    const { subject, platform = 'instagram', tone = 'viral' } = await req.json();

    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY is not set' }, { status: 500 });

    const videoPrompt  = await generateVideoPrompt(subject, platform, tone, groqKey);
    const aspectRatio  = platform === 'twitter' ? '16:9' : '9:16';

    // ── Provider: Wan2GP (self-hosted) ────────────────────────────────────────
    if (WAN2GP_URL) {
      const job = await submitWan2GPVideo(videoPrompt, aspectRatio);
      return NextResponse.json({
        requestId:   job.jobId,
        videoPrompt,
        model:       'wan2gp',
        aspectRatio,
        provider:    'wan2gp',
      });
    }

    // ── Provider: fal.ai / Kling 3.0 (fallback) ──────────────────────────────
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json(
        { error: 'Neither WAN2GP_URL nor FAL_KEY is configured' },
        { status: 500 },
      );
    }

    fal.config({ credentials: falKey });

    const handle = await fal.queue.submit(FAL_MODEL, {
      input: {
        prompt:          videoPrompt,
        duration:        '5',
        aspect_ratio:    aspectRatio,
        negative_prompt: 'blur, distort, low quality, watermark, text overlay',
        cfg_scale:       0.5,
        generate_audio:  false,
      },
    });

    return NextResponse.json({
      requestId:   handle.request_id,
      videoPrompt,
      model:       FAL_MODEL,
      aspectRatio,
      provider:    'fal',
    });
  } catch (e) {
    console.error('[generate-video]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
