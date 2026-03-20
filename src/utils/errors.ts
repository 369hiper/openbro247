// ─────────────────────────────────────────────────────────────────────────────
// Structured Error Handling Utility
// Provides typed errors with context for better debugging and monitoring.
// ─────────────────────────────────────────────────────────────────────────────

import { PipelineStage } from '../plugins/marketing/types';

/**
 * Base error class for all pipeline-related errors.
 * Provides structured error information for debugging and monitoring.
 */
export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stage: PipelineStage,
    public readonly context: Record<string, unknown> = {},
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'PipelineError';
  }

  /**
   * Converts the error to a structured object for logging.
   */
  toLogObject(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      stage: this.stage,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Converts the error to a JSON-serializable object.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      stage: this.stage,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
    };
  }
}

/**
 * Error codes for different failure scenarios.
 */
export const ErrorCodes = {
  // Research stage errors
  RESEARCH_FAILED: 'RESEARCH_FAILED',
  WEB_SEARCH_FAILED: 'WEB_SEARCH_FAILED',
  LLM_SYNTHESIS_FAILED: 'LLM_SYNTHESIS_FAILED',

  // Content generation errors
  CONTENT_GENERATION_FAILED: 'CONTENT_GENERATION_FAILED',
  CONTENT_VALIDATION_FAILED: 'CONTENT_VALIDATION_FAILED',
  CONTENT_REWRITE_FAILED: 'CONTENT_REWRITE_FAILED',

  // Image generation errors
  IMAGE_GENERATION_FAILED: 'IMAGE_GENERATION_FAILED',
  IMAGE_UPLOAD_FAILED: 'IMAGE_UPLOAD_FAILED',
  GEMINI_API_ERROR: 'GEMINI_API_ERROR',
  IMGBB_API_ERROR: 'IMGBB_API_ERROR',

  // Publishing errors
  PUBLISH_FAILED: 'PUBLISH_FAILED',
  BLOTATO_API_ERROR: 'BLOTATO_API_ERROR',
  ACCOUNT_FETCH_FAILED: 'ACCOUNT_FETCH_FAILED',

  // Pipeline errors
  PIPELINE_STAGE_FAILED: 'PIPELINE_STAGE_FAILED',
  PIPELINE_TIMEOUT: 'PIPELINE_TIMEOUT',
  PIPELINE_STATE_ERROR: 'PIPELINE_STATE_ERROR',

  // Storage errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',

  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_CONFIG: 'MISSING_CONFIG',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Creates a research stage error.
 */
export function createResearchError(
  message: string,
  context: Record<string, unknown> = {},
): PipelineError {
  return new PipelineError(
    message,
    ErrorCodes.RESEARCH_FAILED,
    'researching',
    context,
    true, // Research errors are retryable
  );
}

/**
 * Creates a content generation error.
 */
export function createContentError(
  message: string,
  context: Record<string, unknown> = {},
): PipelineError {
  return new PipelineError(
    message,
    ErrorCodes.CONTENT_GENERATION_FAILED,
    'writing',
    context,
    true, // Content errors are retryable
  );
}

/**
 * Creates an image generation error.
 */
export function createImageError(
  message: string,
  context: Record<string, unknown> = {},
): PipelineError {
  return new PipelineError(
    message,
    ErrorCodes.IMAGE_GENERATION_FAILED,
    'generating_images',
    context,
    true, // Image errors are retryable
  );
}

/**
 * Creates a publishing error.
 */
export function createPublishError(
  message: string,
  context: Record<string, unknown> = {},
): PipelineError {
  return new PipelineError(
    message,
    ErrorCodes.PUBLISH_FAILED,
    'publishing',
    context,
    true, // Publish errors are retryable
  );
}

/**
 * Creates a timeout error.
 */
export function createTimeoutError(
  message: string,
  stage: PipelineStage,
  context: Record<string, unknown> = {},
): PipelineError {
  return new PipelineError(
    message,
    ErrorCodes.TIMEOUT,
    stage,
    context,
    true, // Timeout errors are retryable
  );
}

/**
 * Creates a database error.
 */
export function createDatabaseError(
  message: string,
  context: Record<string, unknown> = {},
): PipelineError {
  return new PipelineError(
    message,
    ErrorCodes.DATABASE_ERROR,
    'idle', // Database errors can happen at any stage
    context,
    false, // Database errors are typically not retryable
  );
}

/**
 * Wraps an unknown error into a PipelineError.
 */
export function wrapError(
  error: unknown,
  code: ErrorCode,
  stage: PipelineStage,
  context: Record<string, unknown> = {},
): PipelineError {
  if (error instanceof PipelineError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new PipelineError(message, code, stage, context, true);
}
