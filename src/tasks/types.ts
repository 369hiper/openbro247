export interface Task {
  id: string;
  agentId: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  parentTaskId?: string;
  subtasks: string[];
  metadata?: Record<string, any>;
}

export interface TaskFilters {
  agentId?: string;
  status?: Task['status'];
  priority?: Task['priority'];
}

export interface TaskConfig {
  agentId: string;
  description: string;
  priority?: Task['priority'];
  parentTaskId?: string;
  metadata?: Record<string, any>;
}
