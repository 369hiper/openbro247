// ─────────────────────────────────────────────────────────────────────────────
// Timeout Utility
// Provides timeout handling for async operations to prevent hanging.
// ─────────────────────────────────────────────────────────────────────────────

import { Logger } from './logger';

const logger = new Logger('Timeout');

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly operation: string,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the specified time, it rejects with a TimeoutError.
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message (optional)
 * @returns The result of the promise if it completes in time
 * @throws TimeoutError if the promise doesn't complete in time
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const message = errorMessage ?? `Operation timed out after ${timeoutMs}ms`;
      logger.warn(`Timeout: ${message}`);
      reject(new TimeoutError(message, timeoutMs, 'unknown'));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return result;
  } catch (error) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    throw error;
  }
}

/**
 * Creates a timeout wrapper for a specific function.
 * @param fn - The async function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message (optional)
 * @returns A new function with timeout handling
 */
export function createTimeoutWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  timeoutMs: number,
  errorMessage?: string,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withTimeout(fn(...args), timeoutMs, errorMessage);
  };
}

/**
 * Executes multiple promises with individual timeouts.
 * @param promises - Array of promises with their timeout configurations
 * @returns Array of results (or errors) for each promise
 */
export async function withTimeouts<T>(
  promises: Array<{
    promise: Promise<T>;
    timeoutMs: number;
    name: string;
  }>,
): Promise<Array<{ result?: T; error?: Error; name: string }>> {
  return Promise.all(
    promises.map(async ({ promise, timeoutMs, name }) => {
      try {
        const result = await withTimeout(promise, timeoutMs, `${name} timed out`);
        return { result, name };
      } catch (error) {
        return { error: error instanceof Error ? error : new Error(String(error)), name };
      }
    }),
  );
}
