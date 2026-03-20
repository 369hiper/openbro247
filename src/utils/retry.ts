// ─────────────────────────────────────────────────────────────────────────────
// Retry Utility with Exponential Backoff
// Provides resilient retry logic for external API calls and operations.
// ─────────────────────────────────────────────────────────────────────────────

import { Logger } from './logger';

const logger = new Logger('Retry');

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'NetworkError',
    'TimeoutError',
    'fetch failed',
  ],
};

/**
 * Executes a function with retry logic and exponential backoff.
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function if successful
 * @throws The last error if all retry attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable = config.retryableErrors?.some(
        (retryable) =>
          lastError!.message.toLowerCase().includes(retryable.toLowerCase()) ||
          lastError!.name.toLowerCase().includes(retryable.toLowerCase()),
      );

      // Don't retry if error is not retryable or this is the last attempt
      if (!isRetryable || attempt === config.maxAttempts) {
        logger.error(
          `Retry failed after ${attempt} attempts: ${lastError.message}`,
          lastError,
        );
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = config.baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
      const delay = Math.min(exponentialDelay + jitter, config.maxDelay);

      logger.warn(
        `Retry attempt ${attempt}/${config.maxAttempts} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms`,
      );

      // Call onRetry callback if provided
      config.onRetry?.(attempt, lastError, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed with unknown error');
}

/**
 * Sleeps for the specified number of milliseconds.
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a retry wrapper for a specific function.
 * Useful for creating reusable retry-enabled functions.
 * @param fn - The function to wrap
 * @param options - Default retry options for this wrapper
 * @returns A new function with retry logic
 */
export function createRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: Partial<RetryOptions> = {},
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withRetry(() => fn(...args), options);
  };
}
