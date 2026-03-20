// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Cron Registration
// Registers a weekly Monday 7 AM IST job in OpenBro247's CronScheduler.
// ─────────────────────────────────────────────────────────────────────────────

import { CronScheduler } from '../../tasks/cronScheduler';
import { LLMManager } from '../../ai/llmManager';
import { SemanticMemory } from '../../memory/semanticMemory';
import { runWeeklyPipeline } from './pipeline/weekly-pipeline';
import { Logger } from '../../utils/logger';

const logger = new Logger('MarketingCron');

const CRON_JOB_ID = 'shilergy-weekly-pipeline';

/**
 * Registers the Shilergy weekly content pipeline as a cron job.
 * Schedule: Every Monday at 7:00 AM IST (01:30 UTC).
 */
export async function registerMarketingCron(
  cronScheduler: CronScheduler,
  llm: LLMManager,
  memory?: SemanticMemory,
): Promise<void> {
  // Check if already registered (idempotent)
  const existing = await cronScheduler.getJob(CRON_JOB_ID);
  if (existing) {
    logger.info(`Marketing cron already registered: ${CRON_JOB_ID}`);
    return;
  }

  await cronScheduler.createJob({
    name: 'Shilergy Weekly Content Pipeline',
    description: 'Researches trending topics, writes posts for all platforms, generates images, and waits for approval before publishing via Blotato.',
    schedule: '30 1 * * 1',  // 01:30 UTC = 07:00 IST, every Monday
    command: 'RUN_MARKETING_PIPELINE',
    metadata: { plugin: 'marketing', brand: 'shilergy' },
  });

  // Override the job runner for this specific command
  // The CronScheduler calls setJobRunner globally, but we need to intercept our command.
  // Solution: wrap the existing runner to handle our command specially.
  const originalRunner = (cronScheduler as any).jobRunner as ((job: any) => Promise<string>) | undefined;

  cronScheduler.setJobRunner(async (job) => {
    if (job.command === 'RUN_MARKETING_PIPELINE') {
      logger.info('Marketing pipeline triggered by cron');
      try {
        const result = await runWeeklyPipeline({ llm, memory });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Marketing pipeline cron failed: ${msg}`);
        return `FAILED: ${msg}`;
      }
    }

    // Delegate all other jobs to the original runner
    if (originalRunner) return originalRunner(job);
    return `No runner for job: ${job.name}`;
  });

  logger.info(`Marketing cron registered: ${CRON_JOB_ID} (Mon 07:00 IST)`);
}
