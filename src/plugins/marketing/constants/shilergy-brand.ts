// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Brand Constants
// Single source of truth — replaces SKILL.md entirely.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentPillar, Platform, ValidationResult } from '../types';

// ─── Products ─────────────────────────────────────────────────────────────────

export const PRODUCTS = {
  GOLD_BLEND: {
    name: 'Shilergy Gold Blend',
    tagline: 'The only 4-in-1 ancient Rasayana formula available today.',
    ingredients: [
      'Pure Himalayan Shilajit (fulvic acid + 85+ trace minerals)',
      'Monatomic 24K Edible Gold (ormus gold, cellular resonance)',
      'Ashwagandha KSM-66 (adaptogen, cortisol balance)',
      'Safed Musli (vitality, testosterone, stamina)',
    ],
    benefits: [
      'Boosts testosterone and vitality naturally',
      'Lowers cortisol, reduces stress and anxiety',
      'Enhances cellular energy and mitochondrial function',
      'Improves stamina, endurance, and recovery',
      'Supports mental clarity and nervous system coherence',
    ],
  },
  PURE: {
    name: 'Shilergy Pure',
    tagline: 'Raw, uncut, unadulterated. What Shilajit was always meant to be.',
    ingredients: ['100% Pure Himalayan Shilajit resin'],
    specs: ['Minimum 60% fulvic acid', 'Sourced from 16,000+ feet elevation', 'Lab-tested, heavy metal free'],
    benefits: [
      '85+ trace minerals your body is missing',
      'Fulvic acid supercharges nutrient absorption',
      'Natural energy without caffeine or stimulants',
      'Supports deep sleep, immune system, and joint health',
      'Tested clean — no heavy metals, no fillers',
    ],
  },
} as const;

// ─── Brand Voice ──────────────────────────────────────────────────────────────

export const BRAND_VOICE = {
  tone: 'Ancient wisdom meets modern science. Grounded, powerful, educational, slightly mystical but always evidence-backed.',
  audience: [
    'Men and women 25-50 seeking energy, vitality, hormonal balance, mental clarity, strength, and deep recovery',
    'Biohackers and performance athletes',
    'Ayurveda enthusiasts and wellness seekers',
    'Natural testosterone optimization community',
    'Spiritual health community',
  ],
  alwaysDo: ['Educate first, sell second', 'Cite ancient texts or research lightly', 'Speak with authority and calm confidence'],
  neverDo: ['Hype bro marketing or steroid culture language', 'Use fake urgency', 'Use banned words'],
} as const;

// ─── Content Pillars ──────────────────────────────────────────────────────────

export const CONTENT_PILLARS: Record<ContentPillar, string> = {
  SCIENCE_OF_SHILAJIT: 'Fulvic acid, minerals, how Shilajit works in the body at a cellular level.',
  ANCIENT_WISDOM: 'Ayurveda, Charaka Samhita references, Rasayana tradition and its modern relevance.',
  INGREDIENT_SPOTLIGHT: 'Deep dives into Monatomic Gold, Ashwagandha, Safed Musli, and Shilajit.',
  LIFESTYLE_AND_PERFORMANCE: 'Morning stacks, gym recovery, energy routines, sleep optimization.',
  BRAND_STORY_AND_TRUST: 'Himalayan sourcing, purity testing, lab results, community results.',
};

// ─── Platform Tones ───────────────────────────────────────────────────────────

export const PLATFORM_TONES: Record<Platform, string> = {
  instagram: 'Visual, mystical energy. Bold scroll-stopping hook + 3-4 short punchy paragraphs + 8-10 hashtags.',
  linkedin: 'Educational, professional wellness angle. Cite Ayurveda or research lightly. Numbered insights. No hashtags.',
  twitter: 'Bold provocative hook, 1-3 punchy sentences, or a 4-tweet thread. No hashtags.',
  facebook: 'Warm, community storytelling. Slightly longer. Soft CTA at end.',
  threads: 'Conversational, curious tone, question-based hooks.',
};

// ─── Hashtags ─────────────────────────────────────────────────────────────────

export const HASHTAG_POOL = [
  '#Shilergy', '#Shilajit', '#PureShilajit', '#HimalayanShilajit',
  '#MonatomicGold', '#OrbusGold', '#Ashwagandha', '#SafedMusli',
  '#AyurvedaSupplements', '#RasayanaFormula', '#BiohackingIndia',
  '#NaturalTestosterone', '#FulvicAcid', '#AdaptogenLife',
  '#AncientMedicine', '#HolisticHealth', '#EnergyHealing',
  '#NaturalVitality', '#HimalayanHerbs', '#WellnessIndia',
];

/** Returns 8-10 randomly selected hashtags from the pool */
export function pickHashtags(count = 9): string {
  const shuffled = [...HASHTAG_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).join(' ');
}

// ─── CTA Rotation ─────────────────────────────────────────────────────────────

export const CTA_ROTATION = [
  'Link in bio... try Shilergy Gold Blend or Pure Shilajit',
  'Comment GOLD and I will send you our full ingredient breakdown',
  'What does your morning wellness stack look like? Comment below',
  "DM us 'ENERGY' for a personalized recommendation",
  'Save this post before scrolling... your body will thank you',
  'Tag someone who needs this in their life',
] as const;

/** Returns a CTA based on the week day index (rotates deterministically) */
export function pickCta(dayIndex: number): string {
  return CTA_ROTATION[dayIndex % CTA_ROTATION.length];
}

// ─── Banned Words (FDA / AYUSH Compliance) ───────────────────────────────────

export const BANNED_WORDS = [
  'cure',
  'treat',
  'diagnose',
  'prevent disease',
  'clinically proven',
  'guaranteed results',
  '—',       // em dash — use "..." instead
] as const;

/**
 * Validates post text for banned words and compliance issues.
 * Call this on every platform post before saving it.
 */
export function validateContent(text: string): ValidationResult {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      violations.push(word);
    }
  }

  // Flag excessive exclamation marks (more than 1)
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 1) {
    violations.push(`too many exclamation marks (${exclamationCount}, max 1)`);
  }

  return { valid: violations.length === 0, violations };
}

// ─── Gemini Image Style ───────────────────────────────────────────────────────

export const IMAGE_STYLE = {
  palette: 'deep earth browns, Himalayan gold, midnight black, forest green',
  mood: 'ancient, powerful, pure, mystical',
  suffix: 'no text in image, ultra-detailed, cinematic, 4K, photorealistic',
} as const;

/**
 * Builds a full Gemini Imagen prompt from a high-level concept.
 */
export function buildGeminiPrompt(imageConcept: string): string {
  return `Cinematic photography, ${imageConcept}, color palette: ${IMAGE_STYLE.palette}, mood: ${IMAGE_STYLE.mood}, ${IMAGE_STYLE.suffix}`;
}

// ─── Product rotation schedule ────────────────────────────────────────────────

/** 7-day product rotation: Gold Blend on 0=Mon,2=Wed,4=Fri,6=Sun, Pure otherwise */
export const PRODUCT_ROTATION: Array<'Gold Blend' | 'Pure'> = [
  'Gold Blend', // Monday
  'Pure',       // Tuesday
  'Gold Blend', // Wednesday
  'Pure',       // Thursday
  'Gold Blend', // Friday
  'Pure',       // Saturday
  'Gold Blend', // Sunday
];

// ─── Research query templates ─────────────────────────────────────────────────

export const RESEARCH_QUERIES = [
  'Shilajit benefits 2026 new research',
  'monatomic gold health benefits science',
  'ashwagandha testosterone cortisol study 2026',
  'safed musli male vitality Ayurveda',
  'fulvic acid bioavailability minerals trending',
  'biohacking morning stack supplements 2026',
  'Ayurveda Rasayana formula ancient health',
  'natural testosterone optimization no steroids trending',
  'Himalayan minerals health wellness India',
  'adaptogens stress recovery trending content creators',
];
