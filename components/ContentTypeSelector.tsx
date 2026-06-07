'use client';

import type { ContentType, Platform, Tone } from '@/lib/types';
import { CONTENT_META, TONE_META } from '@/lib/types';

interface Props {
  contentType: ContentType;
  tone: Tone;
  platform: Platform;
  onContentType: (c: ContentType) => void;
  onTone: (t: Tone) => void;
}

const PLATFORM_CONTENT: Record<Platform, ContentType[]> = {
  instagram: ['post', 'script'],
  tiktok:    ['script'],
  twitter:   ['post', 'thread'],
};

export default function ContentTypeSelector({ contentType, tone, platform, onContentType, onTone }: Props) {
  const available = PLATFORM_CONTENT[platform];

  return (
    <div className="space-y-5">
      {/* Content type */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-white/50 uppercase tracking-widest">Content Type</label>
        <div className="flex gap-2 flex-wrap">
          {available.map((key) => {
            const meta = CONTENT_META[key];
            const active = contentType === key;
            return (
              <button
                key={key}
                onClick={() => onContentType(key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all
                  ${active
                    ? 'bg-violet-500 border-violet-400 text-white shadow-lg shadow-violet-500/30'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
              >
                <span>{meta.emoji}</span>
                <span>{meta.label}</span>
                <span className={`text-xs ${active ? 'text-violet-200' : 'text-white/25'}`}>— {meta.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tone */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-white/50 uppercase tracking-widest">Tone</label>
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(TONE_META) as [Tone, typeof TONE_META[Tone]][]).map(([key, meta]) => {
            const active = tone === key;
            return (
              <button
                key={key}
                onClick={() => onTone(key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all
                  ${active
                    ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/30'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
              >
                <span>{meta.emoji}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
