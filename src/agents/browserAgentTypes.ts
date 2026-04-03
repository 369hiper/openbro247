/**
 * Browser Agent Types
 * Types for the browser-use based multi-agent system
 */

import { BrowserProfile, BrowserSession } from 'browser-use';

/**
 * Supported LLM Providers
 */
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'openrouter';

/**
 * Browser Agent Configuration
 */
export interface BrowserAgentConfig {
  /** Unique identifier */
  id: string;
  /** Agent name */
  name: string;
  /** Agent role in hierarchy */
  role: 'master' | 'sub' | 'slave';
  /** Parent agent ID */
  parentId?: string;
  /** LLM Provider */
  llmProvider: LLMProvider;
  /** Model name */
  model: string;
  /** API Key (optional, can use env vars) */
  apiKey?: string;
  /** Base URL for Ollama/LMStudio */
  baseUrl?: string;
  /** Agent capabilities */
  capabilities: string[];
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;
  /** Browser profile ID */
  browserProfileId?: string;
  /** Use vision for screenshots */
  useVision?: boolean;
  /** Maximum actions per step */
  maxActionsPerStep?: number;
  /** Maximum failures before stopping */
  maxFailures?: number;
  /** Generate GIF recording */
  generateGif?: string;
  /** Use thinking mode */
  useThinking?: boolean;
  /** Step timeout in seconds */
  stepTimeout?: number;
  /** LLM timeout in seconds */
  llmTimeout?: number;
}

/**
 * Browser Profile Configuration
 */
export interface BrowserProfileConfig {
  /** Headless mode */
  headless?: boolean;
  /** Viewport width */
  viewportWidth?: number;
  /** Viewport height */
  viewportHeight?: number;
  /** User data directory for persistent sessions */
  userDataDir?: string;
  /** Allowed domains */
  allowedDomains?: string[];
  /** Highlight elements */
  highlightElements?: boolean;
  /** Proxy server */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  /** Extra browser arguments */
  extraBrowserArgs?: string[];
}

/**
 * Task Status
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/**
 * Task Priority
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Task Definition
 */
export interface Task {
  /** Unique identifier */
  id: string;
  /** Task description */
  description: string;
  /** Task goal */
  goal?: string;
  /** Task objective */
  objective?: string;
  /** Priority */
  priority: TaskPriority;
  /** Assigned agent ID */
  assignedTo?: string;
  /** Status */
  status: TaskStatus;
  /** Subtasks */
  subtasks?: Task[];
  /** Task dependencies */
  dependencies?: string[];
  /** Result */
  result?: any;
  /** Error message */
  error?: string;
  /** Created timestamp */
  createdAt: Date;
  /** Started timestamp */
  startedAt?: Date;
  /** Completed timestamp */
  completedAt?: Date;
}

/**
 * Agent Hierarchy Configuration
 */
export interface AgentHierarchy {
  /** Master agent configuration */
  master: BrowserAgentConfig;
  /** Sub-agents */
  subAgents: BrowserAgentConfig[];
  /** Slave agents */
  slaves: BrowserAgentConfig[];
}

/**
 * Agent Instance
 */
export interface AgentInstance {
  /** Configuration */
  config: BrowserAgentConfig;
  /** Status */
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  /** Current task */
  currentTask?: Task;
  /** Browser session */
  session?: BrowserSession;
  /** Created timestamp */
  createdAt: Date;
  /** Last active timestamp */
  lastActiveAt: Date;
}

/**
 * Agent Result
 */
export interface AgentResult {
  success: boolean;
  finalResult?: any;
  duration?: number;
  tokens?: number;
  steps?: number;
  error?: string;
  history?: any;
}

/**
 * Agent Event Types
 */
export interface AgentEvent {
  type: 'step' | 'done' | 'error' | 'pause' | 'resume' | 'stop';
  agentId: string;
  timestamp: Date;
  data?: any;
}

/**
 * LLM Provider Options
 */
export interface LLMProviderOptions {
  /** Provider type */
  provider: LLMProvider;
  /** Model name */
  model: string;
  /** API Key */
  apiKey?: string;
  /** Base URL */
  baseUrl?: string;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
}

/**
 * Default configurations for each provider
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<LLMProvider, { defaultModel: string; baseUrl?: string }> = {
  openai: {
    defaultModel: 'gpt-4o',
  },
  anthropic: {
    defaultModel: 'claude-sonnet-4-20250514',
  },
  ollama: {
    defaultModel: 'llama3',
    baseUrl: 'http://localhost:11434/v1',
  },
  lmstudio: {
    defaultModel: 'local-model',
    baseUrl: 'http://localhost:1234/v1',
  },
  openrouter: {
    defaultModel: 'openai/gpt-4o',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
};
