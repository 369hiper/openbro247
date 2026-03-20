import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { SQLiteStore } from '../memory/sqliteStore';
import { Task, TaskConfig, TaskFilters } from './types';

// Custom error types
class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}

class InvalidTaskConfigError extends Error {
  constructor(message: string) {
    super(`Invalid task configuration: ${message}`);
    this.name = 'InvalidTaskConfigError';
  }
}

// LRU Cache implementation
class LRUCache<T extends { id: string }> {
  private cache: Map<string, T> = new Map();
  private accessOrder: string[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  set(key: string, value: T): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
    this.cache.set(key, value);

    if (this.cache.size > this.maxSize) {
      const lruKey = this.accessOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);
    }
    return value;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }
}

export class TaskOrchestrator {
  private taskCache: LRUCache<Task>;
  private sqliteStore: SQLiteStore;
  private logger: Logger;
  private initialized: boolean = false;
  private concurrentOps: number = 0;
  private readonly maxCacheSize: number = 1000;

  constructor(sqliteStore: SQLiteStore) {
    this.sqliteStore = sqliteStore;
    this.logger = new Logger('TaskOrchestrator');
    this.taskCache = new LRUCache(this.maxCacheSize);
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.logger.info(
      `TaskOrchestrator initialized (lazy loading enabled, cache size: ${this.maxCacheSize})`
    );
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('TaskOrchestrator not initialized. Call initialize() first.');
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

  private validateTaskConfig(config: TaskConfig): void {
    if (!config.agentId || config.agentId.trim().length === 0) {
      throw new InvalidTaskConfigError('agentId is required');
    }
    if (!config.description || config.description.trim().length === 0) {
      throw new InvalidTaskConfigError('description is required');
    }
    if (config.priority && !['critical', 'high', 'medium', 'low'].includes(config.priority)) {
      throw new InvalidTaskConfigError(
        'priority must be one of: critical, high, medium, low'
      );
    }
  }

  private validateTaskStatus(status: Task['status']): void {
    const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new InvalidTaskConfigError(
        `status must be one of: ${validStatuses.join(', ')}`
      );
    }
  }

  async createTask(config: TaskConfig): Promise<Task> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();
      this.validateTaskConfig(config);

      const task: Task = {
        id: uuidv4(),
        agentId: config.agentId,
        description: config.description,
        status: 'pending',
        priority: config.priority || 'medium',
        createdAt: new Date(),
        parentTaskId: config.parentTaskId,
        subtasks: [],
        metadata: config.metadata
      };

      this.taskCache.set(task.id, task);
      await this.sqliteStore.storeTask(task);

      this.logger.info(`Created task: ${task.id} for agent ${config.agentId}`);
      return task;
    });
  }

  async updateTaskStatus(
    taskId: string,
    status: Task['status'],
    result?: any,
    error?: string
  ): Promise<Task> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();
      this.validateTaskStatus(status);

      const cachedTask = this.taskCache.get(taskId);
      const task = cachedTask || (await this.sqliteStore.getTask(taskId));

      if (!task) {
        throw new TaskNotFoundError(taskId);
      }

      task.status = status;

      if (status === 'in_progress' && !task.startedAt) {
        task.startedAt = new Date();
      }

      if (status === 'completed' || status === 'failed') {
        task.completedAt = new Date();
      }

      if (result !== undefined) {
        task.result = result;
      }

      if (error) {
        task.error = error;
      }

      this.taskCache.set(taskId, task);
      await this.sqliteStore.updateTask(taskId, task);

      this.logger.info(`Updated task ${taskId} status to ${status}`);
      return task;
    });
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const cachedTask = this.taskCache.get(taskId);
      if (cachedTask) {
        return cachedTask;
      }

      const task = await this.sqliteStore.getTask(taskId);
      if (task) {
        this.taskCache.set(taskId, task);
      }
      return task;
    });
  }

  async listTasks(filters?: TaskFilters): Promise<Task[]> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      let tasks = await this.sqliteStore.getAllTasks();

      // Update cache incrementally
      for (const task of tasks) {
        this.taskCache.set(task.id, task);
      }

      if (filters) {
        if (filters.agentId) {
          tasks = tasks.filter(t => t.agentId === filters.agentId);
        }
        if (filters.status) {
          tasks = tasks.filter(t => t.status === filters.status);
        }
        if (filters.priority) {
          tasks = tasks.filter(t => t.priority === filters.priority);
        }
      }

      return tasks.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    });
  }

  async assignTaskToAgent(taskId: string, agentId: string): Promise<Task> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      if (!agentId || agentId.trim().length === 0) {
        throw new InvalidTaskConfigError('agentId is required');
      }

      const cachedTask = this.taskCache.get(taskId);
      const task = cachedTask || (await this.sqliteStore.getTask(taskId));

      if (!task) {
        throw new TaskNotFoundError(taskId);
      }

      task.agentId = agentId;
      this.taskCache.set(taskId, task);
      await this.sqliteStore.updateTask(taskId, task);

      this.logger.info(`Assigned task ${taskId} to agent ${agentId}`);
      return task;
    });
  }

  async createSubtask(
    parentTaskId: string,
    description: string,
    agentId?: string
  ): Promise<Task> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const cachedParent = this.taskCache.get(parentTaskId);
      const parentTask =
        cachedParent || (await this.sqliteStore.getTask(parentTaskId));

      if (!parentTask) {
        throw new TaskNotFoundError(parentTaskId);
      }

      const subtask = await this.createTask({
        agentId: agentId || parentTask.agentId,
        description,
        priority: parentTask.priority,
        parentTaskId,
        metadata: { parentTaskId }
      });

      parentTask.subtasks.push(subtask.id);
      this.taskCache.set(parentTaskId, parentTask);
      await this.sqliteStore.updateTask(parentTaskId, parentTask);

      this.logger.info(
        `Created subtask ${subtask.id} for parent task ${parentTaskId}`
      );
      return subtask;
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    return this.withConcurrencyControl(async () => {
      this.ensureInitialized();

      const cachedTask = this.taskCache.get(taskId);
      const task = cachedTask || (await this.sqliteStore.getTask(taskId));

      if (!task) {
        throw new TaskNotFoundError(taskId);
      }

      // Recursively delete subtasks
      for (const subtaskId of task.subtasks) {
        await this.deleteTask(subtaskId);
      }

      this.taskCache.delete(taskId);
      await this.sqliteStore.deleteTask(taskId);

      this.logger.info(`Deleted task: ${taskId}`);
    });
  }

  async getTasksByAgent(agentId: string): Promise<Task[]> {
    return this.listTasks({ agentId });
  }

  async getPendingTasks(): Promise<Task[]> {
    return this.listTasks({ status: 'pending' });
  }

  async getInProgressTasks(): Promise<Task[]> {
    return this.listTasks({ status: 'in_progress' });
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.taskCache.size(),
      maxSize: this.maxCacheSize
    };
  }

  /**
   * Clear the task cache
   */
  clearCache(): void {
    this.taskCache.clear();
    this.logger.info('Task cache cleared');
  }

  /**
   * Get concurrent operations count
   */
  getConcurrentOpsCount(): number {
    return this.concurrentOps;
  }
}
