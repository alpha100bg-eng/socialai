'use client';

import { useState } from 'react';
import { Zap, X, Sparkles, Lock } from 'lucide-react';
import type { FreemiumState } from '@/lib/types';
import { unlockPremium } from '@/lib/db';

interface Props {
  state: FreemiumState;
  onUpgrade: () => void;
}

export default function FreemiumBanner({ state, onUpgrade }: Props) {
  const [showModal, setShowModal] = useState(false);
  const { used, limit, isPremium } = state;
  const remaining = limit - used;
  const pct = Math.min((used / limit) * 100, 100);
  const isLocked = !isPremium && used >= limit;

  if (isPremium) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <Sparkles size={14} className="text-amber-400" />
        <span className="text-xs text-amber-400 font-medium">Premium · Unlimited</span>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setShowModal(true)} className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
          <Zap size={13} className={remaining <= 2 ? 'text-red-400' : 'text-violet-400'} />
          <span className={`text-xs font-medium ${remaining <= 2 ? 'text-red-400' : 'text-white/60'}`}>
            {remaining > 0 ? `${remaining} / ${limit} free` : '⛔ Limit reached'}
          </span>
        </div>
        <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-violet-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      {/* Upgrade modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex justify-end mb-2">
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="text-center space-y-3 mb-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${isLocked ? 'bg-violet-500/20' : 'bg-amber-500/20'}`}>
                {isLocked
                  ? <Lock size={28} className="text-violet-400" />
                  : <Sparkles size={28} className="text-amber-400" />
                }
              </div>
              <h2 className="text-xl font-bold text-white">
                {isLocked ? 'Limit reached' : 'Go Premium ⚡'}
              </h2>
              <p className="text-white/60 text-sm">
                {isLocked
                  ? <>You&apos;ve used all <strong className="text-white">{limit} free generations</strong>. Upgrade to continue generating unlimited content.</>
                  : <><strong className="text-white">{remaining} generation{remaining > 1 ? 's' : ''}</strong> left on your free plan. Upgrade for unlimited access.</>
                }
              </p>
            </div>

            {/* Plan card */}
            <div className="rounded-2xl border-2 border-violet-500 bg-violet-500/10 p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white">Premium</span>
                <span className="text-violet-400 font-bold text-lg">$9.99<span className="text-sm font-normal text-white/40">/mo</span></span>
              </div>
              <ul className="text-sm text-white/60 space-y-1">
                <li>✅ Unlimited generations</li>
                <li>✅ All platforms & content types</li>
                <li>✅ Full history access</li>
                <li>✅ Priority generation speed</li>
              </ul>
            </div>

            <button
              onClick={() => {
                unlockPremium();
                onUpgrade();
                setShowModal(false);
              }}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-violet-500/30"
            >
              Unlock Premium — $9.99/month
            </button>
            <p className="text-center text-xs text-white/30 mt-3">
              Secure payment · Cancel anytime
            </p>
          </div>
        </div>
      )}
    </>
  );
}
