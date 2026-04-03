import { TaskStatus, TaskPriority } from '../models/types';

export interface TaskResult {
  output?: string;
  data?: Record<string, unknown>;
  artifacts?: string[];
}

export interface TaskMetadata {
  parentTaskId?: string;
  tags?: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  retryCount?: number;
  maxRetries?: number;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  agentId: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TaskResult;
  error?: string;
  parentTaskId?: string;
  subtasks: string[];
  metadata?: TaskMetadata;
}

export interface TaskFilters {
  agentId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export interface TaskConfig {
  agentId: string;
  description: string;
  priority?: TaskPriority;
  parentTaskId?: string;
  metadata?: TaskMetadata;
}
