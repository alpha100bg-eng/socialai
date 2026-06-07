/**
 * Animal-focused content generation for TikTok.
 *
 * Generates:
 *  - Viral topic ideas with strong emotional hooks
 *  - Kling 3.0 video prompts (cinematic, 9:16)
 *  - TikTok captions with storytelling structure (hook → story → CTA)
 *  - Niche-relevant hashtags
 */

export type TimeSlot   = 'morning' | 'evening';
export type AnimalTone = 'emotional' | 'funny' | 'inspiring' | 'surprising';

/** Derive slot from current UTC hour: 0-12 → morning, 13-23 → evening */
export function getSlotFromTime(): TimeSlot {
  return new Date().getUTCHours() < 13 ? 'morning' : 'evening';
}

/** Rotate through animal categories based on day + slot index */
function categoryForDay(slot: TimeSlot): string {
  const categories = [
    'wild animals in their natural habitat',
    'rescued or abandoned animals finding a forever home',
    'rare and exotic animals most people have never seen',
    'funny and heartwarming domestic pets',
    'animals showing unexpected intelligence or emotion',
    'baby animals taking their first steps',
    'unlikely animal friendships (different species)',
    'animals displaying stunning survival instincts',
  ];
  const day  = new Date().getUTCDay();  // 0-6
  const idx  = (day * 2 + (slot === 'evening' ? 1 : 0)) % categories.length;
  return categories[idx];
}

/** Returns the ideal emotional tone for the slot */
function toneForSlot(slot: TimeSlot): AnimalTone {
  return slot === 'morning' ? 'inspiring' : 'emotional';
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

export function buildTopicPrompt(slot: TimeSlot): string {
  const category = categoryForDay(slot);
  const tone     = toneForSlot(slot);

  return `You are a viral TikTok content strategist specializing in animal content.

Your niche: ${category}
Emotional tone: ${tone}
Time slot: ${slot} post — ${slot === 'morning' ? 'energizing start to the day' : 'emotional wind-down'}

Generate ONE ultra-specific, viral TikTok video topic about animals.

Requirements:
- The topic must have a POWERFUL hook concept (something surprising, emotional, or heartwarming)
- Must be visually stunning and work without narration (5-second video)
- Must be shareable and emotionally resonant
- Must be specific, not generic

Good examples:
- "A mother elephant gently nudging her newborn calf to stand for the first time at golden hour"
- "A tiny rescued hummingbird drinking nectar from a finger for the first time"
- "Two unlikely best friends — a Great Dane and a baby duckling — napping together"
- "A wolf pack howling together at the moon in a snowy forest clearing"

Output ONLY the specific topic (no quotes, no explanation):`;
}

export function buildVideoPrompt(topic: string): string {
  return `You are an expert Kling 3.0 AI video prompt engineer specializing in wildlife and animal cinematography.

Create a single photorealistic, cinematic video generation prompt for this TikTok topic:
"${topic}"

Format: vertical 9:16 TikTok video, 5 seconds, ultra-realistic, documentary style.

Rules:
- 2 sentences max, 90 words max
- Include: subject animal + action + environment detail + camera movement + lighting + mood
- Use pro cinematic terms: rack focus, shallow depth of field, bokeh, dutch angle, slow dolly, etc.
- Style: BBC Planet Earth / Netflix documentary visual quality
- Lighting: golden hour, blue hour, or dramatic natural light
- NO text overlays, NO logos, NO watermarks, NO humans unless key to story

Output ONLY the video prompt:`;
}

export function buildCaptionPrompt(topic: string, slot: TimeSlot): string {
  const tone = toneForSlot(slot);
  return `You are a viral TikTok copywriter specializing in animal content and emotional storytelling.

Write a TikTok caption for this video: "${topic}"

Structure (MANDATORY):
1. HOOK: First line must stop the scroll in 3 seconds — use emotion, surprise, or a bold statement. Start with an emoji.
2. STORY: 1-2 lines of micro-storytelling. Make it feel personal and real.
3. CTA: End with one engaging question OR action (Save this 🔖, Drop a 🐾, Tell me below...).

Rules:
- Total max 220 characters (without hashtags)
- Tone: ${tone} — ${tone === 'inspiring' ? 'uplifting and motivational' : 'warm, touching, and relatable'}
- 2 emojis max in the main text
- NO hashtags in the caption (they come separately)
- Familial, positive, universal content

Then on a NEW LINE, output exactly 20 animal-niche TikTok hashtags (no # symbol, space-separated).
Mix: 5 mega tags (animaltiktok fyp), 10 niche tags, 5 trending/seasonal tags.

Format:
CAPTION: <hook + story + CTA>
HASHTAGS: <tag1> <tag2> ... <tag20>`;
}

// ─── Structured content prompt (single Groq call → full JSON output) ─────────

/**
 * One-shot prompt that generates the ENTIRE content package as JSON.
 * Incorporates trend context and learned memory patterns.
 *
 * Returns JSON string with shape:
 * { topic, hook, story, cta, caption, hashtags: string[], videoPrompt }
 */
export function buildStructuredContentPrompt(
  slot:         TimeSlot,
  trendContext: string,   // from trend-engine.ts → trendToContext()
  memoryBoost:  string,   // from agent-memory.ts → getMemoryBoost()
): string {
  const category = categoryForDay(slot);
  const tone     = toneForSlot(slot);

  return `You are a viral TikTok animal content machine. Output ONLY valid JSON (no markdown, no extra text).

NICHE: ${category}
TONE: ${tone} — ${tone === 'inspiring' ? 'uplifting, morning energy' : 'warm, emotional, wind-down'}
SLOT: ${slot} post

TREND SIGNAL:
${trendContext}
${memoryBoost}

SAFETY RULES:
- NEVER depict animal death, injury, violence, or suffering
- Family-friendly content only
- Positive, uplifting, or educational

Generate ONE complete TikTok content package. Return this exact JSON:
{
  "topic": "Ultra-specific 1-sentence description of the animal scene",
  "hook": "Caption hook — stops scroll in 3 seconds. Start with emoji. 60 chars max.",
  "story": "1-2 lines micro-story. Warm, personal, real. 100 chars max.",
  "cta": "One engaging question or action. 60 chars max.",
  "caption": "hook + story + cta combined (220 chars max, no hashtags)",
  "hashtags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13","tag14","tag15","tag16","tag17","tag18","tag19","tag20"],
  "videoPrompt": "Cinematic Kling 3.0 prompt. 9:16 vertical, 5s. BBC Planet Earth style. 2 sentences max."
}

Hashtag rules: 5 mega (animaltiktok fyp viral), 10 niche (matching animal category), 5 trending seasonal. No # prefix.`;
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
export function buildSafetyCheckPrompt(topic: string): string {
  return `You are a content safety checker for a family-friendly TikTok animal account.

Evaluate this video topic:
"${topic}"

Rules for UNSAFE content:
- Animal death, killing, predator/prey violence shown graphically
- Animal suffering, abuse, or injury
- Disturbing or traumatic scenes
- Inappropriate for children

Return ONLY valid JSON:
{"safe": true} or {"safe": false, "reason": "short explanation"}`;
}

export function buildCommentReplyPrompt(
  videoTopic: string,
  commentText: string,
  previousReplies: string[],
): string {
  const usedReplies = previousReplies.length > 0
    ? `\n\nPrevious replies to avoid repeating:\n${previousReplies.slice(-5).map((r) => `- ${r}`).join('\n')}`
    : '';

  return `You manage a TikTok account about animals. Your tone is warm, friendly, and enthusiastic — like a passionate animal lover talking to a friend.

Video topic: "${videoTopic}"
Comment to reply to: "${commentText}"${usedReplies}

Write a SHORT, natural reply (1-2 sentences max, 80 chars max).
Rules:
- Sound human and genuine, NOT robotic
- Match the energy of the comment (funny reply to funny, heartfelt to heartfelt)
- Encourage further engagement (ask a follow-up question if natural)
- Use 1 emoji max
- No hashtags
- NEVER use generic phrases like "Thanks for watching!" or "Glad you liked it!"

Output ONLY the reply text:`;
}
