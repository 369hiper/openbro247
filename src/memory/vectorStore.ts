import { ChromaClient, Collection } from 'chromadb';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface MemoryItem {
  id: string;
  content: string;
  metadata: Record<string, any>;
  distance?: number;
}

export interface SkillItem {
  id: string;
  content: string;
  metadata: Record<string, any>;
  distance?: number;
}

export interface ConversationItem {
  id: string;
  content: string;
  metadata: Record<string, any>;
  distance?: number;
}

export interface VectorStoreOptions {
  vectorPath: string;
  anonymizedTelemetry?: boolean;
  allowReset?: boolean;
}

export class VectorStore {
  private client: ChromaClient | null = null;
  private memoriesCollection: Collection | null = null;
  private skillsCollection: Collection | null = null;
  private conversationsCollection: Collection | null = null;
  private options: VectorStoreOptions;
  private logger: Logger;

  constructor(options: VectorStoreOptions) {
    this.options = {
      anonymizedTelemetry: false,
      allowReset: true,
      ...options
    };
    this.logger = new Logger('VectorStore');
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing vector store (mock implementation for testing)...');

      // For now, use in-memory storage to avoid ChromaDB setup issues
      // TODO: Properly configure ChromaDB with embeddings
      this.logger.warn('Using mock vector store - no persistence or search capabilities');

      // Mock collections as simple arrays
      this.memoriesCollection = {
        add: async () => {},
        query: async () => ({ ids: [], documents: [], metadatas: [], distances: [] }),
        get: async () => ({ ids: [], documents: [], metadatas: [] }),
        delete: async () => {},
        count: async () => 0
      } as any;

      this.skillsCollection = {
        add: async () => {},
        query: async () => ({ ids: [], documents: [], metadatas: [], distances: [] }),
        count: async () => 0
      } as any;

      this.conversationsCollection = {
        add: async () => {},
        query: async () => ({ ids: [], documents: [], metadatas: [], distances: [] }),
        count: async () => 0
      } as any;

      this.logger.info('Mock vector store initialized');
    } catch (error) {
      this.logger.error('Failed to initialize vector store', error);
      throw error;
    }
  }

  async storeMemory(
    content: string,
    metadata: Record<string, any>,
    memoryId?: string
  ): Promise<string> {
    try {
      if (!this.memoriesCollection) {
        throw new Error('Vector store not initialized');
      }

      const id = memoryId || uuidv4();
      
      await this.memoriesCollection.add({
        ids: [id],
        documents: [content],
        metadatas: [metadata]
      });

      this.logger.info(`Stored memory: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Error storing memory', error);
      throw error;
    }
  }

  async searchMemories(
    query: string,
    limit: number = 5,
    filters?: Record<string, any>
  ): Promise<MemoryItem[]> {
    try {
      if (!this.memoriesCollection) {
        throw new Error('Vector store not initialized');
      }

      const results = await this.memoriesCollection.query({
        queryTexts: [query],
        nResults: limit,
        where: filters
      });

      const memories: MemoryItem[] = [];
      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          memories.push({
            id: results.ids[0][i],
            content: results.documents[0][i] ?? '',
            metadata: results.metadatas?.[0][i] || {},
            distance: results.distances?.[0][i] || undefined
          });
        }
      }

      this.logger.info(`Found ${memories.length} memories for query`);
      return memories;
    } catch (error) {
      this.logger.error('Error searching memories', error);
      return [];
    }
  }

  async getMemory(memoryId: string): Promise<MemoryItem | null> {
    try {
      if (!this.memoriesCollection) {
        throw new Error('Vector store not initialized');
      }

      const results = await this.memoriesCollection.get({
        ids: [memoryId]
      });

      if (results.ids && results.ids.length > 0) {
        return {
          id: results.ids[0],
          content: results.documents[0] ?? '',
          metadata: results.metadatas?.[0] || {}
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
      if (!this.memoriesCollection) {
        throw new Error('Vector store not initialized');
      }

      await this.memoriesCollection.delete({
        ids: [memoryId]
      });

      this.logger.info(`Deleted memory: ${memoryId}`);
      return true;
    } catch (error) {
      this.logger.error('Error deleting memory', error);
      return false;
    }
  }

  async storeSkill(
    content: string,
    metadata: Record<string, any>,
    skillId?: string
  ): Promise<string> {
    try {
      if (!this.skillsCollection) {
        throw new Error('Vector store not initialized');
      }

      const id = skillId || uuidv4();
      
      await this.skillsCollection.add({
        ids: [id],
        documents: [content],
        metadatas: [metadata]
      });

      this.logger.info(`Stored skill: ${id}`);
      return id;
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
      if (!this.skillsCollection) {
        throw new Error('Vector store not initialized');
      }

      const results = await this.skillsCollection.query({
        queryTexts: [query],
        nResults: limit
      });

      const skills: SkillItem[] = [];
      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          skills.push({
            id: results.ids[0][i],
            content: results.documents[0][i] ?? '',
            metadata: results.metadatas?.[0][i] || {},
            distance: results.distances?.[0][i] || undefined
          });
        }
      }

      this.logger.info(`Found ${skills.length} skills for query`);
      return skills;
    } catch (error) {
      this.logger.error('Error searching skills', error);
      return [];
    }
  }

  async storeConversation(
    content: string,
    metadata: Record<string, any>,
    conversationId?: string
  ): Promise<string> {
    try {
      if (!this.conversationsCollection) {
        throw new Error('Vector store not initialized');
      }

      const id = conversationId || uuidv4();
      
      await this.conversationsCollection.add({
        ids: [id],
        documents: [content],
        metadatas: [metadata]
      });

      this.logger.info(`Stored conversation: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Error storing conversation', error);
      throw error;
    }
  }

  async searchConversations(
    query: string,
    limit: number = 5
  ): Promise<ConversationItem[]> {
    try {
      if (!this.conversationsCollection) {
        throw new Error('Vector store not initialized');
      }

      const results = await this.conversationsCollection.query({
        queryTexts: [query],
        nResults: limit
      });

      const conversations: ConversationItem[] = [];
      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          conversations.push({
            id: results.ids[0][i],
            content: results.documents[0][i] ?? '',
            metadata: results.metadatas?.[0][i] || {},
            distance: results.distances?.[0][i] || undefined
          });
        }
      }

      this.logger.info(`Found ${conversations.length} conversations for query`);
      return conversations;
    } catch (error) {
      this.logger.error('Error searching conversations', error);
      return [];
    }
  }

  async getCollectionStats(): Promise<Record<string, number>> {
    try {
      if (!this.memoriesCollection || !this.skillsCollection || !this.conversationsCollection) {
        throw new Error('Vector store not initialized');
      }

      const [memoriesCount, skillsCount, conversationsCount] = await Promise.all([
        this.memoriesCollection.count(),
        this.skillsCollection.count(),
        this.conversationsCollection.count()
      ]);

      return {
        memories: memoriesCount,
        skills: skillsCount,
        conversations: conversationsCount
      };
    } catch (error) {
      this.logger.error('Error getting collection stats', error);
      return { memories: 0, skills: 0, conversations: 0 };
    }
  }

  async reset(): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Vector store not initialized');
      }

      await this.client.reset();
      
      // Recreate collections
      this.memoriesCollection = await this.client.getOrCreateCollection({
        name: 'memories',
        metadata: { 'hnsw:space': 'cosine' }
      });

      this.skillsCollection = await this.client.getOrCreateCollection({
        name: 'skills',
        metadata: { 'hnsw:space': 'cosine' }
      });

      this.conversationsCollection = await this.client.getOrCreateCollection({
        name: 'conversations',
        metadata: { 'hnsw:space': 'cosine' }
      });

      this.logger.info('Vector store reset');
    } catch (error) {
      this.logger.error('Error resetting vector store', error);
      throw error;
    }
  }
}