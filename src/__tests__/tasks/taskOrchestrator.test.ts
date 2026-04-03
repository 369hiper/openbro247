/**
 * Unit tests for TaskOrchestrator error classes
 */
import { TaskNotFoundError, InvalidTaskConfigError } from '../../tasks/taskOrchestrator';

describe('TaskOrchestrator Error Classes', () => {
  describe('TaskNotFoundError', () => {
    it('should create error with correct message', () => {
      const error = new TaskNotFoundError('task-123');
      
      expect(error.message).toBe('Task not found: task-123');
      expect(error.name).toBe('TaskNotFoundError');
    });

    it('should be instanceof Error', () => {
      const error = new TaskNotFoundError('task-123');
      
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('InvalidTaskConfigError', () => {
    it('should create error with custom message', () => {
      const error = new InvalidTaskConfigError('agentId is required');
      
      expect(error.message).toBe('Invalid task configuration: agentId is required');
      expect(error.name).toBe('InvalidTaskConfigError');
    });

    it('should handle various validation messages', () => {
      const messages = [
        'description is required',
        'priority must be one of: critical, high, medium, low',
        'status must be one of: pending, in_progress, completed, failed'
      ];

      messages.forEach(msg => {
        const error = new InvalidTaskConfigError(msg);
        expect(error.message).toBe(`Invalid task configuration: ${msg}`);
      });
    });
  });
});

describe('Task Configuration Validation (Integration)', () => {
  // Mock types for validation testing
  type TaskConfig = {
    agentId?: string;
    description?: string;
    priority?: string;
    parentTaskId?: string;
    metadata?: Record<string, unknown>;
  };

  type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

  // Validation functions extracted for testing
  function validateTaskConfig(config: TaskConfig): void {
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

  function validateTaskStatus(status: TaskStatus): void {
    const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      throw new InvalidTaskConfigError(
        `status must be one of: ${validStatuses.join(', ')}`
      );
    }
  }

  describe('validateTaskConfig', () => {
    it('should pass valid configuration', () => {
      const config: TaskConfig = {
        agentId: 'agent-1',
        description: 'Test task',
        priority: 'high'
      };

      expect(() => validateTaskConfig(config)).not.toThrow();
    });

    it('should reject empty agentId', () => {
      const config: TaskConfig = {
        agentId: '',
        description: 'Test task'
      };

      expect(() => validateTaskConfig(config)).toThrow('agentId is required');
    });

    it('should reject empty description', () => {
      const config: TaskConfig = {
        agentId: 'agent-1',
        description: ''
      };

      expect(() => validateTaskConfig(config)).toThrow('description is required');
    });

    it('should reject invalid priority', () => {
      const config: TaskConfig = {
        agentId: 'agent-1',
        description: 'Test task',
        priority: 'invalid'
      };

      expect(() => validateTaskConfig(config)).toThrow('priority must be one of');
    });

    it('should allow missing optional fields', () => {
      const config: TaskConfig = {
        agentId: 'agent-1',
        description: 'Test task'
      };

      expect(() => validateTaskConfig(config)).not.toThrow();
    });
  });

  describe('validateTaskStatus', () => {
    it('should pass valid statuses', () => {
      const statuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'failed'];
      
      statuses.forEach(status => {
        expect(() => validateTaskStatus(status)).not.toThrow();
      });
    });

    it('should reject invalid status', () => {
      expect(() => validateTaskStatus('invalid' as TaskStatus)).toThrow('status must be one of');
    });
  });
});
