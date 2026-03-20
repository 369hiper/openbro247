// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Weekly Pipeline
// 6-stage state machine. Each stage is idempotent and resumable.
// Crash at stage 3 → restart resumes from stage 3, not stage 1.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../utils/logger';
import { withRetry } from '../../../utils/retry';
import { withTimeout } from '../../../utils/timeout';
import { PipelineError, ErrorCodes, wrapError } from '../../../utils/errors';
import { LLMManager } from '../../../ai/llmManager';
import { SemanticMemory } from '../../../memory/semanticMemory';
import { runResearch } from '../agents/researcher';
import { writePostsForTopic } from '../agents/content-writer';
import { generateAndHostImage } from '../agents/image-generator';
import { fetchAccountIds, publishDay } from '../agents/publisher';
import {
  createDraft,
  getDraft,
  listDrafts,
  updateTopics,
  savePlatformPosts,
  saveImageUrl,
  updateStatus,
  appendPublishLog,
  savePipelineState,
  getPipelineState,
} from '../storage/draft-store';
import { PipelineStage, ContentDraft, PublishLog } from '../types';

const logger = new Logger('MarketingPipeline');

export interface PipelineContext {
  llm: LLMManager;
  memory?: SemanticMemory;
  correlationId?: string;
}

// Timeout configurations (in milliseconds)
const STAGE_TIMEOUT_MS = 300000; // 5 minutes per stage
const IMAGE_GENERATION_TIMEOUT_MS = 60000; // 60 seconds per image

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Runs (or resumes) the weekly pipeline.
 * Finds any in-progress draft for this Monday; creates one if none exists.
 * Includes correlation ID for request tracing.
 */
export async function runWeeklyPipeline(ctx: PipelineContext): Promise<string> {
  const correlationId = ctx.correlationId ?? uuidv4();
  const weekStart = getThisMonday();
  
  logger.info(`Weekly pipeline triggered for week of ${weekStart}`, { correlationId });

  // Find an existing resumable draft for this week
  let draft = findDraftForWeek(weekStart);
  let pipelineState = draft ? getPipelineState(draft.id) : null;

  if (!draft) {
    // Create a new draft (topics empty for now — filled in stage 1)
    draft = createDraft(weekStart, []);
    pipelineState = {
      draftId: draft.id,
      stage: 'idle',
      stagesCompleted: [],
      startedAt: new Date().toISOString(),
    };
    savePipelineState(pipelineState);
    logger.info(`New draft created: ${draft.id}`, { correlationId, draftId: draft.id });
  } else {
    logger.info(
      `Resuming draft ${draft.id} — completed stages: [${pipelineState?.stagesCompleted.join(', ')}]`,
      { correlationId, draftId: draft.id },
    );
  }

  const state = pipelineState!;

  try {
    // STAGE 1 — RESEARCH
    await runStageIfNeeded('researching', state, correlationId, async () => {
      const topics = await withTimeout(
        runResearch(ctx.llm, weekStart),
        STAGE_TIMEOUT_MS,
        `Research stage timed out after ${STAGE_TIMEOUT_MS}ms`,
      );
      updateTopics(draft!.id, topics);
      draft!.topics = topics;
      logger.info(`Research complete: ${topics.length} topics`, { correlationId, topicCount: topics.length });
    });

    // Reload topics from DB in case we resumed after stage 1
    if (!draft.topics?.length) {
      const fresh = getDraft(draft.id);
      draft.topics = fresh?.topics ?? [];
    }

    // STAGE 2 — WRITE CONTENT
    await runStageIfNeeded('writing', state, correlationId, async () => {
      for (const topic of draft!.topics) {
        const posts = await withTimeout(
          writePostsForTopic(ctx.llm, topic),
          STAGE_TIMEOUT_MS,
          `Content writing timed out after ${STAGE_TIMEOUT_MS}ms for ${topic.date}`,
        );
        savePlatformPosts(draft!.id, topic.date, posts);
        logger.info(`Posts written for ${topic.day} (${topic.date})`, { correlationId, date: topic.date });
      }
    });

    // STAGE 3 — GENERATE IMAGES (PARALLELIZED)
    await runStageIfNeeded('generating_images', state, correlationId, async () => {
      const freshDraft = getDraft(draft!.id)!;
      
      // Filter topics that need images
      const topicsNeedingImages = freshDraft.topics.filter(
        (topic) => !freshDraft.imageUrls[topic.date],
      );

      if (topicsNeedingImages.length === 0) {
        logger.info('All images already exist — skipping image generation', { correlationId });
        return;
      }

      logger.info(
        `Generating ${topicsNeedingImages.length} images in parallel`,
        { correlationId, count: topicsNeedingImages.length },
      );

      // Generate images in parallel with individual error handling
      const imageResults = await Promise.allSettled(
        topicsNeedingImages.map(async (topic) => {
          try {
            const url = await withTimeout(
              generateAndHostImage(topic.imageConcept, topic.date),
              IMAGE_GENERATION_TIMEOUT_MS,
              `Image generation timed out after ${IMAGE_GENERATION_TIMEOUT_MS}ms for ${topic.date}`,
            );
            saveImageUrl(draft!.id, topic.date, url);
            logger.info(`Image generated for ${topic.date}`, { correlationId, date: topic.date, url });
            return { date: topic.date, url, success: true };
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.warn(
              `Image generation failed for ${topic.date}: ${errorMsg}. Saving empty URL.`,
              { correlationId, date: topic.date, error: errorMsg },
            );
            saveImageUrl(draft!.id, topic.date, '');
            return { date: topic.date, url: '', success: false, error: errorMsg };
          }
        }),
      );

      // Log summary
      const successful = imageResults.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;
      const failed = imageResults.length - successful;
      
      logger.info(
        `Image generation complete: ${successful} successful, ${failed} failed`,
        { correlationId, successful, failed },
      );
    });

    // STAGE 4 — PENDING APPROVAL
    await runStageIfNeeded('pending_approval', state, correlationId, async () => {
      updateStatus(draft!.id, 'pending_approval');
      logger.info(
        `Draft ${draft!.id} ready for review at /api/marketing/drafts/${draft!.id}`,
        { correlationId, draftId: draft!.id },
      );
      await sendApprovalWebhook(draft!.id, correlationId);
    });

    logger.info(
      `Pipeline paused at pending_approval. Review: GET /api/marketing/drafts/${draft.id}`,
      { correlationId, draftId: draft.id },
    );
    return `Draft ${draft.id} ready for review at /api/marketing/drafts/${draft.id}`;

  } catch (err) {
    const pipelineError = wrapError(
      err,
      ErrorCodes.PIPELINE_STAGE_FAILED,
      state.stage,
      { correlationId, draftId: draft.id, weekStart },
    );
    
    logger.error(`Pipeline failed: ${pipelineError.message}`, pipelineError);
    updateStatus(draft.id, 'failed');
    savePipelineState({ ...state, stage: 'failed', error: pipelineError.message });
    throw pipelineError;
  }
}

// ─── Publish Stage (triggered by approval endpoint) ───────────────────────────

export async function runPublishStage(draftId: string, correlationId?: string): Promise<void> {
  const cid = correlationId ?? uuidv4();
  
  const draft = getDraft(draftId);
  if (!draft) {
    throw new PipelineError(
      `Draft not found: ${draftId}`,
      ErrorCodes.DRAFT_NOT_FOUND,
      'publishing',
      { draftId, correlationId: cid },
    );
  }
  
  if (draft.status !== 'approved') {
    throw new PipelineError(
      `Draft ${draftId} is not approved (status: ${draft.status})`,
      ErrorCodes.INVALID_INPUT,
      'publishing',
      { draftId, status: draft.status, correlationId: cid },
    );
  }

  logger.info(`Publish stage starting for draft ${draftId}`, { correlationId: cid, draftId });

  const state = getPipelineState(draftId);
  savePipelineState({ ...state!, stage: 'publishing' });

  const accounts = await withRetry(
    () => fetchAccountIds(),
    {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'NetworkError'],
    },
  );
  
  const allLogs: PublishLog[] = [];

  for (const topic of draft.topics) {
    const posts = draft.posts[topic.date];
    if (!posts) {
      logger.warn(`No posts for ${topic.date} — skipping`, { correlationId: cid, date: topic.date });
      continue;
    }
    const imageUrl = draft.imageUrls[topic.date] || undefined;
    const logs = await publishDay(topic.date, posts, imageUrl, accounts);
    appendPublishLog(draftId, logs);
    allLogs.push(...logs);
  }

  const success = allLogs.filter(l => l.status === 'posted').length;
  const failed = allLogs.filter(l => l.status === 'failed').length;
  logger.info(
    `Publish complete: ${success} posted, ${failed} failed`,
    { correlationId: cid, draftId, success, failed },
  );

  updateStatus(draftId, 'published', { approvedAt: draft.approvedAt });
  savePipelineState({ ...state!, stage: 'complete' });
}

// ─── Stage Runner ─────────────────────────────────────────────────────────────

async function runStageIfNeeded(
  stage: PipelineStage,
  state: { draftId: string; stage: PipelineStage; stagesCompleted: PipelineStage[]; startedAt: string; error?: string },
  correlationId: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (state.stagesCompleted.includes(stage)) {
    logger.info(`Stage "${stage}" already complete — skipping`, { correlationId, stage });
    return;
  }

  logger.info(`Running stage: ${stage}`, { correlationId, stage });
  savePipelineState({ ...state, stage });

  const startTime = Date.now();
  
  try {
    await fn();
    
    const duration = Date.now() - startTime;
    state.stagesCompleted.push(stage);
    savePipelineState({ ...state, stage });
    logger.info(`Stage "${stage}" done`, { correlationId, stage, durationMs: duration });
  } catch (err) {
    const duration = Date.now() - startTime;
    const pipelineError = wrapError(
      err,
      ErrorCodes.PIPELINE_STAGE_FAILED,
      stage,
      { correlationId, stage, durationMs: duration },
    );
    logger.error(`Stage "${stage}" failed`, pipelineError);
    throw pipelineError;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getThisMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

function findDraftForWeek(weekStart: string): ContentDraft | null {
  return (
    listDrafts().find(
      d => d.weekStart === weekStart && d.status !== 'failed' && d.status !== 'rejected',
    ) ?? null
  );
}

async function sendApprovalWebhook(draftId: string, correlationId: string): Promise<void> {
  const webhookUrl = process.env.MARKETING_APPROVAL_WEBHOOK;
  if (!webhookUrl) return;
  
  try {
    await withTimeout(
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Shilergy weekly draft ready for approval',
          draftId,
          correlationId,
          reviewUrl: `http://localhost:${process.env.PORT ?? 8000}/api/marketing/drafts/${draftId}`,
        }),
      }),
      10000, // 10 second timeout for webhook
      'Approval webhook timed out',
    );
    logger.info(`Approval webhook sent for draft ${draftId}`, { correlationId, draftId });
  } catch (err) {
    logger.warn(`Approval webhook failed: ${err}`, { correlationId, draftId });
  }
}
