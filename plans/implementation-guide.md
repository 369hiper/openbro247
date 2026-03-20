# OpenClaw Agent Management System - Implementation Guide

## Quick Start

This guide provides step-by-step instructions for implementing the agent management system.

## Phase 1: Backend Enhancements

### Step 1.1: Create Agent Manager Module

Create `src/agents/agentManager.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { SQLiteStore } from '../memory/sqliteStore';

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

export interface ModelConfig {
  provider: 'openrouter' | 'openai' | 'anthropic' | 'local';
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  parameters: {
    temperature: number;
    maxTokens: number;
    topP?: number;
  };
}

export class AgentManager {
  private agents: Map<string, Agent> = new Map();
  private sqliteStore: SQLiteStore;
  private logger: Logger;

  constructor(sqliteStore: SQLiteStore) {
    this.sqliteStore = sqliteStore;
    this.logger = new Logger('AgentManager');
  }

  async initialize(): Promise<void> {
    // Load existing agents from database
    await this.loadAgents();
    this.logger.info(`Loaded ${this.agents.size} agents`);
  }

  async createAgent(config: AgentConfig): Promise<Agent> {
    const agent: Agent = {
      id: uuidv4(),
      name: config.name,
      type: config.type,
      status: 'idle',
      modelConfig: config.modelConfig,
      capabilities: config.capabilities,
      parentAgentId: config.parentAgentId,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: config.metadata
    };

    // Store in memory
    this.agents.set(agent.id, agent);

    // Store in database
    await this.sqliteStore.storeAgent(agent);

    this.logger.info(`Created agent: ${agent.id} (${agent.name})`);
    return agent;
  }

  async deleteAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Remove from memory
    this.agents.delete(agentId);

    // Remove from database
    await this.sqliteStore.deleteAgent(agentId);

    this.logger.info(`Deleted agent: ${agentId}`);
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.agents.get(agentId) || null;
  }

  async listAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const updatedAgent: Agent = {
      ...agent,
      ...updates,
      updatedAt: new Date()
    };

    // Update in memory
    this.agents.set(agentId, updatedAgent);

    // Update in database
    await this.sqliteStore.updateAgent(agentId, updatedAgent);

    this.logger.info(`Updated agent: ${agentId}`);
    return updatedAgent;
  }

  async updateAgentStatus(agentId: string, status: Agent['status']): Promise<void> {
    await this.updateAgent(agentId, { status });
  }

  async setAgentModel(agentId: string, modelConfig: ModelConfig): Promise<void> {
    await this.updateAgent(agentId, { modelConfig });
  }

  private async loadAgents(): Promise<void> {
    try {
      const agents = await this.sqliteStore.getAllAgents();
      for (const agent of agents) {
        this.agents.set(agent.id, agent);
      }
    } catch (error) {
      this.logger.error('Failed to load agents', error);
    }
  }
}
```

### Step 1.2: Create Model Router with OpenRouter Support

Create `src/models/modelRouter.ts`:

```typescript
import OpenAI from 'openai';
import { Logger } from '../utils/logger';
import { ModelConfig } from '../agents/agentManager';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextLength: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export class ModelRouter {
  private openrouterClient: OpenAI | null = null;
  private logger: Logger;
  private modelCache: Map<string, ModelInfo> = new Map();

  constructor() {
    this.logger = new Logger('ModelRouter');
  }

  async initialize(): Promise<void> {
    // Initialize OpenRouter client if API key is available
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (openrouterApiKey) {
      this.openrouterClient = new OpenAI({
        apiKey: openrouterApiKey,
        baseURL: 'https://openrouter.ai/api/v1'
      });
      this.logger.info('OpenRouter client initialized');
    }
  }

  async route(agentId: string, modelConfig: ModelConfig, prompt: string, options: {
    systemMessage?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}): Promise<string> {
    try {
      this.logger.info(`Routing request for agent ${agentId} to ${modelConfig.provider}/${modelConfig.modelId}`);

      let client: OpenAI;
      let baseUrl: string;

      switch (modelConfig.provider) {
        case 'openrouter':
          if (!this.openrouterClient) {
            throw new Error('OpenRouter client not initialized');
          }
          client = this.openrouterClient;
          baseUrl = 'https://openrouter.ai/api/v1';
          break;

        case 'openai':
          client = new OpenAI({
            apiKey: modelConfig.apiKey || process.env.OPENAI_API_KEY
          });
          baseUrl = 'https://api.openai.com/v1';
          break;

        case 'local':
          client = new OpenAI({
            apiKey: 'not-needed',
            baseURL: modelConfig.baseUrl || 'http://localhost:11434/v1'
          });
          baseUrl = modelConfig.baseUrl || 'http://localhost:11434/v1';
          break;

        default:
          throw new Error(`Unsupported provider: ${modelConfig.provider}`);
      }

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      if (options.systemMessage) {
        messages.push({ role: 'system', content: options.systemMessage });
      }

      messages.push({ role: 'user', content: prompt });

      const response = await client.chat.completions.create({
        model: modelConfig.modelId,
        messages,
        temperature: options.temperature ?? modelConfig.parameters.temperature,
        max_tokens: options.maxTokens ?? modelConfig.parameters.maxTokens
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      this.logger.error(`Error routing request for agent ${agentId}`, error);
      throw error;
    }
  }

  async streamRoute(agentId: string, modelConfig: ModelConfig, prompt: string, options: {
    systemMessage?: string;
    temperature?: number;
    maxTokens?: number;
    onChunk?: (chunk: string) => void;
  } = {}): Promise<string> {
    try {
      this.logger.info(`Streaming request for agent ${agentId} to ${modelConfig.provider}/${modelConfig.modelId}`);

      let client: OpenAI;

      switch (modelConfig.provider) {
        case 'openrouter':
          if (!this.openrouterClient) {
            throw new Error('OpenRouter client not initialized');
          }
          client = this.openrouterClient;
          break;

        case 'openai':
          client = new OpenAI({
            apiKey: modelConfig.apiKey || process.env.OPENAI_API_KEY
          });
          break;

        case 'local':
          client = new OpenAI({
            apiKey: 'not-needed',
            baseURL: modelConfig.baseUrl || 'http://localhost:11434/v1'
          });
          break;

        default:
          throw new Error(`Unsupported provider: ${modelConfig.provider}`);
      }

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      if (options.systemMessage) {
        messages.push({ role: 'system', content: options.systemMessage });
      }

      messages.push({ role: 'user', content: prompt });

      const stream = await client.chat.completions.create({
        model: modelConfig.modelId,
        messages,
        temperature: options.temperature ?? modelConfig.parameters.temperature,
        max_tokens: options.maxTokens ?? modelConfig.parameters.maxTokens,
        stream: true
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          options.onChunk?.(content);
        }
      }

      return fullContent;
    } catch (error) {
      this.logger.error(`Error streaming request for agent ${agentId}`, error);
      throw error;
    }
  }

  async listAvailableModels(): Promise<ModelInfo[]> {
    try {
      if (!this.openrouterClient) {
        return this.getFallbackModels();
      }

      const response = await fetch('https://openrouter.ai/api/v1/models');
      const data = await response.json();

      const models: ModelInfo[] = data.data.map((model: any) => ({
        id: model.id,
        name: model.name,
        provider: 'openrouter',
        description: model.description || '',
        contextLength: model.context_length || 4096,
        pricing: {
          prompt: model.pricing?.prompt || '0',
          completion: model.pricing?.completion || '0'
        }
      }));

      // Cache models
      for (const model of models) {
        this.modelCache.set(model.id, model);
      }

      return models;
    } catch (error) {
      this.logger.error('Error fetching models from OpenRouter', error);
      return this.getFallbackModels();
    }
  }

  async validateModel(modelConfig: ModelConfig): Promise<boolean> {
    try {
      const testPrompt = 'Hello, this is a test.';
      await this.route('validation', modelConfig, testPrompt, {
        maxTokens: 10
      });
      return true;
    } catch (error) {
      this.logger.error(`Model validation failed for ${modelConfig.modelId}`, error);
      return false;
    }
  }

  private getFallbackModels(): ModelInfo[] {
    return [
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        description: 'Most capable GPT-4 model',
        contextLength: 8192,
        pricing: { prompt: '0.03', completion: '0.06' }
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        description: 'Fast and efficient model',
        contextLength: 4096,
        pricing: { prompt: '0.0015', completion: '0.002' }
      },
      {
        id: 'anthropic/claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextLength: 200000,
        pricing: { prompt: '0.003', completion: '0.015' }
      }
    ];
  }
}
```

### Step 1.3: Create Task Orchestrator

Create `src/tasks/taskOrchestrator.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { SQLiteStore } from '../memory/sqliteStore';

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

export class TaskOrchestrator {
  private tasks: Map<string, Task> = new Map();
  private sqliteStore: SQLiteStore;
  private logger: Logger;

  constructor(sqliteStore: SQLiteStore) {
    this.sqliteStore = sqliteStore;
    this.logger = new Logger('TaskOrchestrator');
  }

  async initialize(): Promise<void> {
    await this.loadTasks();
    this.logger.info(`Loaded ${this.tasks.size} tasks`);
  }

  async createTask(agentId: string, description: string, priority: Task['priority'] = 'medium', metadata?: Record<string, any>): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      agentId,
      description,
      status: 'pending',
      priority,
      createdAt: new Date(),
      subtasks: [],
      metadata
    };

    this.tasks.set(task.id, task);
    await this.sqliteStore.storeTask(task);

    this.logger.info(`Created task: ${task.id} for agent ${agentId}`);
    return task;
  }

  async updateTaskStatus(taskId: string, status: Task['status'], result?: any, error?: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
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

    this.tasks.set(taskId, task);
    await this.sqliteStore.updateTask(taskId, task);

    this.logger.info(`Updated task ${taskId} status to ${status}`);
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  async listTasks(filters?: TaskFilters): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values());

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
  }

  async assignTaskToAgent(taskId: string, agentId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.agentId = agentId;
    this.tasks.set(taskId, task);
    await this.sqliteStore.updateTask(taskId, task);

    this.logger.info(`Assigned task ${taskId} to agent ${agentId}`);
  }

  async createSubtask(parentTaskId: string, description: string, agentId?: string): Promise<Task> {
    const parentTask = this.tasks.get(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task not found: ${parentTaskId}`);
    }

    const subtask = await this.createTask(
      agentId || parentTask.agentId,
      description,
      parentTask.priority,
      { parentTaskId }
    );

    parentTask.subtasks.push(subtask.id);
    this.tasks.set(parentTaskId, parentTask);
    await this.sqliteStore.updateTask(parentTaskId, parentTask);

    this.logger.info(`Created subtask ${subtask.id} for parent task ${parentTaskId}`);
    return subtask;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Delete all subtasks
    for (const subtaskId of task.subtasks) {
      await this.deleteTask(subtaskId);
    }

    this.tasks.delete(taskId);
    await this.sqliteStore.deleteTask(taskId);

    this.logger.info(`Deleted task: ${taskId}`);
  }

  private async loadTasks(): Promise<void> {
    try {
      const tasks = await this.sqliteStore.getAllTasks();
      for (const task of tasks) {
        this.tasks.set(task.id, task);
      }
    } catch (error) {
      this.logger.error('Failed to load tasks', error);
    }
  }
}
```

### Step 1.4: Create Chat Manager

Create `src/chat/chatManager.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { SQLiteStore } from '../memory/sqliteStore';
import { ModelRouter } from '../models/modelRouter';
import { AgentManager, ModelConfig } from '../agents/agentManager';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export class ChatManager {
  private sessions: Map<string, ChatSession> = new Map();
  private sqliteStore: SQLiteStore;
  private modelRouter: ModelRouter;
  private agentManager: AgentManager;
  private logger: Logger;

  constructor(
    sqliteStore: SQLiteStore,
    modelRouter: ModelRouter,
    agentManager: AgentManager
  ) {
    this.sqliteStore = sqliteStore;
    this.modelRouter = modelRouter;
    this.agentManager = agentManager;
    this.logger = new Logger('ChatManager');
  }

  async initialize(): Promise<void> {
    await this.loadSessions();
    this.logger.info(`Loaded ${this.sessions.size} chat sessions`);
  }

  async createSession(agentId: string, metadata?: Record<string, any>): Promise<ChatSession> {
    const session: ChatSession = {
      id: uuidv4(),
      agentId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata
    };

    this.sessions.set(session.id, session);
    await this.sqliteStore.storeChatSession(session);

    this.logger.info(`Created chat session: ${session.id} for agent ${agentId}`);
    return session;
  }

  async sendMessage(sessionId: string, content: string, metadata?: Record<string, any>): Promise<ChatMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content,
      timestamp: new Date(),
      metadata
    };

    session.messages.push(userMessage);
    await this.sqliteStore.storeChatMessage(userMessage);

    // Get agent and model config
    const agent = await this.agentManager.getAgent(session.agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${session.agentId}`);
    }

    // Generate response
    const systemMessage = this.buildSystemMessage(agent);
    const conversationHistory = this.buildConversationHistory(session.messages);

    const response = await this.modelRouter.route(
      session.agentId,
      agent.modelConfig,
      conversationHistory,
      { systemMessage }
    );

    // Create assistant message
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'assistant',
      content: response,
      timestamp: new Date()
    };

    session.messages.push(assistantMessage);
    session.updatedAt = new Date();

    await this.sqliteStore.storeChatMessage(assistantMessage);
    await this.sqliteStore.updateChatSession(sessionId, session);

    this.logger.info(`Processed message in session ${sessionId}`);
    return assistantMessage;
  }

  async streamResponse(sessionId: string, content: string, onChunk: (chunk: string) => void): Promise<ChatMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content,
      timestamp: new Date()
    };

    session.messages.push(userMessage);
    await this.sqliteStore.storeChatMessage(userMessage);

    // Get agent and model config
    const agent = await this.agentManager.getAgent(session.agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${session.agentId}`);
    }

    // Generate streaming response
    const systemMessage = this.buildSystemMessage(agent);
    const conversationHistory = this.buildConversationHistory(session.messages);

    const response = await this.modelRouter.streamRoute(
      session.agentId,
      agent.modelConfig,
      conversationHistory,
      { systemMessage, onChunk }
    );

    // Create assistant message
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'assistant',
      content: response,
      timestamp: new Date()
    };

    session.messages.push(assistantMessage);
    session.updatedAt = new Date();

    await this.sqliteStore.storeChatMessage(assistantMessage);
    await this.sqliteStore.updateChatSession(sessionId, session);

    this.logger.info(`Streamed response in session ${sessionId}`);
    return assistantMessage;
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return session.messages;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async listSessions(agentId?: string): Promise<ChatSession[]> {
    let sessions = Array.from(this.sessions.values());

    if (agentId) {
      sessions = sessions.filter(s => s.agentId === agentId);
    }

    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.sessions.delete(sessionId);
    await this.sqliteStore.deleteChatSession(sessionId);

    this.logger.info(`Deleted chat session: ${sessionId}`);
  }

  private buildSystemMessage(agent: any): string {
    return `You are ${agent.name}, an AI agent with the following capabilities: ${agent.capabilities.join(', ')}.
You are part of a multi-agent system and can help with various tasks.
Be helpful, concise, and accurate in your responses.`;
  }

  private buildConversationHistory(messages: ChatMessage[]): string {
    return messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  private async loadSessions(): Promise<void> {
    try {
      const sessions = await this.sqliteStore.getAllChatSessions();
      for (const session of sessions) {
        this.sessions.set(session.id, session);
      }
    } catch (error) {
      this.logger.error('Failed to load chat sessions', error);
    }
  }
}
```

### Step 1.5: Enhance API Server

Update `src/api/server.ts` to add new endpoints:

```typescript
// Add these imports at the top
import { AgentManager } from '../agents/agentManager';
import { TaskOrchestrator } from '../tasks/taskOrchestrator';
import { ChatManager } from '../chat/chatManager';
import { ModelRouter } from '../models/modelRouter';

// Add these to the APIServer class constructor
private agentManager: AgentManager;
private taskOrchestrator: TaskOrchestrator;
private chatManager: ChatManager;
private modelRouter: ModelRouter;

// Add these routes in setupRoutes()
// Agent routes
this.fastify.post('/api/agents', this.handleCreateAgent.bind(this));
this.fastify.get('/api/agents', this.handleListAgents.bind(this));
this.fastify.get('/api/agents/:id', this.handleGetAgent.bind(this));
this.fastify.put('/api/agents/:id', this.handleUpdateAgent.bind(this));
this.fastify.delete('/api/agents/:id', this.handleDeleteAgent.bind(this));
this.fastify.put('/api/agents/:id/model', this.handleSetAgentModel.bind(this));

// Task routes
this.fastify.post('/api/tasks', this.handleCreateTask.bind(this));
this.fastify.get('/api/tasks', this.handleListTasks.bind(this));
this.fastify.get('/api/tasks/:id', this.handleGetTask.bind(this));
this.fastify.put('/api/tasks/:id', this.handleUpdateTask.bind(this));
this.fastify.delete('/api/tasks/:id', this.handleDeleteTask.bind(this));
this.fastify.post('/api/tasks/:id/assign', this.handleAssignTask.bind(this));

// Model routes
this.fastify.get('/api/models', this.handleListModels.bind(this));
this.fastify.post('/api/models/validate', this.handleValidateModel.bind(this));

// Chat routes
this.fastify.post('/api/chat/sessions', this.handleCreateChatSession.bind(this));
this.fastify.get('/api/chat/sessions', this.handleListChatSessions.bind(this));
this.fastify.get('/api/chat/sessions/:id', this.handleGetChatSession.bind(this));
this.fastify.post('/api/chat/sessions/:id/messages', this.handleSendChatMessage.bind(this));
this.fastify.delete('/api/chat/sessions/:id', this.handleDeleteChatSession.bind(this));

// Add handler methods for each route
```

### Step 1.6: Add WebSocket Event System

Create `src/api/websocket/events.ts`:

```typescript
import { FastifyInstance } from 'fastify';

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
}

export class WebSocketEventManager {
  private fastify: FastifyInstance;
  private connections: Set<any> = new Set();

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  broadcast(event: WebSocketEvent): void {
    const message = JSON.stringify(event);
    for (const connection of this.connections) {
      try {
        connection.socket.send(message);
      } catch (error) {
        console.error('Error broadcasting to WebSocket', error);
      }
    }
  }

  addConnection(connection: any): void {
    this.connections.add(connection);
  }

  removeConnection(connection: any): void {
    this.connections.delete(connection);
  }
}
```

## Phase 2: Frontend Setup

### Step 2.1: Create Next.js Project

```bash
cd openbro247-typescript
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd frontend
```

### Step 2.2: Install Dependencies

```bash
npm install zustand @tanstack/react-query socket.io-client react-hook-form zod @hookform/resolvers
```

### Step 2.3: Configure Environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

### Step 2.4: Create API Client

Create `frontend/src/lib/api.ts`:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // Agents
  agents: {
    list: () => fetchApi('/api/agents'),
    get: (id: string) => fetchApi(`/api/agents/${id}`),
    create: (data: any) => fetchApi('/api/agents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/agents/${id}`, { method: 'DELETE' }),
    setModel: (id: string, modelConfig: any) => fetchApi(`/api/agents/${id}/model`, { method: 'PUT', body: JSON.stringify(modelConfig) }),
  },

  // Tasks
  tasks: {
    list: (filters?: any) => fetchApi(`/api/tasks${filters ? `?${new URLSearchParams(filters)}` : ''}`),
    get: (id: string) => fetchApi(`/api/tasks/${id}`),
    create: (data: any) => fetchApi('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/tasks/${id}`, { method: 'DELETE' }),
    assign: (id: string, agentId: string) => fetchApi(`/api/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
  },

  // Models
  models: {
    list: () => fetchApi('/api/models'),
    validate: (modelConfig: any) => fetchApi('/api/models/validate', { method: 'POST', body: JSON.stringify(modelConfig) }),
  },

  // Chat
  chat: {
    listSessions: (agentId?: string) => fetchApi(`/api/chat/sessions${agentId ? `?agentId=${agentId}` : ''}`),
    getSession: (id: string) => fetchApi(`/api/chat/sessions/${id}`),
    createSession: (agentId: string) => fetchApi('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ agentId }) }),
    sendMessage: (sessionId: string, content: string) => fetchApi(`/api/chat/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
    deleteSession: (id: string) => fetchApi(`/api/chat/sessions/${id}`, { method: 'DELETE' }),
  },
};
```

### Step 2.5: Create WebSocket Client

Create `frontend/src/lib/websocket.ts`:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io(WS_URL, {
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
    });

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const send = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (data: any) => void) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event: string, handler: (data: any) => void) => {
    socketRef.current?.off(event, handler);
  }, []);

  return { send, on, off };
}
```

### Step 2.6: Create State Management Store

Create `frontend/src/lib/stores/agentStore.ts`:

```typescript
import { create } from 'zustand';
import { api } from '../api';

interface Agent {
  id: string;
  name: string;
  type: 'main' | 'sub' | 'specialized';
  status: 'active' | 'idle' | 'busy' | 'error';
  modelConfig: any;
  capabilities: string[];
  parentAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentStore {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  createAgent: (data: any) => Promise<void>;
  updateAgent: (id: string, data: any) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  setAgentModel: (id: string, modelConfig: any) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.agents.list();
      set({ agents: response.agents, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  createAgent: async (data) => {
    set({ loading: true, error: null });
    try {
      await api.agents.create(data);
      const response = await api.agents.list();
      set({ agents: response.agents, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  updateAgent: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await api.agents.update(id, data);
      const response = await api.agents.list();
      set({ agents: response.agents, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  deleteAgent: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.agents.delete(id);
      const response = await api.agents.list();
      set({ agents: response.agents, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  setAgentModel: async (id, modelConfig) => {
    set({ loading: true, error: null });
    try {
      await api.agents.setModel(id, modelConfig);
      const response = await api.agents.list();
      set({ agents: response.agents, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },
}));
```

## Phase 3: Frontend Pages

### Step 3.1: Dashboard Page

Create `frontend/src/app/page.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/lib/stores/agentStore';

export default function Dashboard() {
  const { agents, loading, fetchAgents } = useAgentStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const activeAgents = agents.filter(a => a.status === 'active').length;
  const idleAgents = agents.filter(a => a.status === 'idle').length;
  const busyAgents = agents.filter(a => a.status === 'busy').length;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">Active Agents</h3>
          <p className="text-4xl font-bold text-green-600">{activeAgents}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">Idle Agents</h3>
          <p className="text-4xl font-bold text-yellow-600">{idleAgents}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">Busy Agents</h3>
          <p className="text-4xl font-bold text-blue-600">{busyAgents}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Agents</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-4">
            {agents.slice(0, 5).map(agent => (
              <div key={agent.id} className="flex items-center justify-between p-4 border rounded">
                <div>
                  <h3 className="font-semibold">{agent.name}</h3>
                  <p className="text-sm text-gray-500">{agent.type}</p>
                </div>
                <span className={`px-3 py-1 rounded text-sm ${
                  agent.status === 'active' ? 'bg-green-100 text-green-800' :
                  agent.status === 'busy' ? 'bg-blue-100 text-blue-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {agent.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 3.2: Agent Management Page

Create `frontend/src/app/agents/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useAgentStore } from '@/lib/stores/agentStore';
import Link from 'next/link';

export default function AgentsPage() {
  const { agents, loading, fetchAgents, deleteAgent } = useAgentStore();
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      await deleteAgent(id);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Agents</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Agent
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {agents.map(agent => (
                <tr key={agent.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link href={`/agents/${agent.id}`} className="text-blue-600 hover:underline">
                      {agent.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{agent.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-sm ${
                      agent.status === 'active' ? 'bg-green-100 text-green-800' :
                      agent.status === 'busy' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {agent.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{agent.modelConfig.modelId}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleDelete(agent.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateForm && (
        <CreateAgentModal onClose={() => setShowCreateForm(false)} />
      )}
    </div>
  );
}

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const { createAgent } = useAgentStore();
  const [formData, setFormData] = useState({
    name: '',
    type: 'sub',
    modelConfig: {
      provider: 'openrouter',
      modelId: 'openai/gpt-4',
      parameters: {
        temperature: 0.7,
        maxTokens: 1000
      }
    },
    capabilities: ['chat', 'research']
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAgent(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Create Agent</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={e => setFormData({ ...formData, type: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="main">Main</option>
              <option value="sub">Sub</option>
              <option value="specialized">Specialized</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <select
              value={formData.modelConfig.modelId}
              onChange={e => setFormData({
                ...formData,
                modelConfig: { ...formData.modelConfig, modelId: e.target.value }
              })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="openai/gpt-4">GPT-4</option>
              <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet</option>
            </select>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### Step 3.3: Chat Interface

Create `frontend/src/app/chat/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAgentStore } from '@/lib/stores/agentStore';
import { api } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function ChatPage() {
  const { agents, fetchAgents } = useAgentStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAgentSelect = async (agentId: string) => {
    setSelectedAgentId(agentId);
    const session = await api.chat.createSession(agentId);
    setSessionId(session.id);
    setMessages([]);
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionId || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.chat.sendMessage(sessionId, input);
      setMessages(prev => [...prev, {
        id: response.id,
        role: 'assistant',
        content: response.content,
        timestamp: response.timestamp
      }]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 border-r p-4">
        <h2 className="text-lg font-semibold mb-4">Select Agent</h2>
        <div className="space-y-2">
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => handleAgentSelect(agent.id)}
              className={`w-full text-left px-3 py-2 rounded ${
                selectedAgentId === agent.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white hover:bg-gray-50'
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="border-b p-4">
          <h1 className="text-xl font-semibold">
            {selectedAgentId
              ? agents.find(a => a.id === selectedAgentId)?.name
              : 'Select an agent to start chatting'}
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 rounded-lg px-4 py-2">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t p-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              className="flex-1 border rounded px-4 py-2"
              disabled={!selectedAgentId || loading}
            />
            <button
              onClick={handleSend}
              disabled={!selectedAgentId || loading || !input.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Summary

This implementation guide provides:

1. **Backend Modules**: Agent Manager, Model Router, Task Orchestrator, Chat Manager
2. **API Endpoints**: RESTful endpoints for all operations
3. **WebSocket Events**: Real-time updates
4. **Frontend Setup**: Next.js with TypeScript and Tailwind CSS
5. **State Management**: Zustand stores for each domain
6. **Pages**: Dashboard, Agent Management, Chat Interface

Each component follows software craftsmanship principles:
- **Single Responsibility**: Each class has one clear purpose
- **Loose Coupling**: Components communicate through interfaces
- **Dependency Injection**: Dependencies are injected, not created
- **Type Safety**: Full TypeScript support
- **Error Handling**: Comprehensive error handling throughout
- **Testability**: Each component can be tested independently

## Next Steps

1. Review and approve this plan
2. Switch to Code mode to begin implementation
3. Start with Phase 1: Backend Enhancements
4. Set up frontend project structure
5. Implement features incrementally
6. Write tests as you go
7. Document as you build
