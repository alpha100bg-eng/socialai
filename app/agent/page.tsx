'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  ArrowLeft, Play, RefreshCw, Clock, CheckCircle2, XCircle,
  Loader2, Video, Hash, FileText, Calendar, Zap,
  ExternalLink, Copy, Check, AlertCircle, ChevronDown, ChevronRight,
  Link2, Link2Off, LogIn, BarChart2, MessageCircle, Heart,
  Sun, Moon, Eye, ThumbsUp, Share2, Brain, TrendingUp, Trash2,
} from 'lucide-react';
import type { Publication, RunStatus, TimeSlot } from '@/lib/agent-store';
import { NICHES, listNicheIds, DEFAULT_NICHE } from '@/lib/niches';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TikTokStatus {
  connected:  boolean;
  method?:    'browser' | 'api' | 'none';
  openId?:    string | null;
  expiresAt?: string | null;
  isExpired?: boolean;
}

interface Analytics {
  totals: { views: number; likes: number; comments: number; shares: number };
  engagementRate: string;
  topVideo?: { id: string; title: string; viewCount?: number; shareUrl: string } | null;
}

interface TikTokComment {
  id: string; videoId: string; text: string;
  createTime: number; likeCount: number; username: string; isLiked: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_META: Record<RunStatus, { label: string; color: string; icon: React.ReactNode }> = {
  running:        { label: 'Running…',        color: 'text-blue-400',   icon: <Loader2 size={13} className="animate-spin" /> },
  pending_video:  { label: 'Génération vidéo', color: 'text-violet-400', icon: <Loader2 size={13} className="animate-spin" /> },
  pending_tiktok: { label: 'Publication…',    color: 'text-orange-400', icon: <Loader2 size={13} className="animate-spin" /> },
  published:      { label: 'Publié ✓',        color: 'text-green-400',  icon: <CheckCircle2 size={13} /> },
  failed:         { label: 'Erreur',          color: 'text-red-400',    icon: <XCircle size={13} /> },
};

function fmt(ms?: number) {
  if (!ms) return '—';
  return ms < 60_000 ? `${(ms / 1000).toFixed(0)}s` : `${(ms / 60_000).toFixed(1)}m`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return 'à l\'instant';
  if (diff < 3_600_000)  return `il y a ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
}

function numFmt(n?: number) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded text-white/30 hover:text-white/70 transition-colors">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

function CopyAllButton({ caption, hashtags }: { caption: string; hashtags: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `${caption}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`;
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-white/8 text-white/70 border border-white/15 hover:bg-white/15 transition-colors">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copié !' : 'Copier caption + hashtags'}
    </button>
  );
}

function StepBadge({ step, label, done, active }: { step: number; label: string; done: boolean; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all
      ${done ? 'bg-green-500/15 text-green-400 border border-green-500/20'
      : active ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20'
      : 'bg-white/3 text-white/25 border border-white/5'}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
        ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white animate-pulse' : 'bg-white/10 text-white/30'}`}>
        {done ? '✓' : step}
      </span>
      {label}
    </div>
  );
}

function SlotBadge({ slot }: { slot?: TimeSlot }) {
  if (!slot) return null;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
      slot === 'morning'
        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
    }`}>
      {slot === 'morning' ? <Sun size={9} /> : <Moon size={9} />}
      {slot === 'morning' ? 'Matin' : 'Soir'}
    </span>
  );
}

// ─── Comment panel for a single video ────────────────────────────────────────
function CommentPanel({ pub, profileId }: { pub: Publication; profileId: string }) {
  const [comments, setComments]         = useState<TikTokComment[]>([]);
  const [loading, setLoading]           = useState(false);
  const [replying, setReplying]         = useState<string | null>(null);
  const [replyText, setReplyText]       = useState('');
  const [replyingSending, setReplySending] = useState(false);
  const [sentReplies, setSentReplies]   = useState<Record<string, string>>({});

  const videoId = pub.tikTokVideoId ?? pub.tikTokPublishId;

  const load = async () => {
    if (!videoId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/agent/comments?videoId=${videoId}`);
      const data = await res.json();
      if (data.comments) setComments(data.comments);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const handleAutoReply = async (comment: TikTokComment) => {
    if (!videoId) return;
    setReplying(comment.id);
    try {
      const res  = await fetch('/api/agent/comments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId, commentId: comment.id, commentText: comment.text,
          previousReplies: Object.values(sentReplies), profileId,
        }),
      });
      const data = await res.json();
      if (data.replyText) {
        setSentReplies((prev) => ({ ...prev, [comment.id]: data.replyText }));
        setReplyText(data.replyText);
      }
    } catch { /* ignore */ } finally { setReplying(null); }
  };

  const handleLike = async (comment: TikTokComment) => {
    if (!videoId) return;
    await fetch('/api/agent/comments', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, commentId: comment.id }),
    });
    setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, isLiked: true } : c));
  };

  if (!videoId) return null;

  return (
    <div className="mt-3 space-y-2">
      <button onClick={load} disabled={loading}
        className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors">
        {loading ? <Loader2 size={11} className="animate-spin" /> : <MessageCircle size={11} />}
        {loading ? 'Chargement…' : `Charger les commentaires`}
      </button>

      {comments.map((c) => (
        <div key={c.id} className="bg-white/3 border border-white/6 rounded-xl px-3 py-2.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-semibold text-pink-400">@{c.username}</span>
              <p className="text-xs text-white/70 mt-0.5 leading-relaxed">{c.text}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => handleLike(c)}
                className={`p-1 rounded transition-colors ${c.isLiked ? 'text-red-400' : 'text-white/25 hover:text-red-400'}`}>
                <Heart size={11} fill={c.isLiked ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>

          {sentReplies[c.id] ? (
            <div className="flex items-start gap-1.5 bg-green-500/8 border border-green-500/15 rounded-lg px-2 py-1.5">
              <CheckCircle2 size={10} className="text-green-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-green-400 italic">{sentReplies[c.id]}</p>
            </div>
          ) : (
            <button onClick={() => handleAutoReply(c)} disabled={replying === c.id}
              className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50">
              {replying === c.id ? <Loader2 size={10} className="animate-spin" /> : <MessageCircle size={10} />}
              Répondre avec l&apos;IA
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Publication row ──────────────────────────────────────────────────────────
function PublicationRow({ pub, profileId, defaultOpen = false }: { pub: Publication; profileId: string; defaultOpen?: boolean }) {
  const [open, setOpen]             = useState(defaultOpen);
  const [showComments, setShowComments] = useState(false);
  const meta = STATUS_META[pub.status];

  return (
    <div className="border border-white/8 rounded-2xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.035] transition-colors">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${meta.color} min-w-[130px]`}>
          {meta.icon}{meta.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-white/85 font-medium truncate">{pub.topic || '(génération…)'}</p>
            <SlotBadge slot={pub.slot} />
          </div>
          <p className="text-xs text-white/30 mt-0.5">{relativeTime(pub.createdAt)} · {pub.scheduledFor}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {pub.analytics?.views && (
            <span className="flex items-center gap-1 text-xs text-white/30">
              <Eye size={10} />{numFmt(pub.analytics.views)}
            </span>
          )}
          {pub.durationMs && <span className="text-xs text-white/25 tabular-nums">{fmt(pub.durationMs)}</span>}
          {pub.tikTokShareUrl && (
            <a href={pub.tikTokShareUrl} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-pink-400 hover:text-pink-300">
              <ExternalLink size={11} />TikTok
            </a>
          )}
          {open ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/20" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-white/6 px-5 py-4 space-y-4">
          {pub.videoUrl && (
            <div className="flex gap-4">
              <div className="relative w-24 aspect-[9/16] rounded-xl overflow-hidden bg-black shrink-0">
                <video src={pub.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-md">9:16</span>
                </div>
              </div>
              <div className="flex-1 space-y-3 min-w-0">
                {/* Analytics mini-row */}
                {pub.analytics && (
                  <div className="flex gap-3 text-[10px]">
                    {[
                      { icon: <Eye size={9} />,      val: pub.analytics.views,    label: 'vues',     color: 'text-blue-400' },
                      { icon: <ThumbsUp size={9} />, val: pub.analytics.likes,    label: 'likes',    color: 'text-red-400' },
                      { icon: <MessageCircle size={9} />, val: pub.analytics.comments, label: 'comments', color: 'text-yellow-400' },
                      { icon: <Share2 size={9} />,   val: pub.analytics.shares,   label: 'partages', color: 'text-green-400' },
                    ].map((s) => s.val != null && (
                      <div key={s.label} className={`flex items-center gap-1 ${s.color}`}>
                        {s.icon}{numFmt(s.val)}
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Caption</p>
                  <div className="flex items-start gap-1">
                    <p className="text-xs text-white/70 leading-relaxed">{pub.caption}</p>
                    <CopyButton text={pub.caption} />
                  </div>
                </div>
                {pub.hashtags?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Hashtags</p>
                    <div className="flex flex-wrap gap-1">
                      {pub.hashtags.map((h, i) => (
                        <span key={i} className="text-[10px] bg-pink-500/10 text-pink-400 border border-pink-500/15 px-2 py-0.5 rounded-full">
                          #{h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Actions semi-auto : télécharger la vidéo + copier caption+hashtags */}
                {pub.videoUrl && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a href={pub.videoUrl} target="_blank" rel="noopener noreferrer" download
                      className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-pink-500/20 text-pink-300 border border-pink-500/30 hover:bg-pink-500/30 transition-colors">
                      <Video size={12} /> Télécharger la vidéo
                    </a>
                    <CopyAllButton caption={pub.caption} hashtags={pub.hashtags ?? []} />
                  </div>
                )}
              </div>
            </div>
          )}

          {pub.videoPrompt && (
            <div className="bg-white/3 border border-white/6 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Prompt vidéo IA</p>
              <p className="text-xs text-white/50 leading-relaxed italic">&quot;{pub.videoPrompt}&quot;</p>
            </div>
          )}

          {pub.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 flex gap-2">
              <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{pub.error}</p>
            </div>
          )}

          {/* Comments section */}
          {pub.status === 'published' && pub.tikTokPublishId && (
            <div>
              <button onClick={() => setShowComments(!showComments)}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
                <MessageCircle size={12} />
                {showComments ? 'Masquer commentaires' : 'Gérer les commentaires'}
                {showComments ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
              {showComments && <CommentPanel pub={pub} profileId={profileId} />}
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-[10px] text-white/25">
            {pub.tikTokPublishId && <span>Publish ID: {pub.tikTokPublishId}</span>}
            {pub.falRequestId    && <span className="font-mono">fal: {pub.falRequestId.substring(0, 8)}…</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TikTok connect panel ─────────────────────────────────────────────────────
function TikTokConnectPanel({ profileId }: { profileId: string }) {
  const searchParams                      = useSearchParams();
  const [status, setStatus]               = useState<TikTokStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flashMsg, setFlashMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/tiktok/status?profileId=${profileId}`);
      setStatus(await res.json());
    } catch { /* ignore */ }
  }, [profileId]);

  useEffect(() => {
    fetchStatus();
    const connected = searchParams.get('connected');
    const error     = searchParams.get('error');
    if (connected === 'true') {
      setFlashMsg({ type: 'ok', text: 'TikTok connecté avec succès !' });
      window.history.replaceState({}, '', '/agent');
    } else if (error) {
      setFlashMsg({ type: 'err', text: decodeURIComponent(error) });
      window.history.replaceState({}, '', '/agent');
    }
  }, [fetchStatus, searchParams]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch('/api/tiktok/disconnect', { method: 'POST' });
      setStatus({ connected: false });
      setFlashMsg({ type: 'ok', text: 'TikTok déconnecté.' });
    } catch {
      setFlashMsg({ type: 'err', text: 'Échec de la déconnexion.' });
    } finally { setDisconnecting(false); }
  };

  const isConnected = status?.connected && !status?.isExpired;

  return (
    <div className={`border rounded-2xl p-5 space-y-4 ${
      isConnected ? 'bg-green-500/5 border-green-500/15' : 'bg-white/[0.03] border-white/8'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? <Link2 size={15} className="text-green-400" /> : <Link2Off size={15} className="text-white/30" />}
          <div>
            <h2 className="text-sm font-semibold text-white">Compte TikTok</h2>
            <p className="text-xs text-white/35 mt-0.5">
              {isConnected ? 'Connecté — publication automatique activée' : 'Non connecté — connecte-toi pour activer'}
            </p>
          </div>
        </div>
        {status === null ? (
          <Loader2 size={14} className="text-white/30 animate-spin" />
        ) : isConnected ? (
          <button onClick={handleDisconnect} disabled={disconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-red-500/20 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-all">
            {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
            Déconnecter
          </button>
        ) : (
          <a href="/api/tiktok/auth"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white shadow-lg shadow-pink-500/20 transition-all">
            <LogIn size={14} />Connecter TikTok
          </a>
        )}
      </div>

      {/* Browser session badge */}
      {isConnected && status?.method === 'browser' && (
        <div className="flex items-center gap-2 text-[11px] text-green-400/80">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Session navigateur active — publication directe sans app TikTok
        </div>
      )}

      {/* API token expiry */}
      {isConnected && status?.method === 'api' && status.expiresAt && (
        <p className="text-[10px] text-white/30">
          Token expire le {new Date(status.expiresAt).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {status?.connected && status.isExpired && (
        <div className="flex items-start gap-2 bg-yellow-500/8 border border-yellow-500/15 rounded-xl px-3 py-2.5">
          <AlertCircle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-yellow-400">Session expirée</p>
            <p className="text-[10px] text-yellow-400/60 mt-0.5">Lance <code className="bg-white/10 px-1 rounded">npm run tiktok:login</code> pour reconnecter.</p>
          </div>
        </div>
      )}

      {!isConnected && status !== null && (
        <div className="bg-white/3 border border-white/6 rounded-xl px-3 py-3 space-y-1.5 text-[11px] text-white/40 leading-relaxed">
          <p className="font-semibold text-white/70">✅ Méthode simple — aucune app à créer :</p>
          <div className="bg-green-500/8 border border-green-500/15 rounded-lg px-2.5 py-2 space-y-1">
            <p className="text-green-400/90 font-medium">1. Ouvre un terminal dans <code className="bg-white/10 px-1 rounded">socialai/</code></p>
            <p className="text-green-400/90">2. Lance : <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono">npm run tiktok:login</code></p>
            <p className="text-green-400/90">3. Connecte-toi dans le navigateur qui s&apos;ouvre</p>
            <p className="text-green-400/90">4. Reviens ici — l&apos;agent publie automatiquement 🎉</p>
          </div>
          <p className="text-white/25 pt-1">La session est sauvegardée localement. Tu ne fais ça qu&apos;une seule fois.</p>
        </div>
      )}

      {flashMsg && (
        <div className={`text-xs px-3 py-2 rounded-xl border flex items-center gap-2 ${
          flashMsg.type === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {flashMsg.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {flashMsg.text}
        </div>
      )}
    </div>
  );
}

// ─── Memory panel ─────────────────────────────────────────────────────────────
interface AgentMemoryData {
  bestHooks:         string[];
  bestTopics:        string[];
  failedStyles:      string[];
  avgScore:          number;
  totalPublished:    number;
  lastUpdated:       string;
}

function MemoryPanel({ profileId }: { profileId: string }) {
  const [mem, setMem]       = useState<AgentMemoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET ?? 'dev';

  const load = async () => {
    setLoading(true);
    try { setMem(await (await fetch(`/api/agent/memory?profileId=${profileId}`)).json()); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  const runFeedback = async () => {
    setFeedback('running');
    try {
      const res  = await fetch('/api/agent/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      setFeedback(data.success ? `✅ ${data.scored} vidéo(s) scorées — avg ${data.memory?.avgScore}/10` : `❌ ${data.error}`);
      load();
    } catch { setFeedback('❌ Erreur réseau'); }
  };

  useEffect(() => { load(); }, [profileId]);

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-violet-400" />
          <div>
            <h2 className="text-sm font-semibold text-white">Mémoire adaptative</h2>
            {mem && <p className="text-[10px] text-white/30">{mem.totalPublished} vidéos apprises · score moyen {mem.avgScore.toFixed(1)}/10</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
          <button onClick={runFeedback} disabled={feedback === 'running'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-violet-500/20 text-violet-400 hover:bg-violet-500/10 disabled:opacity-40 transition-all">
            {feedback === 'running' ? <Loader2 size={11} className="animate-spin" /> : <TrendingUp size={11} />}
            Mettre à jour
          </button>
        </div>
      </div>

      {feedback && feedback !== 'running' && (
        <p className={`text-xs px-3 py-1.5 rounded-lg border ${feedback.startsWith('✅') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {feedback}
        </p>
      )}

      {mem && (
        <div className="space-y-3">
          {mem.bestTopics.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-green-400/70 uppercase tracking-widest mb-1.5">✅ Sujets performants</p>
              <div className="space-y-1">
                {mem.bestTopics.slice(0, 3).map((t, i) => (
                  <p key={i} className="text-[11px] text-white/50 bg-green-500/5 border border-green-500/10 rounded-lg px-2.5 py-1.5 truncate">{t}</p>
                ))}
              </div>
            </div>
          )}
          {mem.bestHooks.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-blue-400/70 uppercase tracking-widest mb-1.5">🎣 Hooks prouvés</p>
              <div className="space-y-1">
                {mem.bestHooks.slice(0, 2).map((h, i) => (
                  <p key={i} className="text-[11px] text-white/50 bg-blue-500/5 border border-blue-500/10 rounded-lg px-2.5 py-1.5 italic truncate">&quot;{h}&quot;</p>
                ))}
              </div>
            </div>
          )}
          {mem.failedStyles.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-red-400/70 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Trash2 size={9} /> À éviter
              </p>
              <div className="space-y-1">
                {mem.failedStyles.slice(0, 2).map((f, i) => (
                  <p key={i} className="text-[11px] text-white/30 bg-red-500/5 border border-red-500/10 rounded-lg px-2.5 py-1.5 line-through truncate">{f}</p>
                ))}
              </div>
            </div>
          )}
          {mem.totalPublished === 0 && (
            <p className="text-xs text-white/25 text-center py-2">
              La mémoire se remplit après les premières publications 🐾
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analytics panel ──────────────────────────────────────────────────────────
function AnalyticsPanel({ profileId }: { profileId: string }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/agent/analytics?profileId=${profileId}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setAnalytics(data);
    } catch (e) {
      setError(String(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Analytics TikTok</h2>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg hover:bg-white/5">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-yellow-500/8 border border-yellow-500/15 rounded-xl px-3 py-2.5">
          <AlertCircle size={12} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-yellow-400">{error.includes('comment.list') || error.includes('video.list')
            ? 'Scope video.list non approuvé — demande l\'accès dans le portail TikTok Developer.'
            : error}</p>
        </div>
      )}

      {analytics ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: <Eye size={12} />,          label: 'Vues',    value: numFmt(analytics.totals.views),    color: 'text-blue-400' },
              { icon: <ThumbsUp size={12} />,     label: 'Likes',   value: numFmt(analytics.totals.likes),    color: 'text-red-400' },
              { icon: <MessageCircle size={12} />,label: 'Comments',value: numFmt(analytics.totals.comments), color: 'text-yellow-400' },
              { icon: <Share2 size={12} />,       label: 'Partages',value: numFmt(analytics.totals.shares),   color: 'text-green-400' },
            ].map((s) => (
              <div key={s.label} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
                <div className={`flex justify-center mb-1 ${s.color}`}>{s.icon}</div>
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-white/30">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-white/40">
            <span>Taux d&apos;engagement : <strong className="text-white/70">{analytics.engagementRate}%</strong></span>
            {analytics.topVideo && (
              <a href={analytics.topVideo.shareUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-pink-400 hover:text-pink-300">
                <ExternalLink size={11} />Meilleure vidéo ({numFmt(analytics.topVideo.viewCount)} vues)
              </a>
            )}
          </div>
        </>
      ) : !loading && !error && (
        <p className="text-xs text-white/30 text-center py-4">Clique sur Actualiser pour charger les stats TikTok</p>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function AgentDashboard() {
  const [publications, setPublications]     = useState<Publication[]>([]);
  const [serverRunning, setServerRunning]   = useState(false);
  const [isTriggering, setIsTriggering]     = useState(false);
  const [triggerResult, setTriggerResult]   = useState<string | null>(null);
  const [totalRuns, setTotalRuns]           = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [lastRefresh, setLastRefresh]       = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot]     = useState<TimeSlot>('morning');
  const [profileId, setProfileId]           = useState<string>(DEFAULT_NICHE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const [histRes, statusRes] = await Promise.all([
        fetch(`/api/agent/history?limit=30&profileId=${profileId}`),
        fetch(`/api/agent/status?profileId=${profileId}`),
      ]);
      const hist   = await histRes.json();
      const status = await statusRes.json();
      setPublications(hist.publications ?? []);
      setServerRunning(hist.isRunning || status.isRunning);
      setTotalRuns(status.totalRuns ?? 0);
      setPublishedCount(status.publishedCount ?? 0);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
  }, [profileId]);

  useEffect(() => {
    fetchHistory();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchHistory]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (serverRunning || isTriggering) {
      pollRef.current = setInterval(fetchHistory, 4000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [serverRunning, isTriggering, fetchHistory]);

  const handleRunNow = async (force = false) => {
    setIsTriggering(true);
    setTriggerResult(null);
    try {
      const res  = await fetch('/api/agent/daily-run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? 'dev'}` },
        body: JSON.stringify({ force, slot: selectedSlot, profileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTriggerResult(`❌ ${data.error}`);
      } else {
        setTriggerResult(data.warning ? `⚠️ ${data.warning}` : `✅ Publié ! Sujet : "${data.topic}"`);
        fetchHistory();
      }
    } catch (e) {
      setTriggerResult(`❌ Erreur réseau : ${e}`);
    } finally { setIsTriggering(false); }
  };

  const latestRun  = publications[0];
  const activeSteps = latestRun ? {
    topic:   !!latestRun.topic,
    video:   !!latestRun.videoUrl,
    caption: latestRun.caption !== '',
    tiktok:  latestRun.status === 'published',
  } : null;

  const isActive = serverRunning || isTriggering ||
    (['running', 'pending_video', 'pending_tiktok'] as RunStatus[]).includes(latestRun?.status as RunStatus);

  // Count today's slots
  const today          = new Date().toISOString().split('T')[0];
  const todayPubs      = publications.filter((p) => p.scheduledFor === today && p.status === 'published');
  const morningDone    = todayPubs.some((p) => p.slot === 'morning');
  const eveningDone    = todayPubs.some((p) => p.slot === 'evening');

  return (
    <div className="min-h-screen bg-[#030712]">
      {/* Header */}
      <div className="border-b border-white/6 bg-black/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/40 hover:text-white/70 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="font-bold text-white text-sm">{NICHES[profileId]?.label ?? 'TikTok Agent'}</h1>
              <p className="text-white/30 text-xs">2 vidéos/jour · Storytelling · Kling 3.0 + Groq</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Profile selector */}
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="bg-white/5 border border-white/10 text-xs text-white/70 rounded-xl px-2 py-1.5 outline-none focus:border-white/20"
            >
              {listNicheIds().map((id) => (
                <option key={id} value={id} className="bg-[#030712]">{NICHES[id].label}</option>
              ))}
            </select>
            {/* Today's slot indicators */}
            <div className="flex items-center gap-1">
              <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                morningDone ? 'bg-yellow-500/15 border-yellow-500/25 text-yellow-400' : 'bg-white/5 border-white/10 text-white/25'
              }`}>
                <Sun size={9} />{morningDone ? '✓' : '—'}
              </span>
              <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                eveningDone ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400' : 'bg-white/5 border-white/10 text-white/25'
              }`}>
                <Moon size={9} />{eveningDone ? '✓' : '—'}
              </span>
            </div>
            {isActive && (
              <span className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />En cours
              </span>
            )}
            <button onClick={fetchHistory} className="p-2 text-white/30 hover:text-white/60 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">

        {/* TikTok connection */}
        <Suspense fallback={null}>
          <TikTokConnectPanel profileId={profileId} />
        </Suspense>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: <Calendar size={15} />,     label: 'Runs total',   value: totalRuns },
            { icon: <CheckCircle2 size={15} />, label: 'Publiés',      value: publishedCount },
            { icon: <Sun size={15} />,          label: 'Matin',        value: todayPubs.filter((p) => p.slot === 'morning').length, color: 'text-yellow-400' },
            { icon: <Moon size={15} />,         label: 'Soir',         value: todayPubs.filter((p) => p.slot === 'evening').length, color: 'text-indigo-400' },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 text-center">
              <div className={`flex justify-center mb-2 ${s.color ?? 'text-white/30'}`}>{s.icon}</div>
              <p className={`text-lg font-bold ${s.color ?? 'text-white'}`}>{s.value}</p>
              <p className="text-xs text-white/30 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Live pipeline */}
        {isActive && latestRun && (
          <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 size={15} className="text-blue-400 animate-spin" />
              <p className="text-sm font-semibold text-blue-300">Pipeline en cours…</p>
              {latestRun.topic && <span className="text-xs text-blue-300/60 ml-1">&quot;{latestRun.topic}&quot;</span>}
              <SlotBadge slot={latestRun.slot} />
            </div>
            {activeSteps && (
              <div className="flex flex-wrap gap-2">
                <StepBadge step={1} label="Sujet animal" done={activeSteps.topic}   active={!activeSteps.topic} />
                <StepBadge step={2} label="Vidéo Kling"  done={activeSteps.video}   active={activeSteps.topic && !activeSteps.video} />
                <StepBadge step={3} label="Caption"      done={activeSteps.caption} active={activeSteps.video && !activeSteps.caption} />
                <StepBadge step={4} label="TikTok"       done={activeSteps.tiktok}  active={activeSteps.caption && !activeSteps.tiktok} />
              </div>
            )}
          </div>
        )}

        {/* Manual trigger */}
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Lancer manuellement</h2>
              <p className="text-xs text-white/35 mt-0.5">
                Cron : <strong className="text-white/60">8h UTC</strong> (matin) et <strong className="text-white/60">18h UTC</strong> (soir)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Slot selector */}
              <div className="flex rounded-xl border border-white/10 overflow-hidden">
                {(['morning', 'evening'] as TimeSlot[]).map((s) => (
                  <button key={s} onClick={() => setSelectedSlot(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedSlot === s ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
                    }`}>
                    {s === 'morning' ? <Sun size={11} /> : <Moon size={11} />}
                    {s === 'morning' ? 'Matin' : 'Soir'}
                  </button>
                ))}
              </div>
              <button onClick={() => handleRunNow(true)} disabled={isActive || isTriggering}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <RefreshCw size={13} />Forcer
              </button>
              <button onClick={() => handleRunNow(false)} disabled={isActive || isTriggering}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white shadow-lg shadow-pink-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {isTriggering ? <><Loader2 size={14} className="animate-spin" />En cours…</> : <><Play size={14} />Publier</>}
              </button>
            </div>
          </div>
          {triggerResult && (
            <div className={`text-xs px-3 py-2 rounded-xl border ${
              triggerResult.startsWith('✅') ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : triggerResult.startsWith('⚠️') ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>{triggerResult}</div>
          )}
        </div>

        {/* Schedule info */}
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-yellow-400" />
            <h2 className="text-sm font-semibold text-white">Pipeline & Modèles</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { icon: <Sun size={11} />,      label: 'Slot matin',   value: 'Tous les jours à 8h UTC',    color: 'text-yellow-400' },
              { icon: <Moon size={11} />,     label: 'Slot soir',    value: 'Tous les jours à 18h UTC',   color: 'text-indigo-400' },
              { icon: <Video size={11} />,    label: 'Vidéo',        value: 'Kling 3.0 4K (9:16, 5s)',   color: 'text-violet-400' },
              { icon: <FileText size={11} />, label: 'Texte',        value: 'Llama 3.3 70B (Groq)',       color: 'text-blue-400' },
              { icon: <Hash size={11} />,     label: 'Hashtags',     value: '20 tags niche animaux',      color: 'text-pink-400' },
              { icon: <Clock size={11} />,    label: 'Durée max',    value: '5 min / vidéo',              color: 'text-white/60' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 bg-white/3 rounded-xl px-3 py-2">
                <span className={item.color}>{item.icon}</span>
                <div>
                  <p className="text-white/30">{item.label}</p>
                  <p className={`font-medium ${item.color}`}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Memory */}
        <MemoryPanel profileId={profileId} />

        {/* Analytics */}
        <AnalyticsPanel profileId={profileId} />

        {/* Publication history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Historique</h2>
            <span className="text-xs text-white/25">{publications.length} publications</span>
          </div>
          {publications.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-14 text-center border border-white/6 rounded-2xl">
              <div className="text-4xl">🐾</div>
              <div>
                <p className="text-sm font-semibold text-white/50">Aucune publication</p>
                <p className="text-xs text-white/25 mt-1">Lance le premier run pour générer ta vidéo animalière</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {publications.map((pub, i) => (
                <PublicationRow key={pub.id} pub={pub} profileId={profileId} defaultOpen={i === 0 && isActive} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
