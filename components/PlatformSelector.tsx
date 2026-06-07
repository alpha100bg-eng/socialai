'use client';

import type { Platform } from '@/lib/types';
import { PLATFORM_META } from '@/lib/types';

interface Props {
  value: Platform;
  onChange: (p: Platform) => void;
}

export default function PlatformSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-white/50 uppercase tracking-widest">Platform</label>
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(PLATFORM_META) as [Platform, typeof PLATFORM_META[Platform]][]).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative rounded-2xl p-4 flex flex-col items-center gap-2 border-2 transition-all duration-200 cursor-pointer
              ${value === key
                ? `bg-gradient-to-br ${meta.gradient} border-transparent shadow-xl scale-[1.04]`
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]'
              }`}
          >
            <span className="text-2xl">{meta.emoji}</span>
            <span className={`text-sm font-semibold ${value === key ? 'text-white' : 'text-white/60'}`}>
              {meta.label}
            </span>
            {value === key && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white/80 shadow-sm" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
