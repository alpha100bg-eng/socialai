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
import { getSlotFromTime, getNiche, DEFAULT_NICHE } from '@/lib/niches';
import {
  buildStructuredContentPrompt,
  parseStructuredContent,
  buildSafetyCheckPrompt,
}                                                 from '@/lib/content-prompts';
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
// Wan 2.1 — 9:16 vertical @ 480p ≈ $0.20/vidéo (vs Kling 3.0 4K ≈ $1).
// Budget : 30 vidéos/mois ≈ $6. Pour repasser sur Kling, remettre l'ancien MODEL_ID.
const MODEL_ID = 'fal-ai/wan-t2v';
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

async function isSafeContent(niche: ReturnType<typeof getNiche>, topic: string): Promise<boolean> {
  try {
    const raw    = await groq(buildSafetyCheckPrompt(niche, topic), 60, true);
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

  // ── Determine profile/niche ───────────────────────────────────────────────
  const profileId = typeof body.profileId === 'string' && body.profileId
    ? body.profileId
    : DEFAULT_NICHE;
  const niche = getNiche(profileId);

  // ── Determine slot ────────────────────────────────────────────────────────
  const slot: TimeSlot = (body.slot === 'morning' || body.slot === 'evening')
    ? body.slot
    : getSlotFromTime();

  // ── Guards ────────────────────────────────────────────────────────────────
  if (isRunning(profileId)) {
    return NextResponse.json({ error: 'Agent is already running' }, { status: 409 });
  }
  if (!force && alreadyRanSlot(profileId, slot)) {
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
  savePublication(profileId, pub);
  setRunning(profileId, true);

  try {
    // ── Step 1: Load memory (learned patterns) ────────────────────────────
    const memory      = loadMemory(profileId);
    const memBoost    = getMemoryBoost(memory);
    const recentTopics = getRecentTopics(memory, 10);

    console.log(`[agent:${profileId}] Memory: ${memory.totalPublished} videos, avg score ${memory.avgScore.toFixed(1)}/10`);

    // ── Step 2: Fetch trending topics from Reddit ────────────────────────
    let trendContext = `No trend data available — use best ${niche.label} content instincts.`;
    try {
      const trends = await fetchTrendingTopics(niche.subreddits, profileId);
      const best   = selectBestTrend(trends, recentTopics);
      if (best) {
        trendContext = trendToContext(best);
        console.log(`[agent:${profileId}] Trend: ${trendContext}`);
      }
    } catch (e) {
      console.warn(`[agent:${profileId}] Trend fetch failed (non-fatal):`, e);
    }

    // ── Step 3: Generate structured content (single Groq call) ───────────
    const contentPrompt = buildStructuredContentPrompt(niche, slot, trendContext, memBoost);

    let content = null;
    let attempt = 0;

    while (attempt < 2 && !content) {
      attempt++;
      const raw = await groq(contentPrompt, 600, true);
      content   = parseStructuredContent(raw);

      if (!content) {
        console.warn(`[agent:${profileId}] Content parse failed (attempt ${attempt}), retrying...`);
        continue;
      }

      // ── Step 4: Safety check ──────────────────────────────────────────
      const safe = await isSafeContent(niche, content.topic);
      if (!safe) {
        console.warn(`[agent:${profileId}] Unsafe content detected (attempt ${attempt}): "${content.topic}"`);
        content = null; // trigger retry
      }
    }

    if (!content) throw new Error('Content generation failed safety check after 2 attempts');

    const { topic, caption, hashtags, videoPrompt } = content;
    updatePublication(profileId, id, { topic, caption, hashtags, videoPrompt, status: 'pending_video' });

    console.log(`[agent] Topic: ${topic}`);

    // ── Step 5: Submit video generation ───────────────────────────────────
    let falRequestId = '';
    let wan2gpJobId  = '';

    if (WAN2GP_URL) {
      // Self-hosted Wan2GP
      const job = await submitWan2GPVideo(videoPrompt, '9:16');
      wan2gpJobId = job.jobId;
      updatePublication(profileId, id, { falRequestId: wan2gpJobId });
      console.log(`[agent:${profileId}] Wan2GP job: ${wan2gpJobId}`);
    } else {
      // fal.ai / Wan 2.1 — 9:16 vertical @ 480p (bon marché pour TikTok)
      fal.config({ credentials: process.env.FAL_KEY });
      const handle = await fal.queue.submit(MODEL_ID, {
        input: {
          prompt:           videoPrompt,
          aspect_ratio:     '9:16',
          resolution:       '480p',
          negative_prompt:  'blur, distort, low quality, watermark, text overlay, logo, humans',
          enable_prompt_expansion: true,
        },
      });
      falRequestId = handle.request_id;
      updatePublication(profileId, id, { falRequestId });
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
          throw new Error('Wan video generation failed on fal.ai');
        }
      }
    }

    if (!videoUrl) throw new Error('Video generation timed out (3 min exceeded)');
    updatePublication(profileId, id, { videoUrl, videoReadyAt: new Date().toISOString() });

    console.log(`[agent:${profileId}] Video ready: ${videoUrl.slice(0, 80)}...`);

    // ── Step 7: Publish to TikTok ─────────────────────────────────────────
    const fullCaption   = buildCaption(caption, hashtags);
    let tikTokPublishId = '';
    let tikTokShareUrl  = '';
    let tikTokStatus    = '';
    let publishMethod   = 'none';
    let browserError    = '';

    // ── 7a: Browser session ──────────────────────────────────────────────
    // Mode semi-auto : si DISABLE_BROWSER_POST=1 (serveur Railway), on NE tente
    // PAS le post navigateur (instable sur serveur). On génère juste la vidéo +
    // caption, prêtes à poster manuellement depuis le dashboard / l'appli TikTok.
    const browserPostDisabled = process.env.DISABLE_BROWSER_POST === '1';
    if (!browserPostDisabled && hasBrowserSession(profileId)) {
      console.log(`[agent:${profileId}] Publishing via browser session...`);
      // Public par défaut (objectif = visibilité). On ne passe en privé que si
      // la variable dit explicitement self/only/private/follower. Robuste aux
      // formulations ("PUBLIC_TO_EVERYONE", "public", valeur absente → public).
      const privacyEnv = (process.env.TIKTOK_PRIVACY_LEVEL ?? '').toLowerCase();
      const isPrivate  = /self|only|private|follow/.test(privacyEnv);
      const result = await uploadViaBrowser({
        videoUrl,
        caption: fullCaption,
        privacy: isPrivate ? 'private' : 'public',
      }, profileId);

      if (result.success) {
        tikTokStatus   = 'PUBLISH_COMPLETE';
        tikTokShareUrl = result.shareUrl ?? '';
        publishMethod  = 'browser';
        console.log(`[agent:${profileId}] Browser publish success`);
      } else {
        browserError = result.error ?? 'unknown browser error';
        console.warn(`[agent:${profileId}] Browser upload failed:`, result.error);
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

    // ── 7c: Pas de post auto → vidéo prête à poster manuellement ──────────
    if (publishMethod === 'none') {
      updatePublication(profileId, id, {
        status:       'published',
        caption, hashtags, videoUrl, topic, videoPrompt,
        publishedAt:  new Date().toISOString(),
        durationMs:   Date.now() - startMs,
        tikTokStatus: browserPostDisabled ? 'READY_FOR_MANUAL' : 'SKIPPED_NOT_CONFIGURED',
        error:        browserError ? `browser: ${browserError}`.slice(0, 800) : undefined,
      });
      return NextResponse.json({
        success: true, id, profileId, slot, topic, videoUrl, caption, hashtags,
        warning: browserPostDisabled
          ? 'Vidéo prête à poster ! Télécharge-la depuis le dashboard et publie via l\'appli TikTok.'
          : 'TikTok non configuré — vidéo générée mais non publiée.',
      });
    }

    // ── Step 8: Persist ───────────────────────────────────────────────────
    updatePublication(profileId, id, {
      status: 'published',
      caption, hashtags, videoUrl, topic, videoPrompt,
      tikTokPublishId, tikTokShareUrl,
      tikTokStatus: tikTokStatus || 'PUBLISH_COMPLETE',
      publishedAt:  new Date().toISOString(),
      durationMs:   Date.now() - startMs,
    });

    console.log(`[agent:${profileId}] ✅ Done — ${slot} slot published via ${publishMethod} in ${Date.now() - startMs}ms`);

    return NextResponse.json({
      success: true, id, profileId, slot, topic, videoUrl, caption, hashtags,
      tikTokPublishId, tikTokShareUrl, publishMethod,
      durationMs: Date.now() - startMs,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent:${profileId}] Pipeline failed:`, message);
    updatePublication(profileId, id, { status: 'failed', error: message, durationMs: Date.now() - startMs });
    return NextResponse.json({ error: message, id, profileId }, { status: 500 });
  } finally {
    setRunning(profileId, false);
  }
}
