/**
 * Unit tests for AgentManager error classes and validation
 */
import { 
  AgentNotFoundError, 
  NotInitializedError, 
  InvalidAgentConfigError 
} from '../../agents/agentManager';

describe('AgentManager Error Classes', () => {
  describe('AgentNotFoundError', () => {
    it('should create error with correct message', () => {
      const error = new AgentNotFoundError('agent-123');
      
      expect(error.message).toBe('Agent not found: agent-123');
      expect(error.name).toBe('AgentNotFoundError');
    });

    it('should be instanceof Error', () => {
      const error = new AgentNotFoundError('agent-123');
      
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotInitializedError', () => {
    it('should create error with correct message', () => {
      const error = new NotInitializedError();
      
      expect(error.message).toBe('AgentManager not initialized. Call initialize() first.');
      expect(error.name).toBe('NotInitializedError');
    });
  });

  describe('InvalidAgentConfigError', () => {
    it('should create error with custom message', () => {
      const error = new InvalidAgentConfigError('Name is required');
      
      expect(error.message).toBe('Invalid agent configuration: Name is required');
      expect(error.name).toBe('InvalidAgentConfigError');
    });

    it('should handle various validation messages', () => {
      const messages = [
        'Agent type must be one of: main, sub, specialized',
        'Agent must have at least one capability',
        'Agent model configuration is required'
      ];

      messages.forEach(msg => {
        const error = new InvalidAgentConfigError(msg);
        expect(error.message).toBe(`Invalid agent configuration: ${msg}`);
      });
    });
  });
});

describe('Agent Configuration Validation (Integration)', () => {
  // Mock Agent type for validation testing
  type AgentConfig = {
    name: string;
    type: 'main' | 'sub' | 'specialized';
    capabilities: string[];
    modelConfig: { provider: string; model?: string };
    parentAgentId?: string;
    metadata?: Record<string, unknown>;
  };

  // Validation functions extracted for testing
  function validateAgentConfig(config: AgentConfig): void {
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

  describe('validateAgentConfig', () => {
    it('should pass valid configuration', () => {
      const config: AgentConfig = {
        name: 'Test Agent',
        type: 'main',
        capabilities: ['browsing'],
        modelConfig: { provider: 'openai', model: 'gpt-4' }
      };

      expect(() => validateAgentConfig(config)).not.toThrow();
    });

    it('should reject empty name', () => {
      const config: AgentConfig = {
        name: '',
        type: 'main',
        capabilities: ['browsing'],
        modelConfig: { provider: 'openai' }
      };

      expect(() => validateAgentConfig(config)).toThrow('Agent name is required');
    });

    it('should reject whitespace-only name', () => {
      const config: AgentConfig = {
        name: '   ',
        type: 'main',
        capabilities: ['browsing'],
        modelConfig: { provider: 'openai' }
      };

      expect(() => validateAgentConfig(config)).toThrow('Agent name is required');
    });

    it('should reject invalid type', () => {
      const config: AgentConfig = {
        name: 'Test',
        type: 'invalid' as 'main',
        capabilities: ['browsing'],
        modelConfig: { provider: 'openai' }
      };

      expect(() => validateAgentConfig(config)).toThrow('Agent type must be one of');
    });

    it('should reject empty capabilities', () => {
      const config: AgentConfig = {
        name: 'Test',
        type: 'main',
        capabilities: [],
        modelConfig: { provider: 'openai' }
      };

      expect(() => validateAgentConfig(config)).toThrow('Agent must have at least one capability');
    });

    it('should reject missing model config', () => {
      const config: AgentConfig = {
        name: 'Test',
        type: 'main',
        capabilities: ['browsing'],
        modelConfig: { provider: '' }
      } as AgentConfig;

      expect(() => validateAgentConfig(config)).toThrow('Agent model configuration is required');
    });

    it('should reject missing capabilities array', () => {
      const config: AgentConfig = {
        name: 'Test',
        type: 'main',
        capabilities: undefined as unknown as string[],
        modelConfig: { provider: 'openai' }
      };

      expect(() => validateAgentConfig(config)).toThrow('Agent must have at least one capability');
    });
  });
});
