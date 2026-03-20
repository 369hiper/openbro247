import { Logger } from '../utils/logger';
import { SQLiteStore } from '../memory/sqliteStore';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type CronStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  schedule: string; // cron expression: "0 * * * *" or simple: "every 5m", "every 1h"
  command: string;  // natural language command or structured action
  agentId?: string;
  status: CronStatus;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  failCount: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface CronRunHistory {
  id: string;
  jobId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  durationMs?: number;
}

export type CronJobConfig = Omit<CronJob, 'id' | 'status' | 'runCount' | 'failCount' | 'createdAt' | 'updatedAt'>;

// ──────────────────────────────────────────────
// CronScheduler
// ──────────────────────────────────────────────

export class CronScheduler {
  private logger: Logger;
  private sqliteStore: SQLiteStore;
  private jobs: Map<string, CronJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private runHistory: CronRunHistory[] = [];
  private jobRunner?: (job: CronJob) => Promise<string>;

  constructor(sqliteStore: SQLiteStore) {
    this.sqliteStore = sqliteStore;
    this.logger = new Logger('CronScheduler');
  }

  /**
   * Set the executor that actually runs job commands.
   * Injected to avoid circular dependencies with AgentRuntime.
   */
  setJobRunner(runner: (job: CronJob) => Promise<string>): void {
    this.jobRunner = runner;
    this.logger.info('Job runner set');
  }

  async initialize(): Promise<void> {
    // Load persisted jobs from SQLite
    await this.loadPersistedJobs();
    this.logger.info(`CronScheduler initialized with ${this.jobs.size} jobs`);
  }

  // ──────────────────────────────────────────────
  // Job management
  // ──────────────────────────────────────────────

  async createJob(config: CronJobConfig): Promise<CronJob> {
    const { v4: uuidv4 } = await import('uuid');
    const now = new Date();

    const job: CronJob = {
      ...config,
      id: uuidv4(),
      status: 'active',
      runCount: 0,
      failCount: 0,
      createdAt: now,
      updatedAt: now,
      nextRun: this.computeNextRun(config.schedule),
    };

    this.jobs.set(job.id, job);
    await this.persistJob(job);
    this.scheduleJob(job);

    this.logger.info(`Created cron job: ${job.name} (${job.schedule})`);
    return job;
  }

  async getJob(jobId: string): Promise<CronJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async listJobs(): Promise<CronJob[]> {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async pauseJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    job.status = 'paused';
    job.updatedAt = new Date();
    this.clearJobTimer(jobId);
    await this.persistJob(job);
    this.logger.info(`Paused job: ${job.name}`);
  }

  async resumeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    job.status = 'active';
    job.updatedAt = new Date();
    job.nextRun = this.computeNextRun(job.schedule);
    this.scheduleJob(job);
    await this.persistJob(job);
    this.logger.info(`Resumed job: ${job.name}`);
  }

  async deleteJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    this.clearJobTimer(jobId);
    this.jobs.delete(jobId);
    this.logger.info(`Deleted job: ${job.name}`);
  }

  async triggerJob(jobId: string): Promise<CronRunHistory> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    return this.runJob(job);
  }

  getHistory(jobId?: string, limit: number = 50): CronRunHistory[] {
    const history = jobId
      ? this.runHistory.filter((h) => h.jobId === jobId)
      : this.runHistory;
    return history.slice(-limit).reverse();
  }

  // ──────────────────────────────────────────────
  // Job scheduling
  // ──────────────────────────────────────────────

  private scheduleJob(job: CronJob): void {
    if (job.status !== 'active') return;

    const delay = this.computeDelay(job.schedule);
    if (delay <= 0) return;

    const timer = setTimeout(async () => {
      await this.runJob(job).catch((e) =>
        this.logger.error(`Job ${job.name} execution error`, e)
      );
      // Reschedule
      if (job.status === 'active') {
        this.scheduleJob(job);
      }
    }, delay);

    this.clearJobTimer(job.id);
    this.timers.set(job.id, timer);

    job.nextRun = new Date(Date.now() + delay);
    this.logger.info(`Scheduled job "${job.name}" in ${Math.round(delay / 1000)}s`);
  }

  private clearJobTimer(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
  }

  private async runJob(job: CronJob): Promise<CronRunHistory> {
    const { v4: uuidv4 } = await import('uuid');
    const run: CronRunHistory = {
      id: uuidv4(),
      jobId: job.id,
      startedAt: new Date(),
      status: 'running',
    };

    this.runHistory.push(run);
    this.logger.info(`Running job: ${job.name}`);

    try {
      let output = `Job "${job.name}" executed`;

      if (this.jobRunner) {
        output = await this.jobRunner(job);
      }

      run.status = 'completed';
      run.output = output;
      run.completedAt = new Date();
      run.durationMs = run.completedAt.getTime() - run.startedAt.getTime();

      job.runCount++;
      job.lastRun = run.completedAt;
      job.updatedAt = new Date();
    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.completedAt = new Date();
      run.durationMs = run.completedAt.getTime() - run.startedAt.getTime();

      job.failCount++;
      job.updatedAt = new Date();
    }

    await this.persistJob(job).catch(() => {});

    // Keep last 200 history entries in memory
    if (this.runHistory.length > 200) {
      this.runHistory.splice(0, this.runHistory.length - 200);
    }

    return run;
  }

  // ──────────────────────────────────────────────
  // Schedule parsing (simple + cron-like)
  // ──────────────────────────────────────────────

  private computeDelay(schedule: string): number {
    const s = schedule.trim().toLowerCase();

    // Simple human-readable: "every 5m", "every 1h", "every 30s"
    const everyMatch = s.match(/^every\s+(\d+)(s|m|h|d)$/);
    if (everyMatch) {
      const n = parseInt(everyMatch[1]);
      const unit = everyMatch[2];
      const ms = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
      return n * ms;
    }

    // Basic cron: parse minutes field for interval
    // Full cron parsing would need a library; for now support common patterns
    const parts = s.split(' ');
    if (parts.length === 5) {
      const minPart = parts[0];

      if (minPart === '*') return 60 * 1000; // every minute
      if (minPart.startsWith('*/')) {
        const interval = parseInt(minPart.slice(2));
        return interval * 60 * 1000;
      }

      // Fixed time → compute time until next occurrence (simplified)
      return 60 * 60 * 1000; // default 1 hour if we can't parse
    }

    // Fallback: 1 hour
    this.logger.warn(`Unrecognized schedule "${schedule}", defaulting to 1h`);
    return 3600 * 1000;
  }

  private computeNextRun(schedule: string): Date {
    return new Date(Date.now() + this.computeDelay(schedule));
  }

  // ──────────────────────────────────────────────
  // Persistence (stored in SQLiteStore action log for now)
  // ──────────────────────────────────────────────

  private async persistJob(_job: CronJob): Promise<void> {
    // TODO: Add dedicated cron_jobs table to SQLiteStore for persistence
    // Currently jobs are in-memory only and reset on restart
  }

  private async loadPersistedJobs(): Promise<void> {
    // Jobs are ephemeral in-memory for now — could add dedicated table later
    this.logger.info('CronScheduler: no persisted jobs to load (in-memory mode)');
  }
}
