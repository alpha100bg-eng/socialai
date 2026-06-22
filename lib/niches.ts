/**
 * Niche configuration for the multi-account TikTok agent.
 *
 * Each "profile" (TikTok account) runs the same pipeline
 * (trend → content → video → publish) but with a different
 * niche: visual style, subreddits for trends, category rotation,
 * hashtags and safety rules.
 *
 * Adding a new account = add one entry here + run `tiktok:login`
 * with a different session file name.
 */

export type TimeSlot = 'morning' | 'evening';

export interface NicheConfig {
  /** Unique slug — used for file names (sessions, history, memory) */
  id: string;
  /** Human-readable name shown in the dashboard */
  label: string;
  /** Reddit subreddits used by trend-engine for this niche */
  subreddits: string[];
  /** Rotating content categories (one picked per day/slot) */
  categories: string[];
  /** Visual style description injected into the Kling/video prompt */
  videoStyle: string;
  /** 5 "mega" hashtags always included (no # prefix) */
  megaHashtags: string[];
  /** Safety rules specific to this niche, injected into the safety-check prompt */
  safetyRules: string;
  /** Short description of "what this account is" for the Groq system prompt */
  persona: string;
}

export const NICHES: Record<string, NicheConfig> = {
  animals: {
    id:    'animals',
    label: 'Animaux mignons & sauvages',
    subreddits: ['aww', 'AnimalsBeingBros', 'NatureIsFuckingLit', 'rarepuppers', 'likeus'],
    categories: [
      'wild animals in their natural habitat',
      'rescued or abandoned animals finding a forever home',
      'rare and exotic animals most people have never seen',
      'funny and heartwarming domestic pets',
      'animals showing unexpected intelligence or emotion',
      'baby animals taking their first steps',
      'unlikely animal friendships (different species)',
      'animals displaying stunning survival instincts',
    ],
    videoStyle: 'photorealistic wildlife documentary, BBC Planet Earth / Netflix visual quality, golden hour or blue hour lighting',
    megaHashtags: ['animaltiktok', 'fyp', 'viral', 'animals', 'cuteanimals'],
    safetyRules: 'NEVER depict animal death, injury, violence, or suffering. Family-friendly, positive, or educational only.',
    persona: 'a viral TikTok account celebrating wildlife and pets — warm, emotional, and heartwarming',
  },

  motivation: {
    id:    'motivation',
    label: 'Motivation & Mindset',
    subreddits: ['GetMotivated', 'selfimprovement', 'DecidingToBeBetter', 'productivity', 'getdisciplined'],
    categories: [
      'a lone figure overcoming a difficult climb at sunrise',
      'someone training alone before dawn while the world sleeps',
      'a powerful image of discipline and consistency over time',
      'rising from failure — a quiet comeback moment',
      'the calm focus of someone fully committed to their goal',
      'small daily habits compounding into massive change',
      'standing at a crossroads and choosing the harder, better path',
      'a quiet victory after years of unseen effort',
    ],
    videoStyle: 'cinematic and inspirational, golden hour or dramatic blue-hour lighting, silhouettes, slow dolly or drone shots, epic but grounded mood',
    megaHashtags: ['motivation', 'fyp', 'mindset', 'selfimprovement', 'discipline'],
    safetyRules: 'No violence, no real identifiable people, no medical/financial advice claims. Purely visual + text motivation.',
    persona: 'a viral TikTok motivation/mindset account — cinematic visuals paired with short, powerful messages about discipline and growth',
  },

  food: {
    id:    'food',
    label: 'Recettes & Food satisfaisant',
    subreddits: ['food', 'FoodPorn', 'recipes', 'EatCheapAndHealthy', 'cooking'],
    categories: [
      'a satisfying close-up of a dish being plated',
      'melted cheese being pulled apart in slow motion',
      'fresh ingredients being chopped and prepared',
      'a sauce being drizzled over a finished plate',
      'steam rising from a freshly cooked dish',
      'a knife cutting through a perfectly cooked steak or cake',
      'colorful fresh produce arranged beautifully',
      'a street-food style dish being assembled',
    ],
    videoStyle: 'macro food photography, vibrant saturated colors, shallow depth of field, "food porn" satisfying close-up style, soft studio lighting',
    megaHashtags: ['foodtiktok', 'fyp', 'foodie', 'recipe', 'foodporn'],
    safetyRules: 'No raw meat depicted unsafely, no choking hazards implied, no alcohol-focused content. Appetizing and family-friendly only.',
    persona: 'a viral TikTok food account — mouth-watering close-ups of dishes and recipes with short, punchy captions',
  },

  space: {
    id:    'space',
    label: 'Faits insolites — Espace & Science',
    subreddits: ['space', 'interestingasfuck', 'todayilearned', 'Futurology', 'science'],
    categories: [
      'a massive planet seen from the surface of its moon',
      'a spacecraft passing through a colorful nebula',
      'the scale comparison between Earth and a giant star',
      'an astronaut floating against a star-filled void',
      'a black hole bending light around it',
      'a futuristic space station orbiting a alien-looking planet',
      'the surface of Mars or another rocky planet at dawn',
      'a meteor shower streaking across a deep night sky',
    ],
    videoStyle: 'sci-fi cinematic, deep space color palette (blues, purples, neon accents), slow majestic camera movement, ultra high detail, awe-inspiring scale',
    megaHashtags: ['space', 'fyp', 'science', 'didyouknow', 'universe'],
    safetyRules: 'Facts must sound plausible (no obviously false claims). No fear-mongering or doomsday content.',
    persona: 'a viral TikTok "did you know" account about space and science — jaw-dropping visuals with a surprising fact in the caption',
  },

  travel: {
    id:    'travel',
    label: 'Voyage & Destinations de rêve',
    subreddits: ['travel', 'EarthPorn', 'Wanderlust', 'backpacking', 'VillagePorn'],
    categories: [
      'a hidden beach with crystal-clear turquoise water',
      'an ancient city street at golden hour',
      'a misty mountain range seen from above at sunrise',
      'a cozy cabin in a snowy forest with warm lights',
      'a vibrant night market in a bustling Asian city',
      'a cliffside village overlooking the ocean',
      'a vast desert landscape with dramatic dunes at dusk',
      'a waterfall hidden deep in a tropical jungle',
    ],
    videoStyle: 'cinematic travel photography, drone aerial shots or slow pans, vibrant natural colors, golden hour lighting, aspirational and immersive mood',
    megaHashtags: ['traveltiktok', 'fyp', 'travel', 'wanderlust', 'explore'],
    safetyRules: 'No depictions of real identifiable people, no dangerous stunts implied. Aspirational and positive only.',
    persona: 'a viral TikTok travel account showcasing dream destinations — cinematic visuals with a short, evocative caption inviting people to imagine being there',
  },
};

export const DEFAULT_NICHE = 'animals';

export function getNiche(id?: string | null): NicheConfig {
  if (id && NICHES[id]) return NICHES[id];
  return NICHES[DEFAULT_NICHE];
}

export function listNicheIds(): string[] {
  return Object.keys(NICHES);
}

/** Rotate through a niche's categories based on day + slot index */
export function categoryForDay(niche: NicheConfig, slot: TimeSlot): string {
  const day = new Date().getUTCDay(); // 0-6
  const idx = (day * 2 + (slot === 'evening' ? 1 : 0)) % niche.categories.length;
  return niche.categories[idx];
}

/** Derive slot from current UTC hour: 0-12 → morning, 13-23 → evening */
export function getSlotFromTime(): TimeSlot {
  return new Date().getUTCHours() < 13 ? 'morning' : 'evening';
}

export type Tone = 'emotional' | 'funny' | 'inspiring' | 'surprising';

export function toneForSlot(slot: TimeSlot): Tone {
  return slot === 'morning' ? 'inspiring' : 'emotional';
}
