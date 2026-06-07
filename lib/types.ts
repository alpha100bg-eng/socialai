export type Platform = 'instagram' | 'tiktok' | 'twitter';
export type ContentType = 'post' | 'script' | 'thread';
export type Tone = 'viral' | 'pro' | 'humour' | 'inspirant';

export interface Generation {
  id?: number;
  platform: Platform;
  contentType: ContentType;
  tone: Tone;
  subject: string;
  result: string;
  createdAt: string; // ISO
}

export interface FreemiumState {
  used: number;
  limit: number;
  isPremium: boolean;
}

export const PLATFORM_META: Record<Platform, { label: string; emoji: string; color: string; gradient: string }> = {
  instagram: {
    label: 'Instagram',
    emoji: '📸',
    color: 'text-pink-500',
    gradient: 'from-purple-500 via-pink-500 to-orange-400',
  },
  tiktok: {
    label: 'TikTok',
    emoji: '🎵',
    color: 'text-cyan-400',
    gradient: 'from-gray-900 via-gray-800 to-cyan-600',
  },
  twitter: {
    label: 'Twitter / X',
    emoji: '𝕏',
    color: 'text-sky-400',
    gradient: 'from-sky-500 to-blue-600',
  },
};

export const CONTENT_META: Record<ContentType, { label: string; desc: string; emoji: string }> = {
  post:   { label: 'Post',          desc: 'Caption + hashtags',     emoji: '✍️' },
  script: { label: 'Video Script',  desc: 'Hook + full narration',  emoji: '🎬' },
  thread: { label: 'Thread',        desc: '6 connected tweets',     emoji: '🧵' },
};

export const TONE_META: Record<Tone, { label: string; emoji: string }> = {
  viral:     { label: 'Viral',        emoji: '🔥' },
  pro:       { label: 'Professional', emoji: '💼' },
  humour:    { label: 'Humor',        emoji: '😂' },
  inspirant: { label: 'Inspiring',    emoji: '✨' },
};
