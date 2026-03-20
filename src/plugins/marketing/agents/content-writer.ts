// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Content Writer Agent
// Generates platform-specific posts for one topic, validates against brand rules.
// ─────────────────────────────────────────────────────────────────────────────

import { LLMManager } from '../../../ai/llmManager';
import { Logger } from '../../../utils/logger';
import { withRetry } from '../../../utils/retry';
import { withTimeout } from '../../../utils/timeout';
import { createContentError, ErrorCodes } from '../../../utils/errors';
import {
  PRODUCTS,
  BRAND_VOICE,
  PLATFORM_TONES,
  CONTENT_PILLARS,
  validateContent,
  pickHashtags,
} from '../constants/shilergy-brand';
import { TopicPlan, PlatformPosts } from '../types';

const logger = new Logger('MarketingContentWriter');

// Timeout configurations (in milliseconds)
const LLM_CONTENT_TIMEOUT_MS = 45000; // 45 seconds for content generation
const LLM_REWRITE_TIMEOUT_MS = 30000; // 30 seconds for rewrite

// Retry configurations
const LLM_RETRY_OPTIONS = {
  maxAttempts: 2,
  baseDelay: 2000,
  maxDelay: 10000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'NetworkError', 'TimeoutError'],
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function writePostsForTopic(llm: LLMManager, topic: TopicPlan): Promise<PlatformPosts> {
  logger.info(`Writing posts for ${topic.day}: "${topic.topic}"`);

  const product = topic.productFocus === 'Gold Blend' ? PRODUCTS.GOLD_BLEND : PRODUCTS.PURE;
  const pillarDescription = CONTENT_PILLARS[topic.pillar];

  const systemPrompt = buildSystemPrompt(product, pillarDescription);
  const userPrompt = buildUserPrompt(topic);

  let rawJson: string;
  try {
    rawJson = await withRetry(
      async () => {
        const response = await withTimeout(
          llm.generate(userPrompt, {
            systemMessage: systemPrompt,
            maxTokens: 3000,
            temperature: 0.75,
          }),
          LLM_CONTENT_TIMEOUT_MS,
          `LLM content generation timed out after ${LLM_CONTENT_TIMEOUT_MS}ms for ${topic.day}`,
        );
        return response.content.trim();
      },
      {
        ...LLM_RETRY_OPTIONS,
        onRetry: (attempt, error, delay) => {
          logger.warn(
            `LLM content generation retry ${attempt}/${LLM_RETRY_OPTIONS.maxAttempts} for ${topic.day}: ${error.message}. Retrying in ${Math.round(delay)}ms`,
          );
        },
      },
    );
  } catch (err) {
    throw createContentError(
      `LLM content generation failed for ${topic.day}: ${err}`,
      { topic: topic.day, date: topic.date, error: err instanceof Error ? err.message : String(err) },
    );
  }

  let posts: PlatformPosts;
  try {
    const jsonStr = rawJson.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    posts = JSON.parse(jsonStr) as PlatformPosts;
  } catch (err) {
    throw createContentError(
      `Failed to parse content JSON for ${topic.day}. Raw:\n${rawJson.slice(0, 400)}`,
      { topic: topic.day, date: topic.date, rawJson: rawJson.slice(0, 400), error: err instanceof Error ? err.message : String(err) },
    );
  }

  // Inject hashtags into Instagram post
  posts.instagram = `${posts.instagram}\n\n...\n${pickHashtags()}`;

  // Append CTA to Instagram
  posts.instagram = `${posts.instagram}\n\n...\n${topic.cta}`;

  // Validate all posts against banned words
  for (const [platform, text] of Object.entries(posts) as Array<[keyof PlatformPosts, string]>) {
    const validation = validateContent(text);
    if (!validation.valid) {
      logger.warn(
        `Banned words found in ${platform} post for ${topic.day}: ${validation.violations.join(', ')}. Requesting rewrite...`,
        { topic: topic.day, platform, violations: validation.violations },
      );
      posts[platform] = await rewriteWithFixes(llm, text, platform, validation.violations, topic);
    }
  }

  logger.info(`Content written for ${topic.day}`);
  return posts;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(product: typeof PRODUCTS.GOLD_BLEND | typeof PRODUCTS.PURE, pillarDescription: string): string {
  return `You are the voice of Shilergy, an Ayurvedic supplement brand.

Product focus today: ${product.name}
Product tagline: ${product.tagline}
Key benefits: ${product.benefits.join('; ')}

Content pillar: ${pillarDescription}

Brand tone: ${BRAND_VOICE.tone}
Always do: ${BRAND_VOICE.alwaysDo.join('; ')}
Never do: ${BRAND_VOICE.neverDo.join('; ')}

BANNED WORDS (never use): cure, treat, diagnose, prevent disease, clinically proven, guaranteed results, em dashes (—)
Use "..." instead of em dashes.
Maximum 1 exclamation mark per post.

Platform tones:
- instagram: ${PLATFORM_TONES.instagram}
- linkedin: ${PLATFORM_TONES.linkedin}
- twitter: ${PLATFORM_TONES.twitter}
- facebook: ${PLATFORM_TONES.facebook}
- threads: ${PLATFORM_TONES.threads}

Respond ONLY with a valid JSON object, no markdown, no commentary.`;
}

function buildUserPrompt(topic: TopicPlan): string {
  return `Write posts for all 5 platforms for this content plan:

Day: ${topic.day}
Topic: ${topic.topic}
Hook: ${topic.hook}
Talking points:
${topic.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Output a JSON object with exactly these keys: instagram, linkedin, twitter, facebook, threads

Guidelines:
- instagram: Hook line, blank line, 3-4 short paragraphs (do NOT include hashtags — they will be added automatically)
- linkedin: 1 strong educational opening, 3 numbered insights (2-3 sentences each), closing question. No hashtags.
- twitter: Either 1 punchy line under 220 chars OR a thread formatted as "1/ hook\n2/ insight\n3/ connection\n4/ soft CTA". No hashtags.
- facebook: Warm opening, short story or analogy (3-4 sentences), insight explained simply, soft product mention, soft CTA.
- threads: Conversational, curious question-based hook, 2-3 punchy sentences.

Do NOT add the CTA to instagram — it will be added separately.
Do NOT add hashtags to instagram — they will be added separately.`;
}

async function rewriteWithFixes(
  llm: LLMManager,
  text: string,
  platform: string,
  violations: string[],
  topic: TopicPlan,
): Promise<string> {
  try {
    const rewritten = await withRetry(
      async () => {
        const response = await withTimeout(
          llm.generate(
            `This ${platform} post violates brand rules. Rewrite it removing these issues: ${violations.join(', ')}\n\nOriginal post:\n${text}\n\nTopic: ${topic.topic}\nProduct: ${topic.productFocus}\n\nReturn ONLY the rewritten post text, no commentary.`,
            { maxTokens: 800, temperature: 0.5 },
          ),
          LLM_REWRITE_TIMEOUT_MS,
          `LLM rewrite timed out after ${LLM_REWRITE_TIMEOUT_MS}ms for ${platform}`,
        );
        return response.content.trim();
      },
      {
        ...LLM_RETRY_OPTIONS,
        onRetry: (attempt, error, delay) => {
          logger.warn(
            `LLM rewrite retry ${attempt}/${LLM_RETRY_OPTIONS.maxAttempts} for ${platform}: ${error.message}. Retrying in ${Math.round(delay)}ms`,
          );
        },
      },
    );

    const recheck = validateContent(rewritten);
    if (!recheck.valid) {
      logger.warn(
        `Rewrite still has violations for ${platform}: ${recheck.violations.join(', ')}`,
        { topic: topic.day, platform, violations: recheck.violations },
      );
    }
    return rewritten;
  } catch (err) {
    logger.error(
      `Failed to rewrite ${platform} post for ${topic.day}: ${err}`,
      { topic: topic.day, platform, violations, error: err instanceof Error ? err.message : String(err) },
    );
    // Return original text if rewrite fails
    return text;
  }
}
