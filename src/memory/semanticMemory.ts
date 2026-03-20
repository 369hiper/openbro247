import { VectorStore, MemoryItem, SkillItem, ConversationItem } from './vectorStore';
import { SQLiteStore, MemoryRecord, SkillRecord, ActionRecord, HeartbeatRecord, AgentTaskRecord, ResearchReportRecord } from './sqliteStore';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface SemanticMemoryOptions {
  vectorPath: string;
  sqlitePath: string;
}

export class SemanticMemory {
  private vectorStore: VectorStore;
  private sqliteStore: SQLiteStore;
  private logger: Logger;

  constructor(options: SemanticMemoryOptions) {
    this.vectorStore = new VectorStore({
      vectorPath: options.vectorPath
    });
    this.sqliteStore = new SQLiteStore({
      dbPath: options.sqlitePath
    });
    this.logger = new Logger('SemanticMemory');
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing semantic memory...');
      await this.vectorStore.initialize();
      await this.sqliteStore.initialize();
      this.logger.info('Semantic memory initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize semantic memory', error);
      throw error;
    }
  }

  async storeMemory(
    content: string,
    memoryType: string,
    metadata?: Record<string, any>,
    importance: number = 0.5
  ): Promise<string> {
    try {
      const memoryId = uuidv4();

      // Store in vector database
      await this.vectorStore.storeMemory(content, {
        memory_type: memoryType,
        importance,
        ...(metadata || {})
      }, memoryId);

      // Store in SQLite
      await this.sqliteStore.storeMemory(
        memoryId,
        content,
        memoryType,
        metadata,
        importance
      );

      this.logger.info(`Stored memory: ${memoryId} (${memoryType})`);
      return memoryId;
    } catch (error) {
      this.logger.error('Error storing memory', error);
      throw error;
    }
  }

  // MCP-compatible methods
  async store(content: string, type: string, options: {
    tags?: string[];
    metadata?: Record<string, any>;
    timestamp?: number;
  } = {}): Promise<string> {
    return this.storeMemory(content, type, {
      tags: options.tags,
      timestamp: options.timestamp || Date.now(),
      ...options.metadata
    });
  }

  async search(query: string, options: {
    type?: string;
    limit?: number;
    tags?: string[];
  } = {}): Promise<MemoryItem[]> {
    return this.recall(query, options.limit || 10, options.type);
  }

  async recall(
    query: string,
    limit: number = 5,
    memoryType?: string
  ): Promise<MemoryItem[]> {
    try {
      // Search vector store
      const filters = memoryType ? { memory_type: memoryType } : undefined;
      const vectorResults = await this.vectorStore.searchMemories(query, limit, filters);

      // Enrich with SQLite data
      const enrichedResults: MemoryItem[] = [];
      for (const result of vectorResults) {
        const sqliteData = await this.sqliteStore.getMemory(result.id);

        if (sqliteData) {
          enrichedResults.push({
            ...result,
            metadata: {
              ...result.metadata,
              access_count: sqliteData.access_count,
              importance: sqliteData.importance,
              created_at: sqliteData.created_at
            }
          });
        } else {
          enrichedResults.push(result);
        }
      }

      this.logger.info(`Recalled ${enrichedResults.length} memories for query`);
      return enrichedResults;
    } catch (error) {
      this.logger.error('Error recalling memories', error);
      return [];
    }
  }

  async getMemory(memoryId: string): Promise<MemoryItem | null> {
    try {
      // Get from vector store
      const vectorData = await this.vectorStore.getMemory(memoryId);

      // Get from SQLite
      const sqliteData = await this.sqliteStore.getMemory(memoryId);

      if (vectorData && sqliteData) {
        return {
          ...vectorData,
          metadata: {
            ...vectorData.metadata,
            access_count: sqliteData.access_count,
            importance: sqliteData.importance,
            created_at: sqliteData.created_at,
            updated_at: sqliteData.updated_at
          }
        };
      } else if (vectorData) {
        return vectorData;
      } else if (sqliteData) {
        return {
          id: sqliteData.id,
          content: sqliteData.content,
          metadata: sqliteData.metadata
        };
      }

      return null;
    } catch (error) {
      this.logger.error('Error getting memory', error);
      return null;
    }
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      // Delete from vector store
      await this.vectorStore.deleteMemory(memoryId);

      // Note: SQLite doesn't have a delete method in our implementation
      // In production, you'd want to add one

      this.logger.info(`Deleted memory: ${memoryId}`);
      return true;
    } catch (error) {
      this.logger.error('Error deleting memory', error);
      return false;
    }
  }

  async storeSkill(
    name: string,
    description: string,
    content: string,
    skillType: string,
    confidence: number = 0.5,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const skillId = uuidv4();

      // Store in vector database
      await this.vectorStore.storeSkill(
        `${name}: ${description}\n${content}`,
        {
          skill_type: skillType,
          confidence,
          ...(metadata || {})
        },
        skillId
      );

      // Store in SQLite
      await this.sqliteStore.storeSkill(
        skillId,
        name,
        description,
        content,
        skillType,
        confidence,
        metadata
      );

      this.logger.info(`Stored skill: ${skillId} (${name})`);
      return skillId;
    } catch (error) {
      this.logger.error('Error storing skill', error);
      throw error;
    }
  }

  async searchSkills(
    query: string,
    limit: number = 5
  ): Promise<SkillItem[]> {
    try {
      // Search vector store
      const vectorResults = await this.vectorStore.searchSkills(query, limit);

      // Enrich with SQLite data
      const enrichedResults: SkillItem[] = [];
      for (const result of vectorResults) {
        const sqliteData = await this.sqliteStore.getSkill(result.id);

        if (sqliteData) {
          enrichedResults.push({
            ...result,
            metadata: {
              ...result.metadata,
              name: sqliteData.name,
              description: sqliteData.description,
              usage_count: sqliteData.usage_count,
              success_rate: sqliteData.success_rate
            }
          });
        } else {
          enrichedResults.push(result);
        }
      }

      this.logger.info(`Found ${enrichedResults.length} skills for query`);
      return enrichedResults;
    } catch (error) {
      this.logger.error('Error searching skills', error);
      return [];
    }
  }

  async updateSkillUsage(skillId: string, success: boolean): Promise<void> {
    await this.sqliteStore.updateSkillUsage(skillId, success);
  }

  async storeConversation(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const conversationId = uuidv4();

      // Store in vector database
      await this.vectorStore.storeConversation(content, {
        session_id: sessionId,
        role,
        ...(metadata || {})
      }, conversationId);

      this.logger.info(`Stored conversation: ${conversationId}`);
      return conversationId;
    } catch (error) {
      this.logger.error('Error storing conversation', error);
      throw error;
    }
  }

  async searchConversations(
    query: string,
    limit: number = 5
  ): Promise<ConversationItem[]> {
    return this.vectorStore.searchConversations(query, limit);
  }

  async storeAction(
    actionType: string,
    target: string | null,
    parameters: Record<string, any>,
    result: string,
    success: boolean,
    durationMs: number,
    metadata?: Record<string, any>
  ): Promise<string> {
    const actionId = uuidv4();

    await this.sqliteStore.storeAction(
      actionId,
      actionType,
      target,
      parameters,
      result,
      success,
      durationMs,
      metadata
    );

    return actionId;
  }

  async storeHeartbeat(
    heartbeatType: string,
    status: string,
    data?: Record<string, any>
  ): Promise<string> {
    const heartbeatId = uuidv4();

    await this.sqliteStore.storeHeartbeat(
      heartbeatId,
      heartbeatType,
      status,
      data
    );

    return heartbeatId;
  }

  async storeAgentTask(
    agentType: string,
    taskDescription: string,
    status: string,
    parentTaskId?: string,
    result?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const taskId = uuidv4();

    await this.sqliteStore.storeAgentTask(
      taskId,
      agentType,
      taskDescription,
      status,
      parentTaskId,
      result,
      metadata
    );

    return taskId;
  }

  async storeResearchReport(
    topic: string,
    content: string,
    sources?: string[],
    metadata?: Record<string, any>
  ): Promise<string> {
    const reportId = uuidv4();

    await this.sqliteStore.storeResearchReport(
      reportId,
      topic,
      content,
      sources,
      metadata
    );

    return reportId;
  }

  async getStats(): Promise<Record<string, any>> {
    try {
      const vectorStats = await this.vectorStore.getCollectionStats();
      const sqliteStats = await this.sqliteStore.getStats();

      return {
        vector: vectorStats,
        sqlite: sqliteStats
      };
    } catch (error) {
      this.logger.error('Error getting stats', error);
      return { vector: {}, sqlite: {} };
    }
  }

  /**
   * Get the underlying SQLiteStore instance
   */
  getSqliteStore(): SQLiteStore {
    return this.sqliteStore;
  }

  close(): void {
    this.sqliteStore.close();
  }
}