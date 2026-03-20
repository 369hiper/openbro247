// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Publisher Agent
// Publishes approved posts to social platforms via Blotato REST API.
// ─────────────────────────────────────────────────────────────────────────────

import { Logger } from '../../../utils/logger';
import { withRetry } from '../../../utils/retry';
import { withTimeout } from '../../../utils/timeout';
import { createPublishError, ErrorCodes } from '../../../utils/errors';
import { Platform, PlatformPosts, PublishLog, BlotatoAccounts } from '../types';

const logger = new Logger('MarketingPublisher');

const BLOTATO_API_KEY = process.env.BLOTATO_API_KEY ?? '';
const BLOTATO_BASE = 'https://backend.blotato.com/v2';

// Staggered posting times (hour offset from midnight IST, Monday = day 0)
const PLATFORM_HOUR_OFFSETS: Record<Platform, number> = {
  twitter: 8,
  instagram: 9,
  linkedin: 10,
  facebook: 11,
  threads: 12,
};

// Timeout configurations (in milliseconds)
const BLOTATO_TIMEOUT_MS = 30000; // 30 seconds for Blotato API calls
const ACCOUNT_FETCH_TIMEOUT_MS = 15000; // 15 seconds for account fetch

// Retry configurations
const BLOTATO_RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelay: 2000,
  maxDelay: 10000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'NetworkError', 'TimeoutError', 'fetch failed', '429', '500', '502', '503', '504'],
};

// Cached account IDs
let cachedAccounts: BlotatoAccounts | null = null;

// ─── Account Management ───────────────────────────────────────────────────────

export async function fetchAccountIds(): Promise<BlotatoAccounts> {
  if (cachedAccounts) return cachedAccounts;
  if (!BLOTATO_API_KEY) {
    throw createPublishError('BLOTATO_API_KEY is not set', { hasKey: false });
  }

  const res = await withRetry(
    async () => {
      const response = await withTimeout(
        blotatoGet('/accounts'),
        ACCOUNT_FETCH_TIMEOUT_MS,
        `Account fetch timed out after ${ACCOUNT_FETCH_TIMEOUT_MS}ms`,
      );
      return response;
    },
    {
      ...BLOTATO_RETRY_OPTIONS,
      onRetry: (attempt, error, delay) => {
        logger.warn(
          `Account fetch retry ${attempt}/${BLOTATO_RETRY_OPTIONS.maxAttempts}: ${error.message}. Retrying in ${Math.round(delay)}ms`,
        );
      },
    },
  );

  const accounts: BlotatoAccounts = {};

  for (const account of res as any[]) {
    const platform = normalisePlatform(account.platform ?? account.type ?? '');
    if (platform) accounts[platform] = account.accountId ?? account.id;
  }

  cachedAccounts = accounts;
  logger.info(`Blotato accounts fetched: ${Object.keys(accounts).join(', ')}`);
  return accounts;
}

// ─── Publish One Day ──────────────────────────────────────────────────────────

export async function publishDay(
  date: string,
  posts: PlatformPosts,
  imageUrl: string | undefined,
  accounts: BlotatoAccounts,
): Promise<PublishLog[]> {
  const logs: PublishLog[] = [];
  const platforms = Object.keys(posts) as Platform[];

  for (const platform of platforms) {
    const accountId = accounts[platform];
    if (!accountId) {
      logger.warn(`No Blotato account found for ${platform} — skipping`, { date, platform });
      logs.push({
        platform,
        postId: '',
        scheduledTime: '',
        status: 'failed',
        error: `No accountId configured for ${platform}`,
      });
      continue;
    }

    const text = posts[platform];
    if (!text?.trim()) {
      logger.warn(`Empty post for ${platform} on ${date} — skipping`, { date, platform });
      continue;
    }

    try {
      const scheduledTime = buildScheduledTime(date, PLATFORM_HOUR_OFFSETS[platform]);
      const postId = await withRetry(
        () => publishToBlotato(accountId, platform, text, imageUrl, scheduledTime),
        {
          ...BLOTATO_RETRY_OPTIONS,
          onRetry: (attempt, error, delay) => {
            logger.warn(
              `Publish retry ${attempt}/${BLOTATO_RETRY_OPTIONS.maxAttempts} for ${platform} on ${date}: ${error.message}. Retrying in ${Math.round(delay)}ms`,
            );
          },
        },
      );

      logs.push({ platform, postId, scheduledTime, status: 'posted' });
      logger.info(`Published ${platform} for ${date}: postId=${postId}`, { date, platform, postId });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to publish ${platform} for ${date}: ${errorMsg}`, { date, platform, error: errorMsg });
      logs.push({
        platform,
        postId: '',
        scheduledTime: '',
        status: 'failed',
        error: errorMsg,
      });
    }
  }

  return logs;
}

// ─── Blotato API ──────────────────────────────────────────────────────────────

async function publishToBlotato(
  accountId: string,
  platform: Platform,
  text: string,
  imageUrl: string | undefined,
  scheduledTime: string,
): Promise<string> {
  // Build content object
  const content: Record<string, any> = {
    text,
    platform: blotatoPlatformName(platform),
  };

  // Add image for visual platforms
  const visualPlatforms: Platform[] = ['instagram', 'facebook', 'linkedin', 'threads'];
  if (imageUrl && visualPlatforms.includes(platform)) {
    content.mediaUrls = [imageUrl];
  }

  const body = {
    post: {
      accountId,
      content,
      target: { targetType: blotatoPlatformName(platform) },
    },
    useNextFreeSlot: true,
    scheduledTime,
  };

  const res = await withTimeout(
    blotatoPost('/posts', body),
    BLOTATO_TIMEOUT_MS,
    `Blotato publish timed out after ${BLOTATO_TIMEOUT_MS}ms for ${platform}`,
  );
  
  return (res as any)?.postId ?? (res as any)?.id ?? 'unknown';
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function blotatoGet(endpoint: string): Promise<unknown> {
  const res = await fetch(`${BLOTATO_BASE}${endpoint}`, {
    headers: { 'blotato-api-key': BLOTATO_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw createPublishError(
      `Blotato GET ${endpoint} failed ${res.status}: ${text.slice(0, 300)}`,
      { endpoint, status: res.status },
    );
  }
  return res.json();
}

async function blotatoPost(endpoint: string, body: object): Promise<unknown> {
  const res = await fetch(`${BLOTATO_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'blotato-api-key': BLOTATO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw createPublishError(
      `Blotato POST ${endpoint} failed ${res.status}: ${text.slice(0, 300)}`,
      { endpoint, status: res.status },
    );
  }
  return res.json();
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function blotatoPlatformName(platform: Platform): string {
  const map: Record<Platform, string> = {
    instagram: 'instagram',
    linkedin: 'linkedin',
    twitter: 'twitter',
    facebook: 'facebook',
    threads: 'threads',
  };
  return map[platform] ?? platform;
}

function normalisePlatform(raw: string): Platform | null {
  const lower = raw.toLowerCase();
  if (lower.includes('instagram')) return 'instagram';
  if (lower.includes('linkedin')) return 'linkedin';
  if (lower.includes('twitter') || lower.includes('x')) return 'twitter';
  if (lower.includes('facebook')) return 'facebook';
  if (lower.includes('thread')) return 'threads';
  return null;
}

/** Builds an ISO timestamp for a given date at a specific hour (IST = UTC+5:30) */
function buildScheduledTime(date: string, hourIST: number): string {
  const hourUTC = hourIST - 5; // IST is UTC+5:30; simplified to UTC+5 for integer hours
  const d = new Date(`${date}T${String(hourUTC).padStart(2, '0')}:00:00Z`);
  return d.toISOString();
}
