export interface ModelConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  parameters: {
    temperature: number;
    maxTokens: number;
    topP?: number;
  };
}

export interface AgentConfig {
  name: string;
  type: 'main' | 'sub' | 'specialized';
  modelConfig: ModelConfig;
  capabilities: string[];
  parentAgentId?: string;
  metadata?: Record<string, any>;
}

export interface Agent {
  id: string;
  name: string;
  type: 'main' | 'sub' | 'specialized';
  status: 'active' | 'idle' | 'busy' | 'error';
  modelConfig: ModelConfig;
  capabilities: string[];
  parentAgentId?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface AgentFilters {
  type?: Agent['type'];
  status?: Agent['status'];
  parentAgentId?: string;
}
