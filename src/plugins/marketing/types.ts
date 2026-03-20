// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Types
// ─────────────────────────────────────────────────────────────────────────────

export type ContentPillar =
  | 'SCIENCE_OF_SHILAJIT'
  | 'ANCIENT_WISDOM'
  | 'INGREDIENT_SPOTLIGHT'
  | 'LIFESTYLE_AND_PERFORMANCE'
  | 'BRAND_STORY_AND_TRUST';

export type Platform = 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'threads';

export type ProductFocus = 'Gold Blend' | 'Pure';

export type DraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'published'
  | 'failed'
  | 'rejected';

// ─── Per-topic research output ────────────────────────────────────────────────

export interface TopicPlan {
  day: string;            // e.g. "Monday"
  date: string;           // ISO date: "2026-03-23"
  productFocus: ProductFocus;
  pillar: ContentPillar;
  topic: string;
  hook: string;           // scroll-stopper opening line
  talkingPoints: string[];
  imageConcept: string;   // description for Gemini Imagen
  platforms: Platform[];
  cta: string;
}

// ─── Platform posts for one day ───────────────────────────────────────────────

export interface PlatformPosts {
  instagram: string;
  linkedin: string;
  twitter: string;
  facebook: string;
  threads: string;
}

// ─── Publish result for one platform ─────────────────────────────────────────

export interface PublishLog {
  platform: Platform;
  postId: string;
  scheduledTime: string;
  status: 'posted' | 'failed';
  error?: string;
}

// ─── Full weekly draft ────────────────────────────────────────────────────────

export interface ContentDraft {
  id: string;
  weekStart: string;                              // ISO date of Monday
  topics: TopicPlan[];
  posts: Record<string, PlatformPosts>;           // date → posts
  imageUrls: Record<string, string>;             // date → public image URL
  status: DraftStatus;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionFeedback?: string;
  publishLog: PublishLog[];
}

// ─── Pipeline state tracking ──────────────────────────────────────────────────

export type PipelineStage =
  | 'idle'
  | 'researching'
  | 'writing'
  | 'generating_images'
  | 'pending_approval'
  | 'publishing'
  | 'complete'
  | 'failed';

export interface PipelineState {
  draftId: string;
  stage: PipelineStage;
  stagesCompleted: PipelineStage[];
  startedAt: string;
  error?: string;
}

// ─── Content validation ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  violations: string[];  // list of banned words found
}

// ─── Blotato account IDs ──────────────────────────────────────────────────────

export interface BlotatoAccounts {
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  threads?: string;
}
