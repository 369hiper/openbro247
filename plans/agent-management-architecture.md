# OpenClaw Agent Management System - Architecture Plan

## Overview

This document outlines the architecture for a comprehensive agent management system built on top of OpenClaw (OpenBro247). The system will provide a ChatGPT-like interface for managing multiple AI agents, each capable of being routed to different OpenRouter models, with a dashboard for tracking tasks and agent status.

## Current OpenClaw Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Backend                          │
├─────────────────────────────────────────────────────────────┤
│  API Server (Fastify)                                       │
│  ├── REST API Endpoints                                     │
│  ├── WebSocket Support                                      │
│  └── CORS Configuration                                     │
├─────────────────────────────────────────────────────────────┤
│  LLM Manager                                                │
│  ├── OpenAI Provider                                        │
│  ├── Anthropic Provider                                     │
│  └── Local LLM Provider                                     │
├─────────────────────────────────────────────────────────────┤
│  Semantic Memory                                            │
│  ├── Vector Store (ChromaDB)                                │
│  └── SQLite Store                                           │
├─────────────────────────────────────────────────────────────┤
│  Browser Engine (Playwright)                                │
└─────────────────────────────────────────────────────────────┘
```

## Proposed System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
├─────────────────────────────────────────────────────────────┤
│  Dashboard Pages                                            │
│  ├── Agent Management                                       │
│  ├── Task Tracking                                          │
│  ├── Model Configuration                                    │
│  └── Chat Interface                                         │
├─────────────────────────────────────────────────────────────┤
│  State Management (Zustand/Redux)                           │
│  ├── Agent State                                            │
│  ├── Task State                                             │
│  ├── Chat State                                             │
│  └── Model State                                            │
├─────────────────────────────────────────────────────────────┤
│  API Client Layer                                           │
│  ├── REST API Client                                        │
│  ├── WebSocket Client                                       │
│  └── Real-time Updates                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ REST API + WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Enhanced OpenClaw Backend                    │
├─────────────────────────────────────────────────────────────┤
│  Agent Manager (NEW)                                        │
│  ├── Agent Registry                                         │
│  ├── Agent Lifecycle Management                             │
│  ├── Model Router                                           │
│  └── Task Orchestrator                                      │
├─────────────────────────────────────────────────────────────┤
│  Enhanced API Server                                        │
│  ├── Agent CRUD Endpoints                                   │
│  ├── Task Management Endpoints                              │
│  ├── Model Configuration Endpoints                          │
│  ├── Chat Endpoints                                         │
│  └── WebSocket Events                                       │
├─────────────────────────────────────────────────────────────┤
│  Enhanced LLM Manager                                       │
│  ├── OpenRouter Integration                                 │
│  ├── Model Registry                                         │
│  ├── Dynamic Model Selection                                │
│  └── Model Health Monitoring                                │
├─────────────────────────────────────────────────────────────┤
│  Existing Components                                        │
│  ├── Semantic Memory                                        │
│  ├── Browser Engine                                         │
│  └── Skills System                                          │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Principles

### 1. Loose Coupling
- **Interface-based Design**: All components communicate through well-defined interfaces
- **Dependency Injection**: Components receive dependencies rather than creating them
- **Event-driven Communication**: Components communicate via events where possible
- **Plugin Architecture**: New models and routers can be added without modifying core code

### 2. Separation of Concerns
- **Agent Layer**: Manages agent lifecycle and configuration
- **Model Layer**: Handles model selection and routing
- **Task Layer**: Manages task execution and tracking
- **Presentation Layer**: Handles UI and user interaction

### 3. Single Responsibility
- Each class/module has one clear purpose
- Small, focused functions
- Clear boundaries between components

### 4. Open/Closed Principle
- Open for extension (new models, routers, agents)
- Closed for modification (core logic remains stable)

## Component Details

### 1. Agent Manager

```typescript
interface IAgent {
  id: string;
  name: string;
  type: 'main' | 'sub' | 'specialized';
  status: 'active' | 'idle' | 'busy' | 'error';
  modelConfig: ModelConfig;
  capabilities: string[];
  parentAgentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IAgentManager {
  createAgent(config: AgentConfig): Promise<IAgent>;
  deleteAgent(agentId: string): Promise<void>;
  getAgent(agentId: string): Promise<IAgent>;
  listAgents(): Promise<IAgent[]>;
  updateAgent(agentId: string, updates: Partial<IAgent>): Promise<IAgent>;
  assignTask(agentId: string, task: Task): Promise<void>;
  getAgentTasks(agentId: string): Promise<Task[]>;
}
```

### 2. Model Router

```typescript
interface ModelConfig {
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

interface IModelRouter {
  route(agentId: string, prompt: string): Promise<LLMResponse>;
  getModelForAgent(agentId: string): ModelConfig;
  setModelForAgent(agentId: string, modelConfig: ModelConfig): void;
  listAvailableModels(): Promise<ModelInfo[]>;
  validateModel(modelConfig: ModelConfig): Promise<boolean>;
}
```

### 3. Task Orchestrator

```typescript
interface Task {
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
  subtasks: Task[];
}

interface ITaskOrchestrator {
  createTask(agentId: string, description: string, priority?: string): Promise<Task>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
  getTask(taskId: string): Promise<Task>;
  listTasks(filters?: TaskFilters): Promise<Task[]>;
  assignTaskToAgent(taskId: string, agentId: string): Promise<void>;
  createSubtask(parentTaskId: string, description: string): Promise<Task>;
}
```

### 4. Chat Interface

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  metadata?: Record<string, any>;
}

interface ChatSession {
  id: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface IChatManager {
  createSession(agentId: string): Promise<ChatSession>;
  sendMessage(sessionId: string, content: string): Promise<ChatMessage>;
  getHistory(sessionId: string): Promise<ChatMessage[]>;
  streamResponse(sessionId: string, content: string): AsyncIterable<string>;
}
```

## API Endpoints

### Agent Management
```
POST   /api/agents                    - Create new agent
GET    /api/agents                    - List all agents
GET    /api/agents/:id                - Get agent details
PUT    /api/agents/:id                - Update agent
DELETE /api/agents/:id                - Delete agent
POST   /api/agents/:id/activate       - Activate agent
POST   /api/agents/:id/deactivate     - Deactivate agent
```

### Task Management
```
POST   /api/tasks                     - Create new task
GET    /api/tasks                     - List all tasks
GET    /api/tasks/:id                 - Get task details
PUT    /api/tasks/:id                 - Update task
DELETE /api/tasks/:id                 - Delete task
POST   /api/tasks/:id/assign          - Assign task to agent
GET    /api/agents/:id/tasks          - Get tasks for agent
```

### Model Configuration
```
GET    /api/models                    - List available models
POST   /api/models/validate           - Validate model config
PUT    /api/agents/:id/model          - Set model for agent
GET    /api/agents/:id/model          - Get model for agent
```

### Chat
```
POST   /api/chat/sessions             - Create chat session
GET    /api/chat/sessions/:id         - Get session details
POST   /api/chat/sessions/:id/messages - Send message
GET    /api/chat/sessions/:id/history - Get chat history
```

### WebSocket Events
```
agent:created                        - New agent created
agent:updated                        - Agent updated
agent:deleted                        - Agent deleted
agent:status                         - Agent status changed
task:created                         - New task created
task:updated                         - Task updated
task:completed                       - Task completed
chat:message                         - New chat message
chat:stream                          - Streaming chat response
```

## Frontend Pages

### 1. Dashboard
- Overview of all agents
- Active tasks count
- System health status
- Recent activity feed

### 2. Agent Management
- List of all agents with status
- Create new agent form
- Edit agent configuration
- Delete agent confirmation
- Agent details view

### 3. Task Tracking
- Task list with filters
- Task details view
- Task assignment interface
- Task progress tracking

### 4. Model Configuration
- Available models list
- Model assignment per agent
- Model health status
- API key management

### 5. Chat Interface
- ChatGPT-like conversation view
- Agent selection dropdown
- Message history
- Real-time streaming responses
- File/image upload support

## Technology Stack

### Frontend
- **Next.js 14+**: React framework with App Router
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first CSS
- **Zustand**: Lightweight state management
- **React Query**: Data fetching and caching
- **Socket.io Client**: WebSocket communication
- **React Hook Form**: Form handling
- **Zod**: Schema validation

### Backend (Enhancements)
- **Existing Fastify**: API server
- **Socket.io**: WebSocket server
- **OpenRouter SDK**: Model routing
- **Bull/BullMQ**: Task queue (optional)
- **Redis**: Caching (optional)

## Data Flow

### Agent Creation Flow
```
User → Frontend Form → API POST /api/agents → Agent Manager
  → Validate Config → Create Agent Record → Store in DB
  → Emit agent:created event → WebSocket → Frontend Update
```

### Task Execution Flow
```
User → Frontend → API POST /api/tasks → Task Orchestrator
  → Assign to Agent → Agent Manager → Model Router
  → Select Model → Execute Task → Store Result
  → Emit task:completed event → WebSocket → Frontend Update
```

### Chat Flow
```
User → Chat Input → WebSocket message → Chat Manager
  → Get Agent Config → Model Router → Stream Response
  → WebSocket stream → Frontend Real-time Update
```

## Implementation Phases

### Phase 1: Backend Enhancements
1. Create Agent Manager module
2. Create Model Router with OpenRouter support
3. Create Task Orchestrator
4. Create Chat Manager
5. Enhance API endpoints
6. Add WebSocket event system

### Phase 2: Frontend Foundation
1. Set up Next.js project
2. Configure Tailwind CSS
3. Set up state management
4. Create API client layer
5. Set up WebSocket client

### Phase 3: Core Features
1. Dashboard page
2. Agent management pages
3. Task tracking pages
4. Model configuration pages

### Phase 4: Chat Interface
1. Chat UI components
2. Real-time messaging
3. Streaming responses
4. Chat history

### Phase 5: Integration & Polish
1. End-to-end testing
2. Error handling
3. Loading states
4. Responsive design
5. Documentation

## File Structure

```
openbro247-typescript/
├── src/
│   ├── agents/
│   │   ├── agentManager.ts
│   │   ├── agent.ts
│   │   └── types.ts
│   ├── models/
│   │   ├── modelRouter.ts
│   │   ├── openrouterProvider.ts
│   │   └── types.ts
│   ├── tasks/
│   │   ├── taskOrchestrator.ts
│   │   ├── task.ts
│   │   └── types.ts
│   ├── chat/
│   │   ├── chatManager.ts
│   │   ├── chatSession.ts
│   │   └── types.ts
│   ├── api/
│   │   ├── server.ts (enhanced)
│   │   ├── routes/
│   │   │   ├── agents.ts
│   │   │   ├── tasks.ts
│   │   │   ├── models.ts
│   │   │   └── chat.ts
│   │   └── websocket/
│   │       └── events.ts
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx (Dashboard)
│   │   │   ├── agents/
│   │   │   │   ├── page.tsx (List)
│   │   │   │   ├── [id]/page.tsx (Details)
│   │   │   │   └── create/page.tsx
│   │   │   ├── tasks/
│   │   │   │   ├── page.tsx (List)
│   │   │   │   └── [id]/page.tsx (Details)
│   │   │   ├── models/
│   │   │   │   └── page.tsx
│   │   │   └── chat/
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   ├── agents/
│   │   │   ├── tasks/
│   │   │   ├── models/
│   │   │   ├── chat/
│   │   │   └── common/
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── websocket.ts
│   │   │   └── stores/
│   │   └── types/
│   ├── package.json
│   ├── tailwind.config.js
│   └── next.config.js
└── ...
```

## Benefits

1. **Loose Coupling**: Components can be swapped independently
2. **Scalability**: Easy to add new models, agents, and features
3. **Maintainability**: Clear separation of concerns
4. **Testability**: Each component can be tested independently
5. **Flexibility**: Runtime configuration changes
6. **Real-time**: WebSocket for instant updates
7. **User-friendly**: ChatGPT-like interface for easy interaction

## Next Steps

1. Review and approve this architecture
2. Create detailed todo list for implementation
3. Begin Phase 1: Backend Enhancements
4. Set up frontend project structure
5. Implement core features incrementally
