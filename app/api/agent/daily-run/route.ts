/**
 * POST /api/agent/daily-run
 *
 * Autonomous animal TikTok agent — runs twice daily (morning + evening).
 * Triggered by Vercel Cron OR the manual "Run Now" dashboard button.
 *
 * Autonomous pipeline:
 *   1. Load agent memory (learned patterns from past videos)
 *   2. Fetch trending topics (Reddit — cached 2h, no API key)
 *   3. Select best trend (avoid recently used topics)
 *   4. Generate full content package (single Groq call → structured JSON)
 *   5. Safety check (reject violent/disturbing content, retry once)
 *   6. Submit to Kling 3.0 4K via fal.ai
 *   7. Poll until video ready (up to 3 min)
 *   8. Publish to TikTok (browser session → OAuth → skip)
 *   9. Persist to store
 *
 * Publishing priority:
 *   1. Browser session  (npm run tiktok:login — no developer app)
 *   2. TikTok OAuth API (optional)
 *   3. Skip             (video saved, not posted)
 */

import { NextRequest, NextResponse }             from 'next/server';
import { fal }                                    from '@fal-ai/client';
import { WAN2GP_URL, submitWan2GPVideo, getWan2GPStatus } from '@/lib/wan2gp';
import { v4 as uuid }                             from 'uuid';
import {
  savePublication, updatePublication,
  isRunning, setRunning, alreadyRanSlot, todayStr,
  type Publication, type TimeSlot,
}                                                 from '@/lib/agent-store';
import {
  publishVideo, refreshAccessToken,
  getPublishStatus, buildCaption,
}                                                 from '@/lib/tiktok';
import { getTikTokConfig, saveTikTokConfig }      from '@/lib/tiktok-config';
import { uploadViaBrowser, hasBrowserSession }    from '@/lib/tiktok-browser';
import {
  getSlotFromTime,
  buildStructuredContentPrompt,
  parseStructuredContent,
  buildSafetyCheckPrompt,
}                                                 from '@/lib/animal-content';
import {
  fetchTrendingTopics,
  selectBestTrend,
  trendToContext,
}                                                 from '@/lib/trend-engine';
import {
  loadMemory,
  getMemoryBoost,
  getRecentTopics,
}                                                 from '@/lib/agent-memory';

export const dynamic = 'force-dynamic';

export const maxDuration = 300;

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_ID = 'fal-ai/kling-video/v3/4k/text-to-video';
const POLL_MAX = 170_000;
const POLL_INT = 8_000;

// ─── Groq helper ──────────────────────────────────────────────────────────────

async function groq(prompt: string, maxTokens = 400, jsonMode = false): Promise<string> {
  const body: Record<string, unknown> = {
    model:       'llama-3.3-70b-versatile',
    max_tokens:  maxTokens,
    temperature: 0.9,
    messages:    [{ role: 'user', content: prompt }],
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res  = await fetch(GROQ_API, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.choices?.[0]) throw new Error(`Groq error: ${JSON.stringify(data)}`);
  return data.choices[0].message.content.trim();
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Safety check ─────────────────────────────────────────────────────────────

async function isSafeContent(topic: string): Promise<boolean> {
  try {
    const raw    = await groq(buildSafetyCheckPrompt(topic), 60, true);
    const result = JSON.parse(raw) as { safe?: boolean };
    return result.safe !== false;
  } catch {
    return true; // fail open — don't block on safety check errors
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body  = await req.json().catch(() => ({})) as Record<string, unknown>;
  const force = body.force === true;

  // ── Determine slot ────────────────────────────────────────────────────────
  const slot: TimeSlot = (body.slot === 'morning' || body.slot === 'evening')
    ? body.slot
    : getSlotFromTime();

  // ── Guards ────────────────────────────────────────────────────────────────
  if (isRunning()) {
    return NextResponse.json({ error: 'Agent is already running' }, { status: 409 });
  }
  if (!force && alreadyRanSlot(slot)) {
    return NextResponse.json(
      { error: `${slot} slot already published today. Use force:true to override.` },
      { status: 409 },
    );
  }

  // ── Init publication record ───────────────────────────────────────────────
  const id      = uuid();
  const startMs = Date.now();
  const pub: Publication = {
    id,
    createdAt:    new Date().toISOString(),
    scheduledFor: todayStr(),
    slot,
    status:       'running',
    topic:        '',
    videoPrompt:  '',
    caption:      '',
    hashtags:     [],
  };
  savePublication(pub);
  setRunning(true);

  try {
    // ── Step 1: Load memory (learned patterns) ────────────────────────────
    const memory      = loadMemory();
    const memBoost    = getMemoryBoost(memory);
    const recentTopics = getRecentTopics(memory, 10);

    console.log(`[agent] Memory: ${memory.totalPublished} videos, avg score ${memory.avgScore.toFixed(1)}/10`);

    // ── Step 2: Fetch trending topics from Reddit ────────────────────────
    let trendContext = 'No trend data available — use best animal content instincts.';
    try {
      const trends = await fetchTrendingTopics();
      const best   = selectBestTrend(trends, recentTopics);
      if (best) {
        trendContext = trendToContext(best);
        console.log(`[agent] Trend: ${trendContext}`);
      }
    } catch (e) {
      console.warn('[agent] Trend fetch failed (non-fatal):', e);
    }

    // ── Step 3: Generate structured content (single Groq call) ───────────
    const contentPrompt = buildStructuredContentPrompt(slot, trendContext, memBoost);

    let content = null;
    let attempt = 0;

    while (attempt < 2 && !content) {
      attempt++;
      const raw = await groq(contentPrompt, 600, true);
      content   = parseStructuredContent(raw);

      if (!content) {
        console.warn(`[agent] Content parse failed (attempt ${attempt}), retrying...`);
        continue;
      }

      // ── Step 4: Safety check ──────────────────────────────────────────
      const safe = await isSafeContent(content.topic);
      if (!safe) {
        console.warn(`[agent] Unsafe content detected (attempt ${attempt}): "${content.topic}"`);
        content = null; // trigger retry
      }
    }

    if (!content) throw new Error('Content generation failed safety check after 2 attempts');

    const { topic, caption, hashtags, videoPrompt } = content;
    updatePublication(id, { topic, caption, hashtags, videoPrompt, status: 'pending_video' });

    console.log(`[agent] Topic: ${topic}`);

    // ── Step 5: Submit video generation ───────────────────────────────────
    let falRequestId = '';
    let wan2gpJobId  = '';

    if (WAN2GP_URL) {
      // Self-hosted Wan2GP
      const job = await submitWan2GPVideo(videoPrompt, '9:16');
      wan2gpJobId = job.jobId;
      updatePublication(id, { falRequestId: wan2gpJobId });
      console.log(`[agent] Wan2GP job: ${wan2gpJobId}`);
    } else {
      // fal.ai / Kling 3.0 fallback
      fal.config({ credentials: process.env.FAL_KEY });
      const handle = await fal.queue.submit(MODEL_ID, {
        input: {
          prompt:          videoPrompt,
          duration:        '5',
          aspect_ratio:    '9:16',
          negative_prompt: 'blur, distort, low quality, watermark, text overlay, logo, humans',
          cfg_scale:       0.5,
          generate_audio:  false,
        },
      });
      falRequestId = handle.request_id;
      updatePublication(id, { falRequestId });
    }

    // ── Step 6: Poll until video ready ────────────────────────────────────
    let videoUrl = '';
    const deadline = Date.now() + POLL_MAX;

    while (Date.now() < deadline) {
      await sleep(POLL_INT);

      if (wan2gpJobId) {
        const s = await getWan2GPStatus(wan2gpJobId);
        if (s.status === 'COMPLETED') { videoUrl = s.videoUrl ?? ''; break; }
        if (s.status === 'FAILED')    throw new Error(`Wan2GP failed: ${s.error}`);
      } else {
        const status = await fal.queue.status(MODEL_ID, { requestId: falRequestId, logs: false });
        if (status.status === 'COMPLETED') {
          const result = await fal.queue.result(MODEL_ID, { requestId: falRequestId });
          const data   = result.data as { video?: { url: string } };
          videoUrl     = data?.video?.url ?? '';
          break;
        }
        if ((status as { status: string }).status === 'FAILED') {
          throw new Error('Kling video generation failed on fal.ai');
        }
      }
    }

    if (!videoUrl) throw new Error('Video generation timed out (3 min exceeded)');
    updatePublication(id, { videoUrl, videoReadyAt: new Date().toISOString() });

    console.log(`[agent] Video ready: ${videoUrl.slice(0, 80)}...`);

    // ── Step 7: Publish to TikTok ─────────────────────────────────────────
    const fullCaption   = buildCaption(caption, hashtags);
    let tikTokPublishId = '';
    let tikTokShareUrl  = '';
    let tikTokStatus    = '';
    let publishMethod   = 'none';

    // ── 7a: Browser session ──────────────────────────────────────────────
    if (hasBrowserSession()) {
      console.log('[agent] Publishing via browser session...');
      const result = await uploadViaBrowser({
        videoUrl,
        caption: fullCaption,
        privacy: process.env.TIKTOK_PRIVACY_LEVEL === 'PUBLIC_TO_EVERYONE' ? 'public' : 'private',
      });

      if (result.success) {
        tikTokStatus   = 'PUBLISH_COMPLETE';
        tikTokShareUrl = result.shareUrl ?? '';
        publishMethod  = 'browser';
        console.log('[agent] Browser publish success');
      } else {
        console.warn('[agent] Browser upload failed:', result.error);
      }
    }

    // ── 7b: OAuth API fallback ────────────────────────────────────────────
    if (publishMethod === 'none') {
      const tiktokConfig       = getTikTokConfig();
      const tiktokAccessToken  = tiktokConfig?.accessToken;
      const tiktokRefreshToken = tiktokConfig?.refreshToken;
      const tiktokClientKey    = process.env.TIKTOK_CLIENT_KEY;
      const tiktokClientSecret = process.env.TIKTOK_CLIENT_SECRET;

      if (tiktokAccessToken) {
        let activeToken = tiktokAccessToken;

        if (tiktokRefreshToken && tiktokClientKey && tiktokClientSecret) {
          try {
            const refreshed = await refreshAccessToken(
              tiktokClientKey, tiktokClientSecret, tiktokRefreshToken,
            );
            activeToken = refreshed.accessToken;
            if (tiktokConfig) {
              saveTikTokConfig({
                ...tiktokConfig,
                accessToken:  refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                expiresAt:    new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
              });
            }
          } catch (e) {
            console.warn('[agent] Token refresh failed, using existing token:', e);
          }
        }

        const publishResult = await publishVideo({
          accessToken:  activeToken,
          videoUrl,
          title:        fullCaption,
          privacyLevel: (process.env.TIKTOK_PRIVACY_LEVEL as never) ?? 'SELF_ONLY',
        });

        tikTokPublishId = publishResult.publishId;
        publishMethod   = 'api';

        for (let i = 0; i < 6; i++) {
          await sleep(5_000);
          try {
            const ts = await getPublishStatus(activeToken, tikTokPublishId);
            if (ts.status === 'PUBLISH_COMPLETE') {
              tikTokShareUrl = ts.shareUrl ?? '';
              tikTokStatus   = 'PUBLISH_COMPLETE';
              break;
            }
            if (ts.status === 'FAILED') throw new Error('TikTok publish failed');
          } catch { break; }
        }
      }
    }

    // ── 7c: No TikTok configured ──────────────────────────────────────────
    if (publishMethod === 'none') {
      updatePublication(id, {
        status:       'published',
        caption, hashtags, videoUrl, topic, videoPrompt,
        publishedAt:  new Date().toISOString(),
        durationMs:   Date.now() - startMs,
        tikTokStatus: 'SKIPPED_NOT_CONFIGURED',
      });
      return NextResponse.json({
        success: true, id, slot, topic, videoUrl, caption, hashtags,
        warning: 'TikTok non configuré — vidéo générée mais non publiée. Lance npm run tiktok:login',
      });
    }

    // ── Step 8: Persist ───────────────────────────────────────────────────
    updatePublication(id, {
      status: 'published',
      caption, hashtags, videoUrl, topic, videoPrompt,
      tikTokPublishId, tikTokShareUrl,
      tikTokStatus: tikTokStatus || 'PUBLISH_COMPLETE',
      publishedAt:  new Date().toISOString(),
      durationMs:   Date.now() - startMs,
    });

    console.log(`[agent] ✅ Done — ${slot} slot published via ${publishMethod} in ${Date.now() - startMs}ms`);

    return NextResponse.json({
      success: true, id, slot, topic, videoUrl, caption, hashtags,
      tikTokPublishId, tikTokShareUrl, publishMethod,
      durationMs: Date.now() - startMs,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[agent] Pipeline failed:', message);
    updatePublication(id, { status: 'failed', error: message, durationMs: Date.now() - startMs });
    return NextResponse.json({ error: message, id }, { status: 500 });
  } finally {
    setRunning(false);
  }
}
