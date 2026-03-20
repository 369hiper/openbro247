// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Draft Store
// SQLite persistence for weekly content drafts, approval state, publish logs.
// ─────────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../utils/logger';
import { ContentDraft, DraftStatus, PlatformPosts, PublishLog, TopicPlan, PipelineState, PipelineStage } from '../types';

const logger = new Logger('MarketingDraftStore');

let db: Database.Database | null = null;

// ─── Initialise ───────────────────────────────────────────────────────────────

export function initDraftStore(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  createTables();
  logger.info(`Draft store initialised at ${dbPath}`);
}

function getDb(): Database.Database {
  if (!db) throw new Error('DraftStore not initialised — call initDraftStore() first');
  return db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function createTables(): void {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS marketing_drafts (
      id          TEXT PRIMARY KEY,
      week_start  TEXT NOT NULL,
      topics      TEXT NOT NULL,
      posts       TEXT NOT NULL DEFAULT '{}',
      image_urls  TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'draft',
      created_at  TEXT NOT NULL,
      approved_at TEXT,
      rejected_at TEXT,
      rejection_feedback TEXT,
      publish_log TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS marketing_pipeline_state (
      draft_id          TEXT PRIMARY KEY,
      stage             TEXT NOT NULL,
      stages_completed  TEXT NOT NULL DEFAULT '[]',
      started_at        TEXT NOT NULL,
      error             TEXT,
      FOREIGN KEY (draft_id) REFERENCES marketing_drafts(id)
    );
  `);
}

// ─── Draft CRUD ───────────────────────────────────────────────────────────────

export function createDraft(weekStart: string, topics: TopicPlan[]): ContentDraft {
  const draft: ContentDraft = {
    id: uuidv4(),
    weekStart,
    topics,
    posts: {},
    imageUrls: {},
    status: 'draft',
    createdAt: new Date().toISOString(),
    publishLog: [],
  };

  getDb().prepare(`
    INSERT INTO marketing_drafts
      (id, week_start, topics, posts, image_urls, status, created_at, publish_log)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    draft.id,
    draft.weekStart,
    JSON.stringify(draft.topics),
    JSON.stringify(draft.posts),
    JSON.stringify(draft.imageUrls),
    draft.status,
    draft.createdAt,
    JSON.stringify(draft.publishLog),
  );

  logger.info(`Draft created: ${draft.id} for week ${weekStart}`);
  return draft;
}

export function getDraft(id: string): ContentDraft | null {
  const row = getDb().prepare('SELECT * FROM marketing_drafts WHERE id = ?').get(id) as any;
  return row ? rowToDraft(row) : null;
}

export function getLatestDraft(): ContentDraft | null {
  const row = getDb().prepare('SELECT * FROM marketing_drafts ORDER BY created_at DESC LIMIT 1').get() as any;
  return row ? rowToDraft(row) : null;
}

export function listDrafts(): ContentDraft[] {
  const rows = getDb().prepare('SELECT * FROM marketing_drafts ORDER BY created_at DESC').all() as any[];
  return rows.map(rowToDraft);
}

export function updateStatus(id: string, status: DraftStatus, extra: Partial<Pick<ContentDraft, 'approvedAt' | 'rejectedAt' | 'rejectionFeedback'>> = {}): void {
  getDb().prepare(`
    UPDATE marketing_drafts
    SET status = ?, approved_at = ?, rejected_at = ?, rejection_feedback = ?
    WHERE id = ?
  `).run(
    status,
    extra.approvedAt ?? null,
    extra.rejectedAt ?? null,
    extra.rejectionFeedback ?? null,
    id,
  );
  logger.info(`Draft ${id} status → ${status}`);
}

export function savePlatformPosts(draftId: string, date: string, posts: PlatformPosts): void {
  const d = getDb();
  const row = d.prepare('SELECT posts FROM marketing_drafts WHERE id = ?').get(draftId) as any;
  if (!row) throw new Error(`Draft not found: ${draftId}`);

  const existing = JSON.parse(row.posts) as Record<string, PlatformPosts>;
  existing[date] = posts;

  d.prepare('UPDATE marketing_drafts SET posts = ? WHERE id = ?').run(JSON.stringify(existing), draftId);
}

export function saveImageUrl(draftId: string, date: string, url: string): void {
  const d = getDb();
  const row = d.prepare('SELECT image_urls FROM marketing_drafts WHERE id = ?').get(draftId) as any;
  if (!row) throw new Error(`Draft not found: ${draftId}`);

  const existing = JSON.parse(row.image_urls) as Record<string, string>;
  existing[date] = url;

  d.prepare('UPDATE marketing_drafts SET image_urls = ? WHERE id = ?').run(JSON.stringify(existing), draftId);
}

export function appendPublishLog(draftId: string, entries: PublishLog[]): void {
  const d = getDb();
  const row = d.prepare('SELECT publish_log FROM marketing_drafts WHERE id = ?').get(draftId) as any;
  if (!row) throw new Error(`Draft not found: ${draftId}`);

  const existing = JSON.parse(row.publish_log) as PublishLog[];
  const merged = [...existing, ...entries];

  d.prepare('UPDATE marketing_drafts SET publish_log = ? WHERE id = ?').run(JSON.stringify(merged), draftId);
}

export function updateTopics(draftId: string, topics: TopicPlan[]): void {
  getDb().prepare('UPDATE marketing_drafts SET topics = ? WHERE id = ?').run(JSON.stringify(topics), draftId);
  logger.info(`Topics updated for draft ${draftId}: ${topics.length} topics`);
}

export function editPost(draftId: string, date: string, platform: keyof PlatformPosts, text: string): void {
  const d = getDb();
  const row = d.prepare('SELECT posts FROM marketing_drafts WHERE id = ?').get(draftId) as any;
  if (!row) throw new Error(`Draft not found: ${draftId}`);

  const existing = JSON.parse(row.posts) as Record<string, PlatformPosts>;
  if (!existing[date]) throw new Error(`No posts found for date ${date} in draft ${draftId}`);
  existing[date][platform] = text;

  d.prepare('UPDATE marketing_drafts SET posts = ? WHERE id = ?').run(JSON.stringify(existing), draftId);
  logger.info(`Post edited: draft ${draftId}, date ${date}, platform ${platform}`);
}

// ─── Pipeline State ───────────────────────────────────────────────────────────

export function savePipelineState(state: PipelineState): void {
  getDb().prepare(`
    INSERT INTO marketing_pipeline_state (draft_id, stage, stages_completed, started_at, error)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(draft_id) DO UPDATE SET
      stage = excluded.stage,
      stages_completed = excluded.stages_completed,
      error = excluded.error
  `).run(
    state.draftId,
    state.stage,
    JSON.stringify(state.stagesCompleted),
    state.startedAt,
    state.error ?? null,
  );
}

export function getPipelineState(draftId: string): PipelineState | null {
  const row = getDb().prepare('SELECT * FROM marketing_pipeline_state WHERE draft_id = ?').get(draftId) as any;
  if (!row) return null;
  return {
    draftId: row.draft_id,
    stage: row.stage as PipelineStage,
    stagesCompleted: JSON.parse(row.stages_completed),
    startedAt: row.started_at,
    error: row.error ?? undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToDraft(row: any): ContentDraft {
  return {
    id: row.id,
    weekStart: row.week_start,
    topics: JSON.parse(row.topics),
    posts: JSON.parse(row.posts),
    imageUrls: JSON.parse(row.image_urls),
    status: row.status as DraftStatus,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    rejectionFeedback: row.rejection_feedback ?? undefined,
    publishLog: JSON.parse(row.publish_log),
  };
}
