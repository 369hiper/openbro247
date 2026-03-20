// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Entry Point
// Registers all plugin components into OpenBro247's runtime.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import { FastifyInstance } from 'fastify';
import { LLMManager } from '../../ai/llmManager';
import { SemanticMemory } from '../../memory/semanticMemory';
import { CronScheduler } from '../../tasks/cronScheduler';
import { Logger } from '../../utils/logger';
import { initDraftStore } from './storage/draft-store';
import { registerMarketingRoutes } from './api/routes';
import { registerMarketingCron } from './cron';

const logger = new Logger('MarketingPlugin');

export interface MarketingPluginOptions {
  fastify: FastifyInstance;
  llm: LLMManager;
  memory?: SemanticMemory;
  cronScheduler?: CronScheduler;
  dbPath?: string;
}

/**
 * Initialises the Shilergy marketing plugin.
 * Call this from src/main.ts after all core systems are ready.
 */
export async function initMarketingPlugin(options: MarketingPluginOptions): Promise<void> {
  const { fastify, llm, memory, cronScheduler, dbPath } = options;

  logger.info('Initialising Shilergy marketing plugin...');

  // 1. Initialise draft store
  const resolvedDbPath = dbPath ?? path.join(process.cwd(), 'data', 'marketing', 'marketing.db');
  initDraftStore(resolvedDbPath);

  // 2. Register REST routes
  registerMarketingRoutes(fastify);

  // 3. Register weekly cron (only if CronScheduler is available)
  if (cronScheduler) {
    await registerMarketingCron(cronScheduler, llm, memory);
  } else {
    logger.warn('CronScheduler not provided — weekly pipeline will not run automatically');
  }

  logger.info('Shilergy marketing plugin ready');
  logger.info('  API: GET  /api/marketing/drafts');
  logger.info('  API: GET  /api/marketing/drafts/:id');
  logger.info('  API: POST /api/marketing/drafts/:id/approve');
  logger.info('  API: POST /api/marketing/drafts/:id/reject');
  logger.info('  API: POST /api/marketing/drafts/:id/edit');
  if (cronScheduler) {
    logger.info('  Cron: Every Monday 07:00 IST (01:30 UTC)');
  }
}

export { runWeeklyPipeline } from './pipeline/weekly-pipeline';
export { runPublishStage } from './pipeline/weekly-pipeline';
