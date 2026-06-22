/**
 * Generic, niche-aware content generation prompts for the multi-account
 * TikTok agent. Generalizes lib/animal-content.ts to support any niche
 * defined in lib/niches.ts.
 */

import { NicheConfig, TimeSlot, categoryForDay, toneForSlot } from './niches';

// ─── Structured content prompt (single Groq call → full JSON output) ─────────

/**
 * One-shot prompt that generates the ENTIRE content package as JSON.
 * Incorporates trend context and learned memory patterns.
 *
 * Returns JSON string with shape:
 * { topic, hook, story, cta, caption, hashtags: string[], videoPrompt }
 */
export function buildStructuredContentPrompt(
  niche:        NicheConfig,
  slot:         TimeSlot,
  trendContext: string,   // from trend-engine.ts → trendToContext()
  memoryBoost:  string,   // from agent-memory.ts → getMemoryBoost()
): string {
  const category = categoryForDay(niche, slot);
  const tone      = toneForSlot(slot);

  return `You are ${niche.persona}. Output ONLY valid JSON (no markdown, no extra text).

NICHE FOCUS: ${category}
TONE: ${tone} — ${tone === 'inspiring' ? 'uplifting, morning energy' : 'warm, emotional, wind-down'}
SLOT: ${slot} post

TREND SIGNAL:
${trendContext}
${memoryBoost}

SAFETY RULES:
${niche.safetyRules}

Generate ONE complete TikTok content package. Return this exact JSON:
{
  "topic": "Ultra-specific 1-sentence description of the visual scene",
  "hook": "Caption hook — stops scroll in 3 seconds. Start with emoji. 60 chars max.",
  "story": "1-2 lines micro-story or insight. 100 chars max.",
  "cta": "One engaging question or action. 60 chars max.",
  "caption": "hook + story + cta combined (220 chars max, no hashtags)",
  "hashtags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13","tag14","tag15","tag16","tag17","tag18","tag19","tag20"],
  "videoPrompt": "Cinematic Kling/video prompt. 9:16 vertical, 5s. ${niche.videoStyle}. 2 sentences max."
}

Hashtag rules: 5 mega tags (${niche.megaHashtags.join(' ')}), 10 niche-relevant tags, 5 trending/seasonal tags. No # prefix.`;
}

/** Parse structured JSON output from Groq, with fallback extraction */
export interface StructuredContent {
  topic:       string;
  hook:        string;
  story:       string;
  cta:         string;
  caption:     string;
  hashtags:    string[];
  videoPrompt: string;
}

export function parseStructuredContent(raw: string): StructuredContent | null {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<StructuredContent>;
    if (!parsed.topic || !parsed.caption || !parsed.videoPrompt) return null;
    return {
      topic:       parsed.topic       ?? '',
      hook:        parsed.hook        ?? '',
      story:       parsed.story       ?? '',
      cta:         parsed.cta         ?? '',
      caption:     parsed.caption     ?? parsed.topic,
      hashtags:    Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 20) : [],
      videoPrompt: parsed.videoPrompt ?? '',
    };
  } catch {
    return null;
  }
}

/** Safety check prompt — returns JSON { safe: boolean, reason: string } */
export function buildSafetyCheckPrompt(niche: NicheConfig, topic: string): string {
  return `You are a content safety checker for a family-friendly TikTok account.

Evaluate this video topic:
"${topic}"

Rules for UNSAFE content:
${niche.safetyRules}
- Disturbing or traumatic scenes
- Inappropriate for children

Return ONLY valid JSON:
{"safe": true} or {"safe": false, "reason": "short explanation"}`;
}

export function buildCommentReplyPrompt(
  niche: NicheConfig,
  videoTopic: string,
  commentText: string,
  previousReplies: string[],
): string {
  const usedReplies = previousReplies.length > 0
    ? `\n\nPrevious replies to avoid repeating:\n${previousReplies.slice(-5).map((r) => `- ${r}`).join('\n')}`
    : '';

  return `You manage ${niche.persona}. Your tone is warm, friendly, and enthusiastic — like talking to a friend.

Video topic: "${videoTopic}"
Comment to reply to: "${commentText}"${usedReplies}

Write a SHORT, natural reply (1-2 sentences max, 80 chars max).
Rules:
- Sound human and genuine, NOT robotic
- Match the energy of the comment
- Encourage further engagement (ask a follow-up question if natural)
- Use 1 emoji max
- No hashtags
- NEVER use generic phrases like "Thanks for watching!" or "Glad you liked it!"

Output ONLY the reply text:`;
}
