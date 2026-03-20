// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — API Routes
// REST endpoints for reviewing and approving weekly content drafts.
// ─────────────────────────────────────────────────────────────────────────────

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from '../../../utils/logger';
import {
  listDrafts,
  getDraft,
  updateStatus,
  editPost,
} from '../storage/draft-store';
import { runPublishStage } from '../pipeline/weekly-pipeline';
import { PlatformPosts } from '../types';

const logger = new Logger('MarketingRoutes');

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerMarketingRoutes(fastify: FastifyInstance): void {
  // List all drafts
  fastify.get('/api/marketing/drafts', handleListDrafts);

  // Get one draft (full content for review)
  fastify.get('/api/marketing/drafts/:id', handleGetDraft);

  // Approve a draft → triggers publish
  fastify.post('/api/marketing/drafts/:id/approve', handleApproveDraft);

  // Reject a draft (with optional feedback)
  fastify.post('/api/marketing/drafts/:id/reject', handleRejectDraft);

  // Edit a specific post before approval
  fastify.post('/api/marketing/drafts/:id/edit', handleEditPost);

  logger.info('Marketing API routes registered');
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleListDrafts(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const drafts = listDrafts().map(d => ({
    id: d.id,
    weekStart: d.weekStart,
    status: d.status,
    createdAt: d.createdAt,
    approvedAt: d.approvedAt,
    topicCount: d.topics.length,
    publishedCount: d.publishLog.filter(l => l.status === 'posted').length,
  }));
  reply.send({ drafts });
}

async function handleGetDraft(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const draft = getDraft(req.params.id);
  if (!draft) {
    reply.status(404).send({ error: `Draft not found: ${req.params.id}` });
    return;
  }
  reply.send({ draft });
}

async function handleApproveDraft(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = req.params;
  const draft = getDraft(id);

  if (!draft) {
    reply.status(404).send({ error: `Draft not found: ${id}` });
    return;
  }

  if (draft.status === 'published') {
    reply.status(400).send({ error: 'Draft already published' });
    return;
  }

  if (draft.status !== 'pending_approval' && draft.status !== 'draft') {
    reply.status(400).send({ error: `Draft cannot be approved in status: ${draft.status}` });
    return;
  }

  updateStatus(id, 'approved', { approvedAt: new Date().toISOString() });
  logger.info(`Draft ${id} approved — starting publish stage`);

  // Run publish asynchronously so the HTTP response returns immediately
  reply.send({ success: true, message: 'Approved. Publishing to all platforms...' });

  setImmediate(async () => {
    try {
      await runPublishStage(id);
      logger.info(`Publish complete for draft ${id}`);
    } catch (err) {
      logger.error(`Publish failed for draft ${id}: ${err}`);
    }
  });
}

async function handleRejectDraft(
  req: FastifyRequest<{ Params: { id: string }; Body: { feedback?: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = req.params;
  const draft = getDraft(id);

  if (!draft) {
    reply.status(404).send({ error: `Draft not found: ${id}` });
    return;
  }

  updateStatus(id, 'rejected', {
    rejectedAt: new Date().toISOString(),
    rejectionFeedback: (req.body as any)?.feedback ?? '',
  });

  logger.info(`Draft ${id} rejected`);
  reply.send({ success: true, message: 'Draft rejected. A new pipeline run will regenerate it.' });
}

async function handleEditPost(
  req: FastifyRequest<{
    Params: { id: string };
    Body: { date: string; platform: keyof PlatformPosts; text: string };
  }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = req.params;
  const { date, platform, text } = req.body as any;

  if (!date || !platform || !text) {
    reply.status(400).send({ error: 'Required: date, platform, text' });
    return;
  }

  const draft = getDraft(id);
  if (!draft) {
    reply.status(404).send({ error: `Draft not found: ${id}` });
    return;
  }

  try {
    editPost(id, date, platform, text);
    reply.send({ success: true, message: `Post updated: ${date} / ${platform}` });
  } catch (err) {
    reply.status(400).send({ error: String(err) });
  }
}
