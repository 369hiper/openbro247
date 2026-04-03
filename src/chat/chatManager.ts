import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { LRUCache } from '../utils/cache';
import { SQLiteStore } from '../memory/sqliteStore';
import { ModelRouter } from '../models/modelRouter';
import { AgentManager } from '../agents/agentManager';
import { ChatMessage, ChatSession, ChatSessionConfig } from './types';
import { ChatRole } from '../models/types';

// Custom error types
export class ChatSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Chat session not found: ${sessionId}`);
    this.name = 'ChatSessionNotFoundError';
  }
}

export class InvalidSessionConfigError extends Error {
  constructor(message: string) {
    super(`Invalid session configuration: ${message}`);
    this.name = 'InvalidSessionConfigError';
  }
}

export class ChatManager {
  private sessionCache: LRUCache<ChatSession>;
  private sqliteStore: SQLiteStore;
  private modelRouter: ModelRouter;
  private agentManager: AgentManager;
  private logger: Logger;
  private initialized: boolean = false;
  private concurrentOps: number = 0;
  private readonly maxCacheSize: number = 500;

  constructor(
    sqliteStore: SQLiteStore,
    modelRouter: ModelRouter,
    agentManager: AgentManager
  ) {
    this.sqliteStore = sqliteStore;
    this.modelRouter = modelRouter;
    this.agentManager = agentManager;
    this.logger = new Logger('ChatManager');
    this.sessionCache = new LRUCache<ChatSession>(this.maxCacheSize);
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.logger.info(
      `ChatManager initialized (lazy loading enabled, cache size: ${this.maxCacheSize})`
    );
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ChatManager not initialized. Call initialize() first.');
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

  private validateSessionConfig(config: ChatSessionConfig): void {
    if (!config.agentId || config.agentId.trim().length === 0) {
      throw new InvalidSessionConfigError('agentId is required');
    }
  }

  async createSession(config: ChatSessionConfig): Promise<ChatSession> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();
      this.validateSessionConfig(config);

      const session: ChatSession = {
        id: uuidv4(),
        agentId: config.agentId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: config.metadata
      };

      this.sessionCache.set(session.id, session);
      await this.sqliteStore.storeChatSession(session);

      this.logger.info(`Created chat session: ${session.id} for agent ${config.agentId}`);
      return session;
    });
  }

  async sendMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<ChatMessage> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const cachedSession = this.sessionCache.get(sessionId);
      const session = cachedSession || (await this.sqliteStore.getChatSession(sessionId));

      if (!session) {
        throw new ChatSessionNotFoundError(sessionId);
      }

       const userMessage: ChatMessage = {
         id: uuidv4(),
         sessionId,
         role: ChatRole.USER,
         content,
         timestamp: new Date(),
         metadata
       };

      session.messages.push(userMessage);
      await this.sqliteStore.storeChatMessage(userMessage);

      const agent = await this.agentManager.getAgent(session.agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${session.agentId}`);
      }

      const systemMessage = this.buildSystemMessage(agent);
      const conversationHistory = this.buildConversationHistory(session.messages);

      const response = await this.modelRouter.route(
        session.agentId,
        agent.modelConfig,
        conversationHistory,
        { systemMessage }
      );

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        sessionId,
        role: ChatRole.ASSISTANT,
        content: response,
        timestamp: new Date()
      };

      session.messages.push(assistantMessage);
      session.updatedAt = new Date();

      this.sessionCache.set(sessionId, session);
      await this.sqliteStore.storeChatMessage(assistantMessage);
      await this.sqliteStore.updateChatSession(sessionId, session);

      this.logger.info(`Processed message in session ${sessionId}`);
      return assistantMessage;
    });
  }

  async streamResponse(
    sessionId: string,
    content: string,
    onChunk: (chunk: string) => void
  ): Promise<ChatMessage> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const cachedSession = this.sessionCache.get(sessionId);
      const session = cachedSession || (await this.sqliteStore.getChatSession(sessionId));

      if (!session) {
        throw new ChatSessionNotFoundError(sessionId);
      }

      const userMessage: ChatMessage = {
        id: uuidv4(),
        sessionId,
        role: ChatRole.USER,
        content,
        timestamp: new Date()
      };

      session.messages.push(userMessage);
      await this.sqliteStore.storeChatMessage(userMessage);

      const agent = await this.agentManager.getAgent(session.agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${session.agentId}`);
      }

      const systemMessage = this.buildSystemMessage(agent);
      const conversationHistory = this.buildConversationHistory(session.messages);

      const response = await this.modelRouter.streamRoute(
        session.agentId,
        agent.modelConfig,
        conversationHistory,
        { systemMessage, onChunk }
      );

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        sessionId,
        role: ChatRole.ASSISTANT,
        content: response,
        timestamp: new Date()
      };

      session.messages.push(assistantMessage);
      session.updatedAt = new Date();

      this.sessionCache.set(sessionId, session);
      await this.sqliteStore.storeChatMessage(assistantMessage);
      await this.sqliteStore.updateChatSession(sessionId, session);

      this.logger.info(`Streamed response in session ${sessionId}`);
      return assistantMessage;
    });
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const cachedSession = this.sessionCache.get(sessionId);
      const session = cachedSession || (await this.sqliteStore.getChatSession(sessionId));

      if (!session) {
        throw new ChatSessionNotFoundError(sessionId);
      }

      return session.messages;
    });
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      // Check cache first
      const cachedSession = this.sessionCache.get(sessionId);
      if (cachedSession) {
        return cachedSession;
      }

      // Load from database if not in cache
      const session = await this.sqliteStore.getChatSession(sessionId);
      if (session) {
        // Load messages for this session
        session.messages = await this.sqliteStore.getChatMessages(sessionId);
        this.sessionCache.set(sessionId, session);
        return session;
      }
      return null;
    });
  }

  async listSessions(agentId?: string): Promise<ChatSession[]> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const allSessions = await this.sqliteStore.getAllChatSessions();

      // Update cache incrementally
      for (const session of allSessions) {
        this.sessionCache.set(session.id, session);
      }

      let sessions = allSessions;

      if (agentId) {
        if (!agentId.trim()) {
          throw new InvalidSessionConfigError('agentId cannot be empty');
        }
        sessions = sessions.filter(s => s.agentId === agentId);
      }

      return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const cachedSession = this.sessionCache.get(sessionId);
      const session = cachedSession || (await this.sqliteStore.getChatSession(sessionId));

      if (!session) {
        throw new ChatSessionNotFoundError(sessionId);
      }

      this.sessionCache.delete(sessionId);
      await this.sqliteStore.deleteChatSession(sessionId);

      this.logger.info(`Deleted chat session: ${sessionId}`);
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.sessionCache.size(),
      maxSize: this.maxCacheSize
    };
  }

  /**
   * Clear the session cache
   */
  clearCache(): void {
    this.sessionCache.clear();
    this.logger.info('Chat session cache cleared');
  }

  /**
   * Get concurrent operations count
   */
  getConcurrentOpsCount(): number {
    return this.concurrentOps;
  }

  private buildSystemMessage(agent: { name: string; capabilities: string[] }): string {
    return `You are ${agent.name}, an AI agent with the following capabilities: ${agent.capabilities.join(', ')}.
You are part of a multi-agent system and can help with various tasks.
Be helpful, concise, and accurate in your responses.`;
  }

  private buildConversationHistory(messages: ChatMessage[]): string {
    // Limit to last 20 messages to avoid token limits and performance issues
    const recentMessages = messages.slice(-20);
    return recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }

}
