'use client';

import { useState, useEffect } from 'react';
import { X, Clock, Copy, Check, Trash2 } from 'lucide-react';
import { getGenerations, deleteGeneration } from '@/lib/db';
import { PLATFORM_META, CONTENT_META } from '@/lib/types';
import type { Generation } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  refreshKey: number;
}

export default function HistoryDrawer({ open, onClose, refreshKey }: Props) {
  const [items, setItems] = useState<Generation[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (open) getGenerations().then(setItems);
  }, [open, refreshKey]);

  const handleDelete = async (id: number) => {
    await deleteGeneration(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleCopy = async (id: number, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-gray-950 border-l border-white/10 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-violet-400" />
            <h2 className="font-semibold text-white">History</h2>
            <span className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full">{items.length}</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Clock size={32} className="text-white/20" />
              <p className="text-white/40 text-sm">No generations yet</p>
              <p className="text-white/25 text-xs">Your content history will appear here</p>
            </div>
          ) : (
            items.map((item) => {
              const pMeta = PLATFORM_META[item.platform];
              const cMeta = CONTENT_META[item.contentType];
              return (
                <div key={item.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                  {/* Header */}
                  <div className={`flex items-center justify-between px-3 py-2 bg-gradient-to-r ${pMeta.gradient} opacity-80`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{pMeta.emoji}</span>
                      <span className="text-white text-xs font-medium">{pMeta.label}</span>
                      <span className="text-white/50 text-xs">· {cMeta.emoji} {cMeta.label}</span>
                    </div>
                    <span className="text-white/60 text-xs">
                      {new Date(item.createdAt).toLocaleDateString('en-US', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {/* Subject */}
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Subject</p>
                    <p className="text-white/80 text-sm truncate mt-0.5">{item.subject}</p>
                  </div>
                  {/* Preview */}
                  <div className="px-3 pb-2">
                    <p className="text-white/35 text-xs line-clamp-2 mt-1 leading-relaxed">{item.result}</p>
                  </div>
                  {/* Actions */}
                  <div className="flex border-t border-white/5">
                    <button
                      onClick={() => handleCopy(item.id!, item.result)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all"
                    >
                      {copiedId === item.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                      {copiedId === item.id ? 'Copied!' : 'Copy'}
                    </button>
                    <div className="w-px bg-white/5" />
                    <button
                      onClick={() => item.id && handleDelete(item.id)}
                      className="flex items-center justify-center px-4 py-2.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
