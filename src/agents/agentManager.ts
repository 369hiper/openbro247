import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { LRUCache } from '../utils/cache';
import { SQLiteStore } from '../memory/sqliteStore';
import { Agent, AgentConfig, AgentFilters, ModelConfig } from './types';

// Custom error types for better error handling
export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = 'AgentNotFoundError';
  }
}

export class NotInitializedError extends Error {
  constructor() {
    super('AgentManager not initialized. Call initialize() first.');
    this.name = 'NotInitializedError';
  }
}

export class InvalidAgentConfigError extends Error {
  constructor(message: string) {
    super(`Invalid agent configuration: ${message}`);
    this.name = 'InvalidAgentConfigError';
  }
}

export class AgentManager {
  private agentCache: LRUCache<Agent>;
  private sqliteStore: SQLiteStore;
  private logger: Logger;
  private initialized: boolean = false;
  private concurrentOps: number = 0;
  private readonly maxCacheSize: number = 500;

  constructor(sqliteStore: SQLiteStore) {
    this.sqliteStore = sqliteStore;
    this.logger = new Logger('AgentManager');
    this.agentCache = new LRUCache<Agent>(this.maxCacheSize);
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.logger.info(
      `AgentManager initialized (lazy loading enabled, cache size: ${this.maxCacheSize})`
    );
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new NotInitializedError();
    }
  }

  private async withConcurrencyControl<T>(operation: () => Promise<T>): Promise<T> {
    this.concurrentOps++;
    try {
      return await operation();
    } finally {
      this.concurrentOps--;
    }
  }

  private validateAgentConfig(config: AgentConfig): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new InvalidAgentConfigError('Agent name is required and cannot be empty');
    }
    if (!config.type || !['main', 'sub', 'specialized'].includes(config.type)) {
      throw new InvalidAgentConfigError(
        'Agent type must be one of: main, sub, specialized'
      );
    }
    if (!config.capabilities || !Array.isArray(config.capabilities) || config.capabilities.length === 0) {
      throw new InvalidAgentConfigError('Agent must have at least one capability');
    }
    if (!config.modelConfig || !config.modelConfig.provider) {
      throw new InvalidAgentConfigError('Agent model configuration is required');
    }
  }

  private validateAgentUpdate(updates: Partial<Agent>): void {
    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
        throw new InvalidAgentConfigError('Agent name must be a non-empty string');
      }
    }
    if (updates.type !== undefined) {
      if (!['main', 'sub', 'specialized'].includes(updates.type)) {
        throw new InvalidAgentConfigError(
          'Agent type must be one of: main, sub, specialized'
        );
      }
    }
    if (updates.status !== undefined) {
      if (!['active', 'idle', 'busy', 'error'].includes(updates.status)) {
        throw new InvalidAgentConfigError(
          'Agent status must be one of: active, idle, busy, error'
        );
      }
    }
    if (updates.capabilities !== undefined) {
      if (!Array.isArray(updates.capabilities) || updates.capabilities.length === 0) {
        throw new InvalidAgentConfigError('Agent must have at least one capability');
      }
    }
  }

  async createAgent(config: AgentConfig): Promise<Agent> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();
      this.validateAgentConfig(config);

      const agent: Agent = {
        id: uuidv4(),
        name: config.name.trim(),
        type: config.type,
        status: 'idle',
        modelConfig: {
          ...config.modelConfig,
          parameters: config.modelConfig.parameters || {
            temperature: 0.7,
            maxTokens: 1000,
            topP: 1,
            frequencyPenalty: 0,
            presencePenalty: 0
          }
        },
        capabilities: config.capabilities,
        parentAgentId: config.parentAgentId,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: config.metadata
      };

      this.agentCache.set(agent.id, agent);
      await this.sqliteStore.storeAgent(agent);

      this.logger.info(`Created agent: ${agent.id} (${agent.name})`);
      return agent;
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      if (!this.agentCache.has(agentId)) {
        // Check database before throwing
        const dbAgent = await this.sqliteStore.getAgent(agentId);
        if (!dbAgent) {
          throw new AgentNotFoundError(agentId);
        }
      }

      this.agentCache.delete(agentId);
      await this.sqliteStore.deleteAgent(agentId);

      this.logger.info(`Deleted agent: ${agentId}`);
    });
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      // Check cache first
      const cachedAgent = this.agentCache.get(agentId);
      if (cachedAgent) {
        return cachedAgent;
      }

      // Load from database if not in cache
      const agent = await this.sqliteStore.getAgent(agentId);
      if (agent) {
        this.agentCache.set(agentId, agent);
      }
      return agent;
    });
  }

  async listAgents(filters?: AgentFilters): Promise<Agent[]> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      // For better performance, push filtering to database when possible
      // Otherwise fall back to in-memory filtering for cached results
      let agents = await this.sqliteStore.getAllAgents();

      // Update cache incrementally (don't overwrite entire cache)
      for (const agent of agents) {
        this.agentCache.set(agent.id, agent);
      }

      if (filters) {
        if (filters.type) {
          agents = agents.filter(a => a.type === filters.type);
        }
        if (filters.status) {
          agents = agents.filter(a => a.status === filters.status);
        }
        if (filters.parentAgentId) {
          agents = agents.filter(a => a.parentAgentId === filters.parentAgentId);
        }
      }

      return agents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    });
  }

  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();
      this.validateAgentUpdate(updates);

      const cachedAgent = this.agentCache.get(agentId);
      const agent = cachedAgent || (await this.sqliteStore.getAgent(agentId));

      if (!agent) {
        throw new AgentNotFoundError(agentId);
      }

      const updatedAgent: Agent = {
        ...agent,
        ...updates,
        id: agent.id,
        createdAt: agent.createdAt,
        updatedAt: new Date()
      };

      this.agentCache.set(agentId, updatedAgent);
      await this.sqliteStore.updateAgent(agentId, updatedAgent);

      this.logger.info(`Updated agent: ${agentId}`);
      return updatedAgent;
    });
  }

  async updateAgentStatus(agentId: string, status: Agent['status']): Promise<Agent> {
    if (!['active', 'idle', 'busy', 'error'].includes(status)) {
      throw new InvalidAgentConfigError(
        `Invalid status: ${status}. Must be one of: active, idle, busy, error`
      );
    }
    return this.updateAgent(agentId, { status });
  }

  async setAgentModel(agentId: string, modelConfig: ModelConfig): Promise<Agent> {
    return this.updateAgent(agentId, { modelConfig });
  }

  async getAgentsByParent(parentAgentId: string): Promise<Agent[]> {
    return this.listAgents({ parentAgentId });
  }

  async getMainAgent(): Promise<Agent | null> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const agents = await this.listAgents({ type: 'main' });
      if (agents.length === 0) {
        return null;
      }

      if (agents.length > 1) {
        this.logger.warn(
          `Multiple main agents found (${agents.length}). Returning the newest. Consider consolidating.`
        );
      }

      return agents[0];
    });
  }

  /**
   * Get cache statistics for monitoring and debugging
   */
  getCacheStats(): { size: number; maxSize: number; } {
    return {
      size: this.agentCache.size(),
      maxSize: this.maxCacheSize
    };
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get number of concurrent operations in flight
   */
  getConcurrentOpsCount(): number {
    return this.concurrentOps;
  }

  /**
   * Clear the cache (useful for testing or emergency cleanup)
   */
  clearCache(): void {
    this.agentCache.clear();
    this.logger.info('Agent cache cleared');
  }

}
