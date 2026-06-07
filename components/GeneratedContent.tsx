'use client';

import { useState } from 'react';
import { Copy, Check, RefreshCw, Trash2, Image, Hash, Music, Zap, MessageSquare, FileText, Target } from 'lucide-react';
import type { Platform, ContentType } from '@/lib/types';
import { PLATFORM_META, CONTENT_META } from '@/lib/types';

interface Props {
  content: string;
  platform: Platform;
  contentType: ContentType;
  onRegenerate: () => void;
  onClear: () => void;
  isLoading?: boolean;
}

// ─── Section config ────────────────────────────────────────────────────────────
const SECTION_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  render?: 'hashtags' | 'bullets' | 'tweet' | 'cta' | 'default';
}> = {
  'CAPTION':          { icon: FileText,     color: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/20' },
  'HASHTAGS':         { icon: Hash,         color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', render: 'hashtags' },
  'IMAGE SUGGESTION': { icon: Image,        color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' },
  'HOOK (0–3S)':      { icon: Zap,          color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20', render: 'cta' },
  'NARRATION':        { icon: FileText,     color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
  'ON-SCREEN TEXT':   { icon: MessageSquare,color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20', render: 'bullets' },
  'MUSIC SUGGESTION': { icon: Music,        color: 'text-fuchsia-400',bg: 'bg-fuchsia-500/10',border: 'border-fuchsia-500/20' },
  'CTA':              { icon: Target,       color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', render: 'cta' },
  'TWEET':            { icon: MessageSquare,color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20', render: 'cta' },
  'THREAD HOOK':      { icon: Zap,          color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
};

// ─── Thread tweet parser ───────────────────────────────────────────────────────
function isThread(content: string): boolean {
  return /\[1\/\d+\]/.test(content);
}

function parseThread(content: string): { num: string; text: string }[] {
  const tweets: { num: string; text: string }[] = [];
  const blocks = content.split(/\n(?=\[\d+\/\d+\])/).filter(Boolean);
  for (const block of blocks) {
    const match = block.match(/^\[(\d+\/\d+)\]\s*([\s\S]*)/);
    if (match) tweets.push({ num: match[1], text: match[2].trim() });
  }
  return tweets.length > 0 ? tweets : [{ num: '1/1', text: content }];
}

// ─── Section parser ────────────────────────────────────────────────────────────
interface Section { title: string; content: string }

function parseSections(raw: string): Section[] | null {
  if (!raw.includes('###') && !isThread(raw)) return null;
  const parts = raw.split(/^###\s+/m).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.map((part) => {
    const newline = part.indexOf('\n');
    if (newline === -1) return { title: part.trim(), content: '' };
    return {
      title: part.slice(0, newline).trim().toUpperCase(),
      content: part.slice(newline + 1).trim(),
    };
  });
}

// ─── Hashtag renderer ─────────────────────────────────────────────────────────
function HashtagPills({ text }: { text: string }) {
  const tags = text.match(/#[\w\u00C0-\u024F]+/g) ?? text.split(/\s+/).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {tags.map((tag, i) => (
        <span key={i} className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-medium border border-violet-500/20">
          {tag.startsWith('#') ? tag : `#${tag}`}
        </span>
      ))}
    </div>
  );
}

// ─── Bullet list renderer ─────────────────────────────────────────────────────
function BulletList({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  return (
    <ul className="space-y-1.5 pt-1">
      {lines.map((line, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-white/80">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
          <span>{line.replace(/^[-•*]\s*/, '')}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── CTA block ────────────────────────────────────────────────────────────────
function CtaBlock({ text }: { text: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 font-medium leading-relaxed">
      {text}
    </div>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────
function SectionBlock({ title, content }: Section) {
  const [copied, setCopied] = useState(false);
  const cfg = SECTION_CONFIG[title] ?? { icon: FileText, color: 'text-white/60', bg: 'bg-white/5', border: 'border-white/10' };
  const Icon = cfg.icon;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Icon size={14} className={cfg.color} />
          <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>{title}</span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all
            ${copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white/50 hover:text-white hover:bg-white/20'}`}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="px-4 py-3">
        {cfg.render === 'hashtags' && <HashtagPills text={content} />}
        {cfg.render === 'bullets'  && <BulletList text={content} />}
        {cfg.render === 'cta'      && <CtaBlock text={content} />}
        {(!cfg.render || cfg.render === 'default') && (
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
}

// ─── Thread renderer ──────────────────────────────────────────────────────────
function ThreadView({ content }: { content: string }) {
  const tweets = parseThread(content);
  const total = tweets.length;
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = async (idx: number, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-2">
      {tweets.map((t, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        const charCount = t.text.length;
        const overLimit = charCount > 280;
        return (
          <div key={i} className={`relative rounded-2xl border overflow-hidden
            ${isFirst ? 'border-sky-500/40 bg-sky-500/10' : isLast ? 'border-orange-500/30 bg-orange-500/8' : 'border-white/10 bg-white/5'}`}>
            {/* Tweet header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${isFirst ? 'text-sky-400' : isLast ? 'text-orange-400' : 'text-white/40'}`}>
                  [{t.num}]
                </span>
                {isFirst && <span className="text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full">HOOK</span>}
                {isLast  && <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">CTA</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] ${overLimit ? 'text-red-400' : 'text-white/30'}`}>{charCount}/280</span>
                <button
                  onClick={() => handleCopy(i, t.text)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all
                    ${copiedIdx === i ? 'bg-green-500 text-white' : 'bg-white/10 text-white/40 hover:text-white hover:bg-white/20'}`}
                >
                  {copiedIdx === i ? <Check size={10} /> : <Copy size={10} />}
                  {copiedIdx === i ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <p className="px-4 py-3 text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{t.text}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Loading animation ────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <p className="text-white/40 text-sm animate-pulse">Generating content…</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GeneratedContent({ content, platform, contentType, onRegenerate, onClear, isLoading }: Props) {
  const [copiedAll, setCopiedAll] = useState(false);
  const meta = PLATFORM_META[platform];

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(content);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const sections = content ? parseSections(content) : null;
  const threadMode = content ? isThread(content) : false;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 bg-gradient-to-r ${meta.gradient} opacity-90`}>
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{meta.emoji}</span>
          <div>
            <span className="text-white font-bold text-sm">{meta.label}</span>
            <span className="text-white/60 text-xs"> · {CONTENT_META[contentType].emoji} {CONTENT_META[contentType].label}</span>
          </div>
        </div>
        {!isLoading && content && (
          <div className="flex items-center gap-2">
            {/* Copy all */}
            <button
              onClick={handleCopyAll}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                ${copiedAll ? 'bg-green-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              {copiedAll ? <Check size={12} /> : <Copy size={12} />}
              {copiedAll ? 'Copied!' : 'Copy all'}
            </button>
            {/* Clear */}
            <button
              onClick={onClear}
              title="Clear"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-red-500/30 text-white/60 hover:text-red-300 transition-all"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5 max-h-[600px] overflow-y-auto space-y-3">
        {isLoading ? (
          <LoadingDots />
        ) : threadMode ? (
          <ThreadView content={content} />
        ) : sections ? (
          sections.map((s, i) => <SectionBlock key={i} title={s.title} content={s.content} />)
        ) : (
          <pre className="text-white/85 text-sm leading-relaxed whitespace-pre-wrap font-sans">{content}</pre>
        )}
      </div>

      {/* Footer — Regenerate button */}
      {!isLoading && content && (
        <div className="px-5 pb-5 pt-1 flex items-center justify-between border-t border-white/5 mt-2">
          <span className="text-xs text-white/25">{content.length} characters</span>
          <button
            onClick={onRegenerate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 hover:text-white text-sm font-medium transition-all group"
          >
            <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
