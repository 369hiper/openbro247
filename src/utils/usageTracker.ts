import { Logger } from '../utils/logger';
import { SQLiteStore } from '../memory/sqliteStore';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

// Token pricing per 1M tokens (USD) — approximate
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4':              { input: 30.00,  output: 60.00 },
  'gpt-4o':             { input: 5.00,   output: 15.00 },
  'gpt-4o-mini':        { input: 0.15,   output: 0.60 },
  'gpt-3.5-turbo':      { input: 0.50,   output: 1.50 },
  'claude-3-5-sonnet':  { input: 3.00,   output: 15.00 },
  'claude-3-haiku':     { input: 0.25,   output: 1.25 },
  'claude-3-opus':      { input: 15.00,  output: 75.00 },
};

export interface UsageEntry {
  id: string;
  timestamp: Date;
  provider: string;
  model: string;
  agentId?: string;
  sessionId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  purpose?: string; // "chat", "task", "heartbeat", "research"
}

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { requests: number; tokens: number; costUsd: number }>;
  byAgent: Record<string, { requests: number; tokens: number; costUsd: number }>;
  byDay: Record<string, { requests: number; tokens: number; costUsd: number }>;
  period: { from: string; to: string };
}

// ──────────────────────────────────────────────
// UsageTracker
// ──────────────────────────────────────────────

export class UsageTracker {
  private logger: Logger;
  private sqliteStore: SQLiteStore;
  private entries: UsageEntry[] = [];
  private maxInMemory = 1000;

  constructor(sqliteStore: SQLiteStore) {
    this.sqliteStore = sqliteStore;
    this.logger = new Logger('UsageTracker');
  }

  // ──────────────────────────────────────────────
  // Track a single LLM call
  // ──────────────────────────────────────────────

  track(params: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    agentId?: string;
    sessionId?: string;
    purpose?: string;
  }): UsageEntry {
    const id = `usage_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const estimatedCostUsd = this.estimateCost(
      params.model,
      params.promptTokens,
      params.completionTokens
    );

    const entry: UsageEntry = {
      id,
      timestamp: new Date(),
      provider: params.provider,
      model: params.model,
      agentId: params.agentId,
      sessionId: params.sessionId,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.promptTokens + params.completionTokens,
      estimatedCostUsd,
      purpose: params.purpose,
    };

    this.entries.push(entry);

    // Trim in-memory buffer
    if (this.entries.length > this.maxInMemory) {
      this.entries.splice(0, this.entries.length - this.maxInMemory);
    }

    // Persist asynchronously (non-blocking)
    this.persistEntry(entry).catch(() => {});

    this.logger.info(
      `Usage tracked: ${params.model} | ${entry.totalTokens} tokens | $${estimatedCostUsd.toFixed(6)}`
    );

    return entry;
  }

  // ──────────────────────────────────────────────
  // Summaries
  // ──────────────────────────────────────────────

  getSummary(options: { days?: number; agentId?: string } = {}): UsageSummary {
    const { days = 30, agentId } = options;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let filtered = this.entries.filter((e) => e.timestamp >= from);
    if (agentId) {
      filtered = filtered.filter((e) => e.agentId === agentId);
    }

    const summary: UsageSummary = {
      totalRequests: filtered.length,
      totalTokens: 0,
      totalCostUsd: 0,
      byModel: {},
      byAgent: {},
      byDay: {},
      period: { from: from.toISOString(), to: new Date().toISOString() },
    };

    for (const entry of filtered) {
      summary.totalTokens += entry.totalTokens;
      summary.totalCostUsd += entry.estimatedCostUsd;

      // By model
      if (!summary.byModel[entry.model]) {
        summary.byModel[entry.model] = { requests: 0, tokens: 0, costUsd: 0 };
      }
      summary.byModel[entry.model].requests++;
      summary.byModel[entry.model].tokens += entry.totalTokens;
      summary.byModel[entry.model].costUsd += entry.estimatedCostUsd;

      // By agent
      const agentKey = entry.agentId ?? 'unknown';
      if (!summary.byAgent[agentKey]) {
        summary.byAgent[agentKey] = { requests: 0, tokens: 0, costUsd: 0 };
      }
      summary.byAgent[agentKey].requests++;
      summary.byAgent[agentKey].tokens += entry.totalTokens;
      summary.byAgent[agentKey].costUsd += entry.estimatedCostUsd;

      // By day
      const day = entry.timestamp.toISOString().slice(0, 10);
      if (!summary.byDay[day]) {
        summary.byDay[day] = { requests: 0, tokens: 0, costUsd: 0 };
      }
      summary.byDay[day].requests++;
      summary.byDay[day].tokens += entry.totalTokens;
      summary.byDay[day].costUsd += entry.estimatedCostUsd;
    }

    return summary;
  }

  getRecentEntries(limit: number = 50): UsageEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  // ──────────────────────────────────────────────
  // Cost estimation
  // ──────────────────────────────────────────────

  private estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    // Find matching pricing (partial model name match)
    const pricingKey = Object.keys(MODEL_PRICING).find((key) => model.toLowerCase().includes(key));
    const pricing = pricingKey ? MODEL_PRICING[pricingKey] : { input: 2.00, output: 6.00 };

    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  // ──────────────────────────────────────────────
  // Persistence
  // ──────────────────────────────────────────────

  private async persistEntry(_entry: UsageEntry): Promise<void> {
    // TODO: Add dedicated usage_log table to SQLiteStore for persistence
    // Currently entries are in-memory only (last 1000 requests)
  }
}
