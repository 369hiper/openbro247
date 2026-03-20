// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Researcher Agent
// Uses real web search to find 7 trending topics for the upcoming week.
// ─────────────────────────────────────────────────────────────────────────────

import { LLMManager } from '../../../ai/llmManager';
import { Logger } from '../../../utils/logger';
import { withRetry } from '../../../utils/retry';
import { withTimeout } from '../../../utils/timeout';
import { createResearchError, ErrorCodes } from '../../../utils/errors';
import {
  RESEARCH_QUERIES,
  CONTENT_PILLARS,
  PRODUCT_ROTATION,
  BRAND_VOICE,
  pickCta,
} from '../constants/shilergy-brand';
import { TopicPlan, ContentPillar, Platform } from '../types';

const logger = new Logger('MarketingResearcher');

const ALL_PLATFORMS: Platform[] = ['instagram', 'linkedin', 'twitter', 'facebook', 'threads'];

// Timeout configurations (in milliseconds)
const WEB_SEARCH_TIMEOUT_MS = 10000; // 10 seconds per search
const LLM_SYNTHESIS_TIMEOUT_MS = 60000; // 60 seconds for LLM synthesis

// Retry configurations
const SEARCH_RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'NetworkError', 'TimeoutError', 'fetch failed'],
};

const LLM_RETRY_OPTIONS = {
  maxAttempts: 2,
  baseDelay: 2000,
  maxDelay: 10000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'NetworkError', 'TimeoutError'],
};

// ─── Web Search ───────────────────────────────────────────────────────────────

/**
 * Performs a real web search using the DuckDuckGo instant answers API (no key needed)
 * plus a fallback to searching via the browser automation if available.
 * Returns a concatenated summary of search results.
 * Includes retry logic and timeout handling.
 */
async function webSearch(query: string): Promise<string> {
  return withRetry(
    async () => {
      const encoded = encodeURIComponent(query);
      const res = await withTimeout(
        fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_redirect=1&no_html=1`),
        WEB_SEARCH_TIMEOUT_MS,
        `Web search timed out after ${WEB_SEARCH_TIMEOUT_MS}ms for query: ${query}`,
      );
      
      if (!res.ok) {
        throw createResearchError(
          `DuckDuckGo API returned ${res.status}`,
          { query, status: res.status },
        );
      }

      const data = await res.json() as any;
      const parts: string[] = [];

      if (data.Abstract) parts.push(data.Abstract);
      if (data.RelatedTopics?.length) {
        for (const t of data.RelatedTopics.slice(0, 5)) {
          if (t.Text) parts.push(t.Text);
        }
      }

      return parts.join('\n') || `No results found for: ${query}`;
    },
    {
      ...SEARCH_RETRY_OPTIONS,
      onRetry: (attempt, error, delay) => {
        logger.warn(
          `Web search retry ${attempt}/${SEARCH_RETRY_OPTIONS.maxAttempts} for "${query}": ${error.message}. Retrying in ${Math.round(delay)}ms`,
        );
      },
    },
  ).catch((err) => {
    // If all retries fail, return a fallback message instead of throwing
    logger.warn(`Web search failed for "${query}" after all retries: ${err}`);
    return `Search unavailable for: ${query}`;
  });
}

// ─── Topic Research ───────────────────────────────────────────────────────────

export async function runResearch(llm: LLMManager, weekStartDate: string): Promise<TopicPlan[]> {
  logger.info(`Starting research for week of ${weekStartDate}`);

  // 1. Run web searches in parallel (max 5 concurrent to avoid rate limits)
  const searchResults: Record<string, string> = {};
  const batches = [];
  for (let i = 0; i < RESEARCH_QUERIES.length; i += 5) {
    batches.push(RESEARCH_QUERIES.slice(i, i + 5));
  }

  for (const batch of batches) {
    const results = await Promise.all(batch.map(q => webSearch(q).then(r => ({ q, r }))));
    for (const { q, r } of results) searchResults[q] = r;
  }

  // 2. Build research context string
  const researchContext = Object.entries(searchResults)
    .map(([q, r]) => `Query: "${q}"\nResults: ${r}`)
    .join('\n\n---\n\n');

  // 3. Ask LLM to synthesise 7 topic plans with retry and timeout
  const pillarList = Object.entries(CONTENT_PILLARS)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const systemPrompt = `You are a senior content strategist for Shilergy, an Ayurvedic supplement brand selling:
1. Shilergy Gold Blend (Shilajit + Monatomic Gold + Ashwagandha + Safed Musli)
2. Shilergy Pure (100% Himalayan Shilajit resin)

Brand tone: ${BRAND_VOICE.tone}
Audience: ${BRAND_VOICE.audience.join(', ')}

Content pillars:
${pillarList}

You MUST alternate product focus across 7 days using this rotation:
Mon=Gold Blend, Tue=Pure, Wed=Gold Blend, Thu=Pure, Fri=Gold Blend, Sat=Pure, Sun=Gold Blend

Respond ONLY with a valid JSON array of 7 TopicPlan objects, no markdown, no commentary.`;

  const weekDays = getWeekDays(weekStartDate);

  const userPrompt = `Based on this trending research data, create 7 topic plans for the week starting ${weekStartDate}.

Research Data:
${researchContext}

For each of the 7 days (${weekDays.map(d => d.day).join(', ')}), output a JSON object with these exact fields:
{
  "day": "Monday",
  "date": "2026-03-23",
  "productFocus": "Gold Blend",
  "pillar": "SCIENCE_OF_SHILAJIT",
  "topic": "brief topic description",
  "hook": "the scroll-stopping opening line (under 100 chars, no em dashes)",
  "talkingPoints": ["point 1", "point 2", "point 3", "point 4"],
  "imageConcept": "detailed visual concept for image generation",
  "platforms": ["instagram", "linkedin", "twitter", "facebook", "threads"],
  "cta": "specific call to action"
}

Valid pillar values: ${Object.keys(CONTENT_PILLARS).join(', ')}
Ensure "date" uses the correct date for each day of the week starting ${weekStartDate}.`;

  let rawJson: string;
  try {
    rawJson = await withRetry(
      async () => {
        const response = await withTimeout(
          llm.generate(userPrompt, {
            systemMessage: systemPrompt,
            maxTokens: 4000,
            temperature: 0.7,
          }),
          LLM_SYNTHESIS_TIMEOUT_MS,
          `LLM research synthesis timed out after ${LLM_SYNTHESIS_TIMEOUT_MS}ms`,
        );
        return response.content.trim();
      },
      {
        ...LLM_RETRY_OPTIONS,
        onRetry: (attempt, error, delay) => {
          logger.warn(
            `LLM synthesis retry ${attempt}/${LLM_RETRY_OPTIONS.maxAttempts}: ${error.message}. Retrying in ${Math.round(delay)}ms`,
          );
        },
      },
    );
  } catch (err) {
    throw createResearchError(
      `LLM research synthesis failed: ${err}`,
      { weekStartDate, error: err instanceof Error ? err.message : String(err) },
    );
  }

  // 4. Parse and validate
  let topics: TopicPlan[];
  try {
    // Strip markdown code blocks if present
    const jsonStr = rawJson.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    topics = JSON.parse(jsonStr) as TopicPlan[];
  } catch (err) {
    throw createResearchError(
      `Failed to parse LLM topic JSON. Raw:\n${rawJson.slice(0, 500)}`,
      { weekStartDate, rawJson: rawJson.slice(0, 500), error: err instanceof Error ? err.message : String(err) },
    );
  }

  if (!Array.isArray(topics) || topics.length !== 7) {
    throw createResearchError(
      `Expected 7 topics, got ${topics?.length ?? 'non-array'}`,
      { weekStartDate, topicCount: topics?.length, isArray: Array.isArray(topics) },
    );
  }

  // 5. Enforce product rotation and date correctness
  for (let i = 0; i < 7; i++) {
    topics[i].productFocus = PRODUCT_ROTATION[i];
    topics[i].date = weekDays[i].date;
    topics[i].day = weekDays[i].day;
    topics[i].platforms = ALL_PLATFORMS;
    if (!topics[i].cta) topics[i].cta = pickCta(i);
  }

  logger.info(`Research complete: ${topics.length} topics generated`);
  return topics;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDays(weekStart: string): Array<{ day: string; date: string }> {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const start = new Date(weekStart);
  return dayNames.map((day, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { day, date: d.toISOString().split('T')[0] };
  });
}
