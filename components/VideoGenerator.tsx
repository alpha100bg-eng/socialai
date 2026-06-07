'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Video, Download, RefreshCw, Play, Pause,
  Loader2, AlertCircle, Sparkles, Volume2, VolumeX,
  FileVideo, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { Platform, Tone } from '@/lib/types';
import { PLATFORM_META } from '@/lib/types';

interface Props {
  subject: string;
  platform: Platform;
  tone: Tone;
}

type Stage = 'idle' | 'crafting-prompt' | 'submitting' | 'queued' | 'generating' | 'done' | 'error';

const STAGE_LABELS: Record<Stage, string> = {
  idle:            '',
  'crafting-prompt': 'Crafting video prompt with AI…',
  submitting:      'Submitting to Kling 3.0…',
  queued:          'In queue — Kling is warming up…',
  generating:      'Generating your video…',
  done:            'Video ready!',
  error:           'Something went wrong',
};

const STAGE_PCT: Record<Stage, number> = {
  idle:            0,
  'crafting-prompt': 15,
  submitting:      30,
  queued:          45,
  generating:      70,
  done:            100,
  error:           0,
};

const POLL_INTERVAL = 4000; // ms

export default function VideoGenerator({ subject, platform, tone }: Props) {
  const [stage, setStage]           = useState<Stage>('idle');
  const [errorMsg, setErrorMsg]     = useState('');
  const [videoUrl, setVideoUrl]     = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [requestId, setRequestId]   = useState('');
  const [elapsed, setElapsed]       = useState(0);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [isMuted, setIsMuted]       = useState(false);
  const [fakePct, setFakePct]       = useState(0);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime  = useRef<number>(0);

  const clearPolling = () => {
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Elapsed timer
  const startTimer = () => {
    startTime.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
  };

  // Fake progress bar crawl (between 45% and 90% while generating)
  const startFakeProgress = (from: number) => {
    setFakePct(from);
    const id = setInterval(() => {
      setFakePct((prev) => {
        if (prev >= 90) { clearInterval(id); return 90; }
        return prev + 0.4;
      });
    }, 500);
    return id;
  };

  // Poll video status
  const pollStatus = useCallback((reqId: string) => {
    let fakeId: ReturnType<typeof setInterval>;
    fakeId = startFakeProgress(45);

    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/video-status?requestId=${reqId}`);
        const data = await res.json();

        if (data.status === 'IN_QUEUE')     setStage('queued');
        if (data.status === 'IN_PROGRESS')  setStage('generating');

        if (data.status === 'COMPLETED') {
          clearInterval(fakeId);
          clearPolling();
          setFakePct(100);
          setVideoUrl(data.videoUrl);
          setStage('done');
        }

        if (data.error && data.status !== 'IN_QUEUE' && data.status !== 'IN_PROGRESS') {
          clearInterval(fakeId);
          clearPolling();
          setErrorMsg(data.error);
          setStage('error');
        }
      } catch (e) {
        clearInterval(fakeId);
        clearPolling();
        setErrorMsg(String(e));
        setStage('error');
      }
    }, POLL_INTERVAL);
  }, []);

  const handleGenerate = async () => {
    if (!subject.trim()) return;
    clearPolling();

    setStage('crafting-prompt');
    setErrorMsg('');
    setVideoUrl('');
    setVideoPrompt('');
    setElapsed(0);
    setFakePct(0);
    setShowPrompt(false);
    startTimer();

    try {
      // Step 1: submit job
      setStage('crafting-prompt');
      const res  = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, platform, tone }),
      });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error ?? 'Submission failed');

      setVideoPrompt(data.videoPrompt);
      setRequestId(data.requestId);
      setStage('queued');
      setFakePct(35);

      // Step 2: start polling
      pollStatus(data.requestId);
    } catch (e) {
      clearPolling();
      setErrorMsg(String(e));
      setStage('error');
    }
  };

  // Cleanup on unmount
  useEffect(() => () => clearPolling(), []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); }
    else                         { videoRef.current.pause(); setIsPlaying(false); }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleDownload = async () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `socialai-${platform}-${Date.now()}.mp4`;
    a.target = '_blank';
    a.click();
  };

  const pMeta = PLATFORM_META[platform];
  const isRunning = stage !== 'idle' && stage !== 'done' && stage !== 'error';
  const displayPct = stage === 'done' ? 100 : stage === 'crafting-prompt' ? 15 : stage === 'submitting' ? 30 : fakePct;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 bg-gradient-to-r ${pMeta.gradient} opacity-90`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center">
            <Video size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Video Generation</p>
            <p className="text-white/60 text-xs">Kling 3.0 via fal.ai · {platform === 'twitter' ? '16:9' : '9:16'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/60 bg-black/20 px-3 py-1.5 rounded-xl">
          <Sparkles size={11} className="text-white/80" />
          <span>AI-crafted prompt</span>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* ── IDLE STATE ─────────────────────────────────────── */}
        {stage === 'idle' && (
          <div className="text-center space-y-4 py-2">
            <div className="inline-flex items-center gap-2 text-white/40 text-sm">
              <FileVideo size={16} />
              <span>5-second {platform === 'twitter' ? 'landscape' : 'vertical'} video</span>
            </div>
            <button
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              <Video size={20} />
              Generate Video
            </button>
          </div>
        )}

        {/* ── GENERATING STATE ───────────────────────────────── */}
        {isRunning && (
          <div className="space-y-5 py-2">
            {/* Animated preview placeholder */}
            <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-white/5
              ${platform === 'twitter' ? 'aspect-video' : 'aspect-[9/16] max-h-80'} mx-auto`}
              style={{ maxWidth: platform === 'twitter' ? '100%' : '160px' }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="text-violet-400 animate-spin" />
                <p className="text-white/30 text-xs px-4 text-center">Kling 3.0 is rendering…</p>
              </div>
              {/* Shimmer overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/3 to-transparent animate-[shimmer_2s_infinite]" />
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin text-violet-400" />
                  {STAGE_LABELS[stage]}
                </span>
                <span className="text-white/30 tabular-nums">{Math.round(displayPct)}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
                  style={{ width: `${displayPct}%` }}
                />
              </div>
            </div>

            {/* Elapsed + prompt */}
            <div className="flex items-center justify-between text-xs text-white/25">
              <span className="tabular-nums">{elapsed}s elapsed</span>
              <span>avg. 45–90s</span>
            </div>

            {videoPrompt && (
              <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">AI Video Prompt</p>
                <p className="text-xs text-white/50 leading-relaxed italic">&quot;{videoPrompt}&quot;</p>
              </div>
            )}
          </div>
        )}

        {/* ── DONE STATE ─────────────────────────────────────── */}
        {stage === 'done' && videoUrl && (
          <div className="space-y-4">
            {/* Video player */}
            <div className={`relative rounded-2xl overflow-hidden bg-black group
              ${platform === 'twitter' ? 'aspect-video' : 'aspect-[9/16] max-h-[480px]'} mx-auto`}
              style={{ maxWidth: platform === 'twitter' ? '100%' : '270px' }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-cover"
                loop
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* Controls overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                <button
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all"
                >
                  {isPlaying
                    ? <Pause size={22} className="text-white" />
                    : <Play  size={22} className="text-white ml-1" />
                  }
                </button>
              </div>

              {/* Mute button */}
              <button
                onClick={toggleMute}
                className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/40 backdrop-blur-sm text-white/70 hover:text-white transition-all"
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>

              {/* Platform badge */}
              <div className="absolute top-3 left-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm bg-gradient-to-r ${pMeta.gradient} text-white`}>
                  {pMeta.emoji} {pMeta.label}
                </span>
              </div>

              {/* Play button if not started */}
              {!isPlaying && (
                <div
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                    <Play size={26} className="text-white ml-1" />
                  </div>
                </div>
              )}
            </div>

            {/* AI prompt used */}
            {videoPrompt && (
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/3 border border-white/8 text-xs text-white/40 hover:text-white/60 transition-all"
              >
                <span>AI prompt used</span>
                {showPrompt ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
            {showPrompt && videoPrompt && (
              <div className="px-3 py-2.5 rounded-xl bg-white/3 border border-white/8 -mt-2">
                <p className="text-xs text-white/50 leading-relaxed italic">&quot;{videoPrompt}&quot;</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-semibold text-sm transition-all shadow-lg shadow-green-500/20"
              >
                <Download size={16} />
                Download MP4
              </button>
              <button
                onClick={handleGenerate}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/10 border border-white/10 hover:bg-white/15 text-white/70 hover:text-white text-sm font-medium transition-all group"
              >
                <RefreshCw size={15} className="group-hover:rotate-180 transition-transform duration-500" />
                New version
              </button>
            </div>

            {/* Generate new from scratch */}
            <button
              onClick={() => { setStage('idle'); setVideoUrl(''); setVideoPrompt(''); }}
              className="w-full text-xs text-white/25 hover:text-white/50 py-1 transition-colors"
            >
              ← Back to generator
            </button>
          </div>
        )}

        {/* ── ERROR STATE ────────────────────────────────────── */}
        {stage === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium text-sm">Generation failed</p>
                <p className="text-red-400/70 text-xs mt-1 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/8 border border-white/10 hover:bg-white/12 text-white/70 hover:text-white text-sm font-medium transition-all"
            >
              <RefreshCw size={15} />
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
