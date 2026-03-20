// ─────────────────────────────────────────────────────────────────────────────
// Shilergy Marketing Plugin — Image Generator Agent
// Calls Gemini Imagen API, decodes base64, saves locally, uploads to imgbb
// for a public URL that Blotato can use in mediaUrls.
// Uses Node 18+ native fetch and FormData — no extra dependencies needed.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { Logger } from '../../../utils/logger';
import { withRetry } from '../../../utils/retry';
import { withTimeout } from '../../../utils/timeout';
import { createImageError, ErrorCodes } from '../../../utils/errors';
import { buildGeminiPrompt } from '../constants/shilergy-brand';

const logger = new Logger('MarketingImageGenerator');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const IMGBB_API_KEY = process.env.IMGBB_API_KEY ?? '';
const IMAGES_DIR = process.env.MARKETING_IMAGES_DIR
  ?? path.join(process.cwd(), 'data', 'marketing', 'images');

// Timeout configurations (in milliseconds)
const GEMINI_TIMEOUT_MS = 60000; // 60 seconds for image generation
const IMGBB_TIMEOUT_MS = 30000; // 30 seconds for image upload

// Retry configurations
const RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelay: 2000,
  maxDelay: 15000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'NetworkError', 'TimeoutError', 'fetch failed'],
};

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Generates one image for the given concept and returns a public URL.
 * Flow: Gemini Imagen → base64 → local PNG → imgbb → public URL
 * Includes retry logic and timeout handling for resilience.
 */
export async function generateAndHostImage(imageConcept: string, date: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw createImageError('GEMINI_API_KEY is not set in .env', { date, imageConcept });
  }

  logger.info(`Generating image for ${date}: "${imageConcept.slice(0, 60)}..."`);

  const prompt = buildGeminiPrompt(imageConcept);

  // 1. Call Gemini Imagen API with retry and timeout
  const base64Image = await withRetry(
    async () => {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`;
      
      const geminiRes = await withTimeout(
        fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '1:1' },
          }),
        }),
        GEMINI_TIMEOUT_MS,
        `Gemini image generation timed out after ${GEMINI_TIMEOUT_MS}ms`,
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw createImageError(
          `Gemini Imagen API ${geminiRes.status}: ${errText.slice(0, 300)}`,
          { date, imageConcept, status: geminiRes.status },
        );
      }

      const geminiData = await geminiRes.json() as any;
      const base64: string | undefined = geminiData?.predictions?.[0]?.bytesBase64Encoded;
      
      if (!base64) {
        throw createImageError(
          `Gemini returned no image. Response: ${JSON.stringify(geminiData).slice(0, 300)}`,
          { date, imageConcept, response: geminiData },
        );
      }

      return base64;
    },
    {
      ...RETRY_OPTIONS,
      onRetry: (attempt, error, delay) => {
        logger.warn(
          `Gemini API retry ${attempt}/${RETRY_OPTIONS.maxAttempts} for ${date}: ${error.message}. Retrying in ${Math.round(delay)}ms`,
        );
      },
    },
  );

  // 2. Save locally (synchronous but fast)
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const localPath = path.join(IMAGES_DIR, `${date}.png`);
  fs.writeFileSync(localPath, Buffer.from(base64Image, 'base64'));
  logger.info(`Image saved: ${localPath}`);

  // 3. Upload to imgbb with retry and timeout → returns public URL for Blotato
  const publicUrl = await withRetry(
    () => uploadToImgbb(localPath, date),
    {
      ...RETRY_OPTIONS,
      onRetry: (attempt, error, delay) => {
        logger.warn(
          `imgbb upload retry ${attempt}/${RETRY_OPTIONS.maxAttempts} for ${date}: ${error.message}. Retrying in ${Math.round(delay)}ms`,
        );
      },
    },
  );

  logger.info(`Image public URL: ${publicUrl}`);
  return publicUrl;
}

// ─── imgbb Upload ─────────────────────────────────────────────────────────────

async function uploadToImgbb(localPath: string, name: string): Promise<string> {
  if (!IMGBB_API_KEY) {
    throw createImageError(
      'IMGBB_API_KEY is not set. Get a free key at https://api.imgbb.com/ and add IMGBB_API_KEY to .env',
      { localPath, name },
    );
  }

  // Node 18+ has native FormData — no `form-data` package needed
  const imageBuffer = fs.readFileSync(localPath);
  const base64 = imageBuffer.toString('base64');

  const form = new FormData();
  form.append('key', IMGBB_API_KEY);
  form.append('image', base64);
  form.append('name', `shilergy_${name}`);

  const res = await withTimeout(
    fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: form,
    }),
    IMGBB_TIMEOUT_MS,
    `imgbb upload timed out after ${IMGBB_TIMEOUT_MS}ms`,
  );

  if (!res.ok) {
    const errText = await res.text();
    throw createImageError(
      `imgbb upload ${res.status}: ${errText.slice(0, 300)}`,
      { localPath, name, status: res.status },
    );
  }

  const data = await res.json() as any;
  const url: string | undefined = data?.data?.url;
  
  if (!url) {
    throw createImageError(
      `imgbb returned no URL: ${JSON.stringify(data).slice(0, 300)}`,
      { localPath, name, response: data },
    );
  }

  return url;
}
