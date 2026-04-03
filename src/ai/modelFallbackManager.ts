/**
 * Model Fallback Manager
 *
 * Manages free OpenRouter models per agent role, persists them in SQLite,
 * and provides automatic fallback when a model returns token-limit,
 * credit-exhaustion, or rate-limit errors.
 *
 * @module ai/modelFallbackManager
 */

import { Logger } from '../utils/logger';
import { SQLiteStore } from '../memory/sqliteStore';

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

export type AgentRole = 'coding' | 'browser' | 'vision' | 'research' | 'general';

export interface AIModel {
  id: string;
  modelId: string;
  provider: string;
  displayName: string;
  agentRole: AgentRole;
  isFree: boolean;
  isActive: boolean;
  priority: number;
  contextLength: number;
  supportsVision: boolean;
  errorCount: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastUsedAt: string | null;
  totalRequests: number;
  createdAt: string;
}

export interface ModelFallbackOptions {
  /** Max consecutive errors before temporarily disabling a model */
  maxErrorsBeforeDisable: number;
  /** Cooldown in ms before re-enabling a disabled model */
  errorCooldownMs: number;
}

// ────────────────────────────────────────────────
// Default free models – seeded on first boot
// ────────────────────────────────────────────────

const DEFAULT_FREE_MODELS: Omit<AIModel, 'id' | 'errorCount' | 'lastError' | 'lastErrorAt' | 'lastUsedAt' | 'totalRequests' | 'createdAt'>[] = [
  // ── Coding models ──
  { modelId: 'qwen/qwen3-coder:free',                                      provider: 'openrouter', displayName: 'Qwen3 Coder',               agentRole: 'coding',   isFree: true, isActive: true, priority: 100, contextLength: 32768, supportsVision: false },
  { modelId: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', provider: 'openrouter', displayName: 'Dolphin Mistral 24B Venice', agentRole: 'coding',   isFree: true, isActive: true, priority: 80,  contextLength: 16384, supportsVision: false },
  { modelId: 'nvidia/nemotron-3-super-120b-a12b:free',                       provider: 'openrouter', displayName: 'Nemotron 3 Super 120B',     agentRole: 'coding',   isFree: true, isActive: true, priority: 60,  contextLength: 32768, supportsVision: false },

  // ── Browser-use models ──
  { modelId: 'mistralai/mistral-small-3.1-24b-instruct:free',               provider: 'openrouter', displayName: 'Mistral Small 3.1 24B',     agentRole: 'browser',  isFree: true, isActive: true, priority: 100, contextLength: 32768, supportsVision: false },
  { modelId: 'google/gemma-3-27b-it:free',                                  provider: 'openrouter', displayName: 'Gemma 3 27B IT',             agentRole: 'browser',  isFree: true, isActive: true, priority: 80,  contextLength: 8192,  supportsVision: false },
  { modelId: 'meta-llama/llama-3.2-3b-instruct:free',                       provider: 'openrouter', displayName: 'Llama 3.2 3B Instruct',     agentRole: 'browser',  isFree: true, isActive: true, priority: 40,  contextLength: 4096,  supportsVision: false },

  // ── Vision models (computer-use) ──
  { modelId: 'google/gemma-3n-e4b-it:free',                                 provider: 'openrouter', displayName: 'Gemma 3N E4B IT',            agentRole: 'vision',   isFree: true, isActive: true, priority: 100, contextLength: 8192,  supportsVision: true },
  { modelId: 'google/gemma-3-12b-it:free',                                  provider: 'openrouter', displayName: 'Gemma 3 12B IT',             agentRole: 'vision',   isFree: true, isActive: true, priority: 80,  contextLength: 8192,  supportsVision: true },
  { modelId: 'google/gemma-3-27b-it:free',                                  provider: 'openrouter', displayName: 'Gemma 3 27B IT (Vision)',    agentRole: 'vision',   isFree: true, isActive: true, priority: 60,  contextLength: 8192,  supportsVision: true },

  // ── Research models ──
  { modelId: 'qwen/qwen3-next-80b-a3b-instruct:free',                       provider: 'openrouter', displayName: 'Qwen3 Next 80B',            agentRole: 'research', isFree: true, isActive: true, priority: 100, contextLength: 32768, supportsVision: false },
  { modelId: 'nousresearch/hermes-3-llama-3.1-405b:free',                    provider: 'openrouter', displayName: 'Hermes 3 Llama 405B',       agentRole: 'research', isFree: true, isActive: true, priority: 80,  contextLength: 32768, supportsVision: false },
  { modelId: 'openai/gpt-oss-120b:free',                                    provider: 'openrouter', displayName: 'GPT-OSS 120B',              agentRole: 'research', isFree: true, isActive: true, priority: 60,  contextLength: 32768, supportsVision: false },

  // ── General-purpose models ──
  { modelId: 'minimax/minimax-m2.5:free',                                   provider: 'openrouter', displayName: 'MiniMax M2.5',              agentRole: 'general',  isFree: true, isActive: true, priority: 100, contextLength: 16384, supportsVision: false },
  { modelId: 'z-ai/glm-4.5-air:free',                                      provider: 'openrouter', displayName: 'GLM 4.5 Air',               agentRole: 'general',  isFree: true, isActive: true, priority: 80,  contextLength: 16384, supportsVision: false },
  { modelId: 'meta-llama/llama-3.2-3b-instruct:free',                       provider: 'openrouter', displayName: 'Llama 3.2 3B (General)',    agentRole: 'general',  isFree: true, isActive: true, priority: 40,  contextLength: 4096,  supportsVision: false },
];

// ────────────────────────────────────────────────
// Retryable error detection
// ────────────────────────────────────────────────

const RETRYABLE_ERROR_PATTERNS = [
  /rate.?limit/i,
  /429/,
  /402/,
  /out.?of.?(?:tokens|credits?)/i,
  /quota.?exceeded/i,
  /insufficient.?(?:credits?|balance|quota)/i,
  /too.?many.?requests/i,
  /capacity/i,
  /overloaded/i,
  /model.?not.?available/i,
];

export function isRetryableModelError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERROR_PATTERNS.some(re => re.test(msg));
}

// ────────────────────────────────────────────────
// Manager
// ────────────────────────────────────────────────

export class ModelFallbackManager {
  private logger: Logger;
  private sqliteStore: SQLiteStore;
  private options: ModelFallbackOptions;
  private initialized = false;

  constructor(sqliteStore: SQLiteStore, options?: Partial<ModelFallbackOptions>) {
    this.sqliteStore = sqliteStore;
    this.logger = new Logger('ModelFallbackManager');
    this.options = {
      maxErrorsBeforeDisable: options?.maxErrorsBeforeDisable ?? 5,
      errorCooldownMs: options?.errorCooldownMs ?? 5 * 60 * 1000, // 5 min
    };
  }

  // ── Bootstrap ──────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure table exists
    await this.sqliteStore.createAIModelsTable();

    // Seed default models (no-op if already seeded)
    const existing = await this.sqliteStore.getAllAIModels();
    if (existing.length === 0) {
      this.logger.info('Seeding default free models...');
      for (const model of DEFAULT_FREE_MODELS) {
        await this.sqliteStore.storeAIModel({
          ...model,
          id: `model_${model.modelId.replace(/[/:]/g, '_')}`,
          errorCount: 0,
          lastError: null,
          lastErrorAt: null,
          lastUsedAt: null,
          totalRequests: 0,
          createdAt: new Date().toISOString(),
        });
      }
      this.logger.info(`Seeded ${DEFAULT_FREE_MODELS.length} free models`);
    } else {
      this.logger.info(`${existing.length} models already in database`);
    }

    this.initialized = true;
  }

  // ── Model selection ────────────────────────────

  /**
   * Get the best available model for a given agent role.
   * Returns models ordered by priority, filtering out temporarily disabled ones.
   */
  async getBestModel(role: AgentRole): Promise<AIModel | null> {
    const models = await this.sqliteStore.getAIModelsByRole(role);

    // Re-enable models whose cooldown has expired
    const now = Date.now();
    for (const model of models) {
      if (
        !model.isActive &&
        model.lastErrorAt &&
        now - new Date(model.lastErrorAt).getTime() > this.options.errorCooldownMs
      ) {
        this.logger.info(`Re-enabling model ${model.modelId} after cooldown`);
        await this.sqliteStore.updateAIModelStatus(model.id, true, 0);
        model.isActive = true;
        model.errorCount = 0;
      }
    }

    const active = models.filter(m => m.isActive);
    if (active.length === 0) {
      this.logger.warn(`No active models for role "${role}", re-enabling all`);
      for (const model of models) {
        await this.sqliteStore.updateAIModelStatus(model.id, true, 0);
      }
      return models[0] ?? null;
    }

    // Highest priority first (already sorted by DB query)
    return active[0];
  }

  /**
   * Get the next fallback model for a role, excluding a specific model.
   */
  async getNextFallback(role: AgentRole, excludeModelId: string): Promise<AIModel | null> {
    const models = await this.sqliteStore.getAIModelsByRole(role);
    const active = models.filter(m => m.isActive && m.modelId !== excludeModelId);
    return active[0] ?? null;
  }

  /**
   * Get all models for all roles (for status display).
   */
  async getAllModels(): Promise<AIModel[]> {
    return this.sqliteStore.getAllAIModels();
  }

  // ── Error & success tracking ───────────────────

  async recordSuccess(modelId: string): Promise<void> {
    await this.sqliteStore.recordAIModelSuccess(modelId);
  }

  async recordError(modelId: string, error: string): Promise<void> {
    const model = await this.sqliteStore.getAIModelByModelId(modelId);
    if (!model) return;

    const newErrorCount = model.errorCount + 1;
    await this.sqliteStore.recordAIModelError(modelId, error, newErrorCount);

    if (newErrorCount >= this.options.maxErrorsBeforeDisable) {
      this.logger.warn(`Disabling model ${modelId} after ${newErrorCount} consecutive errors`);
      await this.sqliteStore.updateAIModelStatus(model.id, false, newErrorCount);
    }
  }

  // ── Execute with fallback ──────────────────────

  /**
   * Execute an LLM call with automatic fallback.
   * The `callFn` receives a model ID and should make the API call.
   * On retryable errors, the next model in priority order is tried.
   */
  async executeWithFallback<T>(
    role: AgentRole,
    callFn: (modelId: string) => Promise<T>
  ): Promise<T> {
    const triedModels = new Set<string>();
    const models = await this.sqliteStore.getAIModelsByRole(role);
    const activeModels = models.filter(m => m.isActive);

    if (activeModels.length === 0) {
      throw new Error(`No available models for role "${role}"`);
    }

    for (const model of activeModels) {
      if (triedModels.has(model.modelId)) continue;
      triedModels.add(model.modelId);

      try {
        this.logger.info(`Trying model: ${model.modelId} (role=${role})`);
        const result = await callFn(model.modelId);
        await this.recordSuccess(model.modelId);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Model ${model.modelId} failed: ${errorMsg}`);
        await this.recordError(model.modelId, errorMsg);

        if (!isRetryableModelError(error)) {
          // Non-retryable error → don't try fallback, surface immediately
          throw error;
        }

        this.logger.info(`Retryable error, trying next model...`);
      }
    }

    throw new Error(`All ${triedModels.size} models exhausted for role "${role}"`);
  }

  // ── Utility ────────────────────────────────────

  /**
   * Map an agent type string (from Agent.type or operator role) to a model role.
   */
  static resolveRole(agentType: string): AgentRole {
    const normalized = agentType.toLowerCase();

    if (/cod(?:e|ing)|develop|architect|engineer|claude.?code/i.test(normalized)) return 'coding';
    if (/brows(?:e|er|ing)|web|naviga/i.test(normalized)) return 'browser';
    if (/vision|screen|comput(?:e|er).?use|desktop|ocr/i.test(normalized)) return 'vision';
    if (/research|analy|deep.?research/i.test(normalized)) return 'research';

    return 'general';
  }
}
