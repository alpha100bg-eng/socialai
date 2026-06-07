import { NextRequest, NextResponse } from 'next/server';
import type { Platform, ContentType, Tone } from '@/lib/types';

export const dynamic = 'force-dynamic';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

// ─── Tone descriptions ────────────────────────────────────────────────────────
const TONE_MAP: Record<Tone, string> = {
  viral:      'viral, attention-grabbing, impossible to scroll past',
  pro:        'professional, credible, authoritative expert voice',
  humour:     'funny, witty, playful — makes people laugh and share',
  inspirant:  'deeply inspiring, motivating, emotionally resonant',
};

// ─── Structured prompt builders ───────────────────────────────────────────────

function buildInstagramPost(subject: string, tone: string): string {
  return `You are a world-class Instagram content strategist. Create a high-performing Instagram post for: **${subject}**

Tone: ${tone}

Respond EXACTLY in this format (keep the ### headers, they are required):

### CAPTION
[Write an engaging, scroll-stopping Instagram caption. 150-250 words. Use strategic emojis throughout. Include a compelling hook on the first line, storytelling in the body, and a clear CTA at the end. No generic phrases.]

### HASHTAGS
[Write exactly 20 highly relevant hashtags — mix of popular (#1M+ posts), medium (#100K-1M), and niche (<100K) tags. Format: #tag1 #tag2 #tag3 ...]

### IMAGE SUGGESTION
[Describe in 2-3 sentences the ideal photo or visual for this post: composition, lighting, colors, mood, what to show. Be very specific and actionable.]

Generate now:`;
}

function buildTikTokScript(subject: string, tone: string): string {
  return `You are a viral TikTok content creator with 10M+ followers. Write a TikTok/Reels script for: **${subject}**

Tone: ${tone}

Respond EXACTLY in this format (keep the ### headers, they are required):

### HOOK (0–3s)
[One powerful, pattern-interrupting opening sentence. This must stop the scroll instantly. 15-20 words max.]

### NARRATION
[Full voiceover script — 60 to 90 seconds when read aloud (~200-270 words). Write naturally, conversationally. Insert [ON-SCREEN TEXT: "text here"] inline at key moments for visual reinforcement. Use short punchy sentences.]

### ON-SCREEN TEXT
[List each text overlay on its own line with a dash:
- Text 1
- Text 2
- Text 3 (etc.)]

### MUSIC SUGGESTION
[Recommend 2-3 specific songs or audio styles that would match perfectly. Include artist name if a real track.]

### CTA
[One strong 1-2 sentence call-to-action for end of video — follow, comment, duet, etc.]

Generate now:`;
}

function buildTwitterThread(subject: string, tone: string): string {
  return `You are a top Twitter/X thought leader known for viral threads. Write a thread about: **${subject}**

Tone: ${tone}

Rules:
- Write 6 tweets total, numbered [1/6] through [6/6]
- Tweet [1/6]: Ultra-compelling hook — must make people click "read more". Max 220 chars.
- Tweets [2/6]–[5/6]: Each delivers one key insight, stat, or story beat. 200-270 chars each.
- Tweet [6/6]: Strong CTA — ask a question, request RT, or invite to follow. Max 240 chars.
- Each tweet must stand alone AND connect to the next
- Use line breaks within tweets for readability
- NO hashtag spam — max 1-2 per tweet if relevant
- Separate each tweet with a blank line

Respond EXACTLY in this format (keep the [N/6] numbering):

[1/6]
[tweet text]

[2/6]
[tweet text]

[3/6]
[tweet text]

[4/6]
[tweet text]

[5/6]
[tweet text]

[6/6]
[tweet text]

Generate now:`;
}

function buildInstagramScript(subject: string, tone: string): string {
  return buildTikTokScript(subject, tone); // Reels = same format
}

function buildTwitterPost(subject: string, tone: string): string {
  return `You are a Twitter/X expert. Write a single viral tweet about: **${subject}**

Tone: ${tone}

Rules:
- Max 280 characters
- Hook immediately — first 5 words must grip
- Include 1-2 relevant hashtags max
- End with a question or CTA to drive engagement

Respond EXACTLY in this format:

### TWEET
[your tweet text here]

### THREAD HOOK
[One follow-up sentence that could start a thread if the user wants to expand — not a full tweet, just a teaser]

Generate now:`;
}

// ─── Router ───────────────────────────────────────────────────────────────────
function buildPrompt(platform: Platform, contentType: ContentType, tone: Tone, subject: string): string {
  const t = TONE_MAP[tone];

  if (platform === 'instagram' && contentType === 'post')    return buildInstagramPost(subject, t);
  if (platform === 'instagram' && contentType === 'script')  return buildInstagramScript(subject, t);
  if (platform === 'tiktok')                                  return buildTikTokScript(subject, t);
  if (platform === 'twitter' && contentType === 'thread')    return buildTwitterThread(subject, t);
  if (platform === 'twitter' && contentType === 'post')      return buildTwitterPost(subject, t);

  // Fallback
  return buildInstagramPost(subject, t);
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { platform, contentType, tone, subject } = await req.json();

    if (!platform || !contentType || !tone || !subject?.trim()) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Groq API key not configured' }, { status: 500 });
    }

    const prompt = buildPrompt(platform, contentType, tone, subject.trim());

    const response = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
        temperature: 0.88,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();

    if (!result) {
      return NextResponse.json({ error: 'No content generated' }, { status: 500 });
    }

    return NextResponse.json({ result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
