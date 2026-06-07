'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, Clock, Wand2, Bot } from 'lucide-react';
import PlatformSelector from '@/components/PlatformSelector';
import ContentTypeSelector from '@/components/ContentTypeSelector';
import GeneratedContent from '@/components/GeneratedContent';
import VideoGenerator from '@/components/VideoGenerator';
import FreemiumBanner from '@/components/FreemiumBanner';
import HistoryDrawer from '@/components/HistoryDrawer';
import { getFreemiumState, canGenerate, incrementUsage, saveGeneration } from '@/lib/db';
import type { Platform, ContentType, Tone, FreemiumState } from '@/lib/types';

const PLATFORM_DEFAULTS: Record<Platform, ContentType> = {
  instagram: 'post',
  tiktok:    'script',
  twitter:   'post',
};

const EXAMPLES: Record<Platform, string[]> = {
  instagram: ['Artisan coffee shop', 'Personal fitness coaching', 'Vintage fashion brand'],
  tiktok:    ['Creamy pasta recipe', 'Morning productivity hack', 'Budget travel tips'],
  twitter:   ['AI replacing jobs', 'Web3 in 2025', 'Building in public'],
};

export default function Home() {
  const [platform, setPlatform]       = useState<Platform>('instagram');
  const [contentType, setContentType] = useState<ContentType>('post');
  const [tone, setTone]               = useState<Tone>('viral');
  const [subject, setSubject]         = useState('');
  const [result, setResult]           = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState('');
  const [freemium, setFreemium]       = useState<FreemiumState>({ used: 0, limit: 10, isPremium: false });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey]   = useState(0);

  useEffect(() => { setFreemium(getFreemiumState()); }, []);

  const handlePlatformChange = (p: Platform) => {
    setPlatform(p);
    setContentType(PLATFORM_DEFAULTS[p]);
    setResult('');
    setError('');
  };

  const handleGenerate = useCallback(async () => {
    if (!subject.trim()) { setError('Please enter a topic, product, or idea.'); return; }
    if (!canGenerate())  { setError('Free limit reached — upgrade to Premium!'); return; }

    setIsLoading(true);
    setError('');
    setResult('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, contentType, tone, subject }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Server error');

      setResult(data.result);
      const next = incrementUsage();
      setFreemium(next);

      await saveGeneration({
        platform, contentType, tone, subject,
        result: data.result,
        createdAt: new Date().toISOString(),
      });
      setHistoryKey((k) => k + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [platform, contentType, tone, subject]);

  const isLocked = !freemium.isPremium && freemium.used >= freemium.limit;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-violet-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-[400px] h-[500px] bg-pink-600/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-0 w-[400px] h-[300px] bg-blue-600/8 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-black/30 backdrop-blur-md sticky top-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/40">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-lg leading-none">SocialAI</span>
              <span className="block text-[10px] text-white/30 leading-none tracking-wide">Powered by Groq · Llama 3.3 70B</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <FreemiumBanner state={freemium} onUpgrade={() => setFreemium(getFreemiumState())} />
            <Link
              href="/agent"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 transition-all text-sm text-pink-400 hover:text-pink-300"
            >
              <Bot size={14} />
              <span className="hidden sm:inline font-medium">Auto-Post</span>
            </Link>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm text-white/50 hover:text-white"
            >
              <Clock size={14} />
              <span className="hidden sm:inline">History</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-3 pb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-2">
            <Sparkles size={12} />
            AI Content Generator
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent leading-tight">
            Generate viral content<br className="hidden sm:block" /> in seconds
          </h1>
          <p className="text-white/40 text-sm sm:text-base max-w-md mx-auto">
            Instagram captions, TikTok scripts, Twitter threads — perfectly crafted for each platform.
          </p>
        </div>

        {/* Generator card */}
        <div className="bg-white/[0.03] border border-white/8 rounded-3xl p-5 sm:p-7 space-y-6 backdrop-blur-sm shadow-2xl shadow-black/30">
          <PlatformSelector value={platform} onChange={handlePlatformChange} />

          <ContentTypeSelector
            contentType={contentType}
            tone={tone}
            platform={platform}
            onContentType={setContentType}
            onTone={setTone}
          />

          {/* Subject input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white/50 uppercase tracking-widest">
              Topic / Product / Idea
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleGenerate()}
              placeholder="e.g. Sustainable skincare brand launch"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/60 focus:bg-white/[0.06] transition-all text-sm sm:text-base"
            />
            {/* Quick examples */}
            <div className="flex flex-wrap gap-2 pt-0.5">
              <span className="text-[10px] text-white/25 uppercase tracking-widest self-center">Try:</span>
              {EXAMPLES[platform].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setSubject(ex); setError(''); }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-white/35 hover:text-white/70 hover:bg-white/10 transition-all"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isLoading || isLocked || !subject.trim()}
            className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-base transition-all duration-200
              ${isLocked
                ? 'bg-white/5 border border-white/10 text-white/25 cursor-not-allowed'
                : isLoading
                ? 'bg-violet-600/40 text-white/40 cursor-wait'
                : !subject.trim()
                ? 'bg-violet-500/30 text-white/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.01] active:scale-[0.99]'
              }`}
          >
            <Wand2 size={20} className={isLoading ? 'animate-pulse' : ''} />
            {isLocked   ? '⛔ Limit reached — Upgrade to Premium'
             : isLoading ? 'Generating…'
             : 'Generate Content'}
          </button>
        </div>

        {/* Text result */}
        {(result || isLoading) && (
          <GeneratedContent
            content={result}
            platform={platform}
            contentType={contentType}
            onRegenerate={handleGenerate}
            onClear={() => setResult('')}
            isLoading={isLoading}
          />
        )}

        {/* ── VIDEO GENERATION SECTION ──────────────────────── */}
        {subject.trim() && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-white/6" />
              <span className="text-xs text-white/25 uppercase tracking-widest font-medium">also</span>
              <div className="flex-1 h-px bg-white/6" />
            </div>

            <VideoGenerator
              subject={subject}
              platform={platform}
              tone={tone}
            />
          </>
        )}

        {/* Feature cards — visible when no subject entered */}
        {!subject.trim() && !result && !isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {[
              { icon: '⚡', title: 'Ultra-fast text',    desc: 'Captions, scripts & threads in under 3 seconds with Groq' },
              { icon: '🎬', title: 'Real AI video',       desc: 'Kling 3.0 generates a real 5-second video from your idea' },
              { icon: '🔁', title: 'Regenerate anytime', desc: 'Hit regenerate on text or video for a fresh take instantly' },
            ].map((card) => (
              <div key={card.title} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-center space-y-1.5">
                <span className="text-2xl">{card.icon}</span>
                <p className="text-sm font-semibold text-white/75">{card.title}</p>
                <p className="text-xs text-white/35 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} refreshKey={historyKey} />
    </div>
  );
}
