# UI & HUD System - Internal Documentation

## Overview

The OpenBro247 UI system consists of two main components: a Next.js dashboard for management and monitoring, and a Tauri v2 HUD overlay for real-time agent visualization. This document provides internal technical details for developers working on the UI layer.

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenBro247 UI System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Next.js Dashboard                      │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   App Router │  │   Server     │  │   Client     │   │  │
│  │  │   Pages      │  │   Components │  │   Components │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   React      │  │   Zustand    │  │   React      │   │  │
│  │  │   Query      │  │   State      │  │   Hook Form  │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   WebSocket  │  │   API        │  │   Auth       │   │  │
│  │  │   Client     │  │   Client     │  │   Provider   │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Tauri v2 HUD                           │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Transparent│  │   Always-on- │  │   Click-     │   │  │
│  │  │   Window     │  │   Top        │  │   Through    │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Agent      │  │   Task       │  │   Memory     │   │  │
│  │  │   Status     │  │   Progress   │  │   Stats      │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Quick      │  │   Notifica-  │  │   Settings   │   │  │
│  │  │   Actions    │  │   tions      │  │   Panel      │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Backend for Frontend (BFF)             │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   API        │  │   WebSocket  │  │   Auth       │   │  │
│  │  │   Gateway    │  │   Server     │  │   Middleware  │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Data       │  │   Cache      │  │   Rate       │   │  │
│  │  │   Transform  │  │   Layer      │  │   Limiter    │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| Next.js Dashboard | Management UI, data visualization | Next.js 14, React 18, TypeScript |
| Tauri v2 HUD | Real-time overlay, agent visualization | Tauri v2, Rust, WebView |
| BFF | API gateway, data transformation | Fastify, TypeScript |
| WebSocket Server | Real-time communication | ws, TypeScript |

---

## 2. Next.js Dashboard

### 2.1 App Router Structure

```
frontend/dashboard/src/app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Home page
├── agents/
│   ├── page.tsx            # Agents list page
│   └── new/
│       └── page.tsx        # Create agent page
├── tasks/
│   └── page.tsx            # Tasks page
├── skills/
│   └── page.tsx            # Skills page
├── memory/
│   └── page.tsx            # Memory page
├── settings/
│   └── page.tsx            # Settings page
└── api/
    └── [...route]/
        └── route.ts        # API route handler
```

### 2.2 Component Architecture

```typescript
// Component hierarchy
App
├── Layout
│   ├── Sidebar
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── UserMenu
│   ├── Header
│   │   ├── Search
│   │   ├── Notifications
│   │   └── UserProfile
│   └── Main
│       └── PageContent
│           ├── PageHeader
│           ├── PageBody
│           └── PageFooter
└── Providers
    ├── QueryProvider
    ├── AuthProvider
    ├── WebSocketProvider
    └── ThemeProvider
```

### 2.3 State Management

#### Global State (Zustand)

```typescript
interface AppState {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  
  // UI state
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  notifications: Notification[];
  
  // Agent state
  agents: Agent[];
  selectedAgent: Agent | null;
  
  // Task state
  tasks: Task[];
  selectedTask: Task | null;
  
  // Actions
  setUser: (user: User | null) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  setAgents: (agents: Agent[]) => void;
  selectAgent: (agent: Agent | null) => void;
  setTasks: (tasks: Task[]) => void;
  selectTask: (task: Task | null) => void;
}

const useAppStore = create<AppState>((set) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  sidebarOpen: true,
  theme: 'light',
  notifications: [],
  agents: [],
  selectedAgent: null,
  tasks: [],
  selectedTask: null,
  
  // Actions
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => set({ theme }),
  addNotification: (notification) => 
    set((state) => ({ notifications: [...state.notifications, notification] })),
  removeNotification: (id) =>
    set((state) => ({ 
      notifications: state.notifications.filter((n) => n.id !== id) 
    })),
  setAgents: (agents) => set({ agents }),
  selectAgent: (agent) => set({ selectedAgent: agent }),
  setTasks: (tasks) => set({ tasks }),
  selectTask: (task) => set({ selectedTask: task }),
}));
```

#### Server State (React Query)

```typescript
// Agents query
const useAgents = () => {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    staleTime: 30000, // 30 seconds
    refetchInterval: 5000, // 5 seconds
  });
};

// Agent mutation
const useCreateAgent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateAgentData) => api.createAgent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
};
```

### 2.4 WebSocket Integration

```typescript
// WebSocket client
class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  connect(url: string): void {
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.reconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }
  
  private reconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect(this.ws?.url || '');
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }
  
  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'agent_status':
        useAppStore.getState().updateAgentStatus(message.data);
        break;
      case 'task_progress':
        useAppStore.getState().updateTaskProgress(message.data);
        break;
      case 'notification':
        useAppStore.getState().addNotification(message.data);
        break;
      case 'memory_update':
        useAppStore.getState().updateMemoryStats(message.data);
        break;
    }
  }
  
  send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

### 2.5 Page Components

#### Agents Page

```typescript
// Agents page component
export default function AgentsPage() {
  const { data: agents, isLoading, error } = useAgents();
  const { selectedAgent, selectAgent } = useAppStore();
  
  if (isLoading) return <AgentsSkeleton />;
  if (error) return <ErrorDisplay error={error} />;
  
  return (
    <div className="agents-page">
      <PageHeader
        title="Agents"
        description="Manage your AI agents"
        actions={<CreateAgentButton />}
      />
      
      <div className="agents-grid">
        {agents?.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selectedAgent?.id === agent.id}
            onClick={() => selectAgent(agent)}
          />
        ))}
      </div>
      
      {selectedAgent && (
        <AgentDetailsPanel
          agent={selectedAgent}
          onClose={() => selectAgent(null)}
        />
      )}
    </div>
  );
}
```

#### Tasks Page

```typescript
// Tasks page component
export default function TasksPage() {
  const { data: tasks, isLoading, error } = useTasks();
  const { selectedTask, selectTask } = useAppStore();
  
  if (isLoading) return <TasksSkeleton />;
  if (error) return <ErrorDisplay error={error} />;
  
  return (
    <div className="tasks-page">
      <PageHeader
        title="Tasks"
        description="Monitor task execution"
        actions={<CreateTaskButton />}
      />
      
      <TasksTable
        tasks={tasks || []}
        selectedTask={selectedTask}
        onSelectTask={selectTask}
      />
      
      {selectedTask && (
        <TaskDetailsPanel
          task={selectedTask}
          onClose={() => selectTask(null)}
        />
      )}
    </div>
  );
}
```

---

## 3. Tauri v2 HUD

### 3.1 Window Configuration

```rust
// src-tauri/src/main.rs
use tauri::{Manager, WindowBuilder, WindowUrl};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = WindowBuilder::new(app, "hud", WindowUrl::App("index.html".into()))
                .title("OpenBro247 HUD")
                .inner_size(400.0, 600.0)
                .position(100.0, 100.0)
                .transparent(true)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(true)
                .build()?;
            
            // Set window to be click-through
            window.set_ignore_cursor_events(true)?;
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3.2 HUD Component Structure

```typescript
// HUD React components
HUD
├── HUDContainer
│   ├── AgentStatusPanel
│   │   ├── AgentList
│   │   ├── AgentCard
│   │   └── AgentMetrics
│   ├── TaskProgressPanel
│   │   ├── TaskList
│   │   ├── TaskCard
│   │   └── TaskTimeline
│   ├── MemoryStatsPanel
│   │   ├── MemoryUsage
│   │   ├── MemoryTypes
│   │   └── MemorySearch
│   ├── QuickActionsPanel
│   │   ├── ActionButton
│   │   ├── ActionMenu
│   │   └── ActionHistory
│   ├── NotificationsPanel
│   │   ├── NotificationList
│   │   ├── NotificationCard
│   │   └── NotificationSettings
│   └── SettingsPanel
│       ├── ThemeToggle
│       ├── OpacitySlider
│       ├── PositionControls
│       └── ConnectionStatus
```

### 3.3 HUD State Management

```typescript
interface HUDState {
  // Window state
  position: { x: number; y: number };
  size: { width: number; height: number };
  opacity: number;
  isClickThrough: boolean;
  
  // Agent state
  agents: Agent[];
  activeAgent: Agent | null;
  
  // Task state
  tasks: Task[];
  activeTask: Task | null;
  
  // Memory state
  memoryStats: MemoryStats;
  
  // UI state
  activePanel: 'agents' | 'tasks' | 'memory' | 'actions' | 'settings';
  isCollapsed: boolean;
  
  // Actions
  setPosition: (position: { x: number; y: number }) => void;
  setSize: (size: { width: number; height: number }) => void;
  setOpacity: (opacity: number) => void;
  toggleClickThrough: () => void;
  setAgents: (agents: Agent[]) => void;
  setActiveAgent: (agent: Agent | null) => void;
  setTasks: (tasks: Task[]) => void;
  setActiveTask: (task: Task | null) => void;
  setMemoryStats: (stats: MemoryStats) => void;
  setActivePanel: (panel: string) => void;
  toggleCollapsed: () => void;
}

const useHUDStore = create<HUDState>((set) => ({
  // Initial state
  position: { x: 100, y: 100 },
  size: { width: 400, height: 600 },
  opacity: 0.9,
  isClickThrough: true,
  agents: [],
  activeAgent: null,
  tasks: [],
  activeTask: null,
  memoryStats: {
    totalMemories: 0,
    episodic: 0,
    semantic: 0,
    procedural: 0,
    working: 0,
  },
  activePanel: 'agents',
  isCollapsed: false,
  
  // Actions
  setPosition: (position) => set({ position }),
  setSize: (size) => set({ size }),
  setOpacity: (opacity) => set({ opacity }),
  toggleClickThrough: () => set((state) => ({ isClickThrough: !state.isClickThrough })),
  setAgents: (agents) => set({ agents }),
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  setTasks: (tasks) => set({ tasks }),
  setActiveTask: (task) => set({ activeTask: task }),
  setMemoryStats: (stats) => set({ memoryStats: stats }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
}));
```

### 3.4 HUD Components

#### Agent Status Panel

```typescript
// Agent status panel component
export function AgentStatusPanel() {
  const { agents, activeAgent, setActiveAgent } = useHUDStore();
  
  return (
    <div className="agent-status-panel">
      <div className="panel-header">
        <h3>Agents</h3>
        <span className="agent-count">{agents.length}</span>
      </div>
      
      <div className="agent-list">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            active={activeAgent?.id === agent.id}
            onClick={() => setActiveAgent(agent)}
          />
        ))}
      </div>
      
      {activeAgent && (
        <AgentMetrics agent={activeAgent} />
      )}
    </div>
  );
}

// Agent card component
function AgentCard({ agent, active, onClick }: AgentCardProps) {
  return (
    <div
      className={`agent-card ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="agent-icon">
        <AgentIcon type={agent.type} />
      </div>
      
      <div className="agent-info">
        <div className="agent-name">{agent.name}</div>
        <div className="agent-status">
          <StatusIndicator status={agent.status} />
          <span>{agent.status}</span>
        </div>
      </div>
      
      <div className="agent-metrics">
        <div className="metric">
          <span className="metric-label">Tasks</span>
          <span className="metric-value">{agent.tasksCompleted}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Success</span>
          <span className="metric-value">{agent.successRate}%</span>
        </div>
      </div>
    </div>
  );
}
```

#### Task Progress Panel

```typescript
// Task progress panel component
export function TaskProgressPanel() {
  const { tasks, activeTask, setActiveTask } = useHUDStore();
  
  return (
    <div className="task-progress-panel">
      <div className="panel-header">
        <h3>Tasks</h3>
        <span className="task-count">{tasks.length}</span>
      </div>
      
      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            active={activeTask?.id === task.id}
            onClick={() => setActiveTask(task)}
          />
        ))}
      </div>
      
      {activeTask && (
        <TaskTimeline task={activeTask} />
      )}
    </div>
  );
}

// Task card component
function TaskCard({ task, active, onClick }: TaskCardProps) {
  return (
    <div
      className={`task-card ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="task-icon">
        <TaskIcon status={task.status} />
      </div>
      
      <div className="task-info">
        <div className="task-name">{task.name}</div>
        <div className="task-progress">
          <ProgressBar progress={task.progress} />
          <span>{task.progress}%</span>
        </div>
      </div>
      
      <div className="task-meta">
        <div className="task-agent">
          <AgentIcon type={task.agentType} />
          <span>{task.agentName}</span>
        </div>
        <div className="task-duration">
          <ClockIcon />
          <span>{formatDuration(task.duration)}</span>
        </div>
      </div>
    </div>
  );
}
```

### 3.5 HUD Communication

```typescript
// HUD WebSocket client
class HUDWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  
  connect(): void {
    const url = `ws://${window.location.hostname}:8000/ws/hud`;
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      console.log('HUD WebSocket connected');
      this.reconnectAttempts = 0;
      this.subscribe();
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
    
    this.ws.onclose = () => {
      console.log('HUD WebSocket disconnected');
      this.reconnect();
    };
  }
  
  private subscribe(): void {
    this.send({
      type: 'subscribe',
      channels: ['agents', 'tasks', 'memory', 'notifications'],
    });
  }
  
  private handleMessage(message: WebSocketMessage): void {
    const store = useHUDStore.getState();
    
    switch (message.type) {
      case 'agents_update':
        store.setAgents(message.data);
        break;
      case 'tasks_update':
        store.setTasks(message.data);
        break;
      case 'memory_update':
        store.setMemoryStats(message.data);
        break;
      case 'notification':
        // Handle notification
        break;
    }
  }
  
  private reconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }
  
  send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

---

## 4. Backend for Frontend (BFF)

### 4.1 BFF Architecture

```typescript
// BFF server structure
BFF
├── API Gateway
│   ├── Route handlers
│   ├── Request validation
│   ├── Response transformation
│   └── Error handling
├── WebSocket Server
│   ├── Connection management
│   ├── Message routing
│   ├── Subscription management
│   └── Broadcasting
├── Auth Middleware
│   ├── Token validation
│   ├── Permission checking
│   ├── Rate limiting
│   └── Session management
└── Data Transform
    ├── API response mapping
    ├── Data aggregation
    ├── Caching
    └── Pagination
```

### 4.2 API Routes

```typescript
// BFF API routes
const routes = [
  // Agents
  { method: 'GET', path: '/api/agents', handler: getAgents },
  { method: 'POST', path: '/api/agents', handler: createAgent },
  { method: 'GET', path: '/api/agents/:id', handler: getAgent },
  { method: 'PUT', path: '/api/agents/:id', handler: updateAgent },
  { method: 'DELETE', path: '/api/agents/:id', handler: deleteAgent },
  
  // Tasks
  { method: 'GET', path: '/api/tasks', handler: getTasks },
  { method: 'POST', path: '/api/tasks', handler: createTask },
  { method: 'GET', path: '/api/tasks/:id', handler: getTask },
  { method: 'PUT', path: '/api/tasks/:id', handler: updateTask },
  { method: 'DELETE', path: '/api/tasks/:id', handler: deleteTask },
  
  // Skills
  { method: 'GET', path: '/api/skills', handler: getSkills },
  { method: 'POST', path: '/api/skills', handler: installSkill },
  { method: 'GET', path: '/api/skills/:id', handler: getSkill },
  { method: 'DELETE', path: '/api/skills/:id', handler: uninstallSkill },
  
  // Memory
  { method: 'GET', path: '/api/memory/stats', handler: getMemoryStats },
  { method: 'POST', path: '/api/memory/search', handler: searchMemory },
  { method: 'DELETE', path: '/api/memory/cleanup', handler: cleanupMemory },
  
  // Settings
  { method: 'GET', path: '/api/settings', handler: getSettings },
  { method: 'PUT', path: '/api/settings', handler: updateSettings },
];
```

### 4.3 WebSocket Handlers

```typescript
// WebSocket message handlers
const wsHandlers = {
  subscribe: (ws: WebSocket, message: SubscribeMessage) => {
    const { channels } = message.data;
    channels.forEach((channel) => {
      wsManager.subscribe(ws, channel);
    });
  },
  
  unsubscribe: (ws: WebSocket, message: UnsubscribeMessage) => {
    const { channels } = message.data;
    channels.forEach((channel) => {
      wsManager.unsubscribe(ws, channel);
    });
  },
  
  command: (ws: WebSocket, message: CommandMessage) => {
    const { command, params } = message.data;
    commandHandler.execute(command, params)
      .then((result) => {
        ws.send(JSON.stringify({
          type: 'command_result',
          data: result,
        }));
      })
      .catch((error) => {
        ws.send(JSON.stringify({
          type: 'command_error',
          data: { error: error.message },
        }));
      });
  },
};
```

---

## 5. Design System

### 5.1 Color Palette

```typescript
const colors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  
  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },
  
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  
  neutral: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
  },
};
```

### 5.2 Typography

```typescript
const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace'],
  },
  
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};
```

### 5.3 Spacing

```typescript
const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
};
```

---

## 6. Performance Optimization

### 6.1 Code Splitting

```typescript
// Lazy load pages
const AgentsPage = lazy(() => import('./agents/page'));
const TasksPage = lazy(() => import('./tasks/page'));
const SkillsPage = lazy(() => import('./skills/page'));
const MemoryPage = lazy(() => import('./memory/page'));
const SettingsPage = lazy(() => import('./settings/page'));

// Lazy load components
const AgentDetailsPanel = lazy(() => import('./components/AgentDetailsPanel'));
const TaskDetailsPanel = lazy(() => import('./components/TaskDetailsPanel'));
const CreateAgentModal = lazy(() => import('./components/CreateAgentModal'));
```

### 6.2 Memoization

```typescript
// Memoize expensive computations
const useAgentMetrics = (agent: Agent) => {
  return useMemo(() => {
    return {
      successRate: agent.tasksCompleted > 0 
        ? (agent.tasksSuccessful / agent.tasksCompleted) * 100 
        : 0,
      averageDuration: agent.totalDuration / agent.tasksCompleted,
      efficiency: agent.tasksCompleted / agent.totalDuration,
    };
  }, [agent.tasksCompleted, agent.tasksSuccessful, agent.totalDuration]);
};

// Memoize components
const AgentCard = memo(({ agent, onClick }: AgentCardProps) => {
  const metrics = useAgentMetrics(agent);
  
  return (
    <div className="agent-card" onClick={onClick}>
      {/* Component content */}
    </div>
  );
});
```

### 6.3 Virtualization

```typescript
// Virtualize long lists
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedAgentList({ agents }: { agents: Agent[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: agents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });
  
  return (
    <div ref={parentRef} className="agent-list-container">
      <div
        className="agent-list"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <AgentCard agent={agents[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Testing

### 7.1 Component Testing

```typescript
// Agent card test
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentCard } from './AgentCard';

describe('AgentCard', () => {
  const mockAgent = {
    id: '1',
    name: 'Test Agent',
    type: 'worker',
    status: 'active',
    tasksCompleted: 10,
    tasksSuccessful: 8,
    totalDuration: 1000,
  };
  
  it('renders agent information', () => {
    render(<AgentCard agent={mockAgent} onClick={() => {}} />);
    
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
  
  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<AgentCard agent={mockAgent} onClick={onClick} />);
    
    fireEvent.click(screen.getByText('Test Agent'));
    
    expect(onClick).toHaveBeenCalledWith(mockAgent);
  });
});
```

### 7.2 E2E Testing

```typescript
// E2E test with Playwright
import { test, expect } from '@playwright/test';

test('agents page displays agents', async ({ page }) => {
  await page.goto('/agents');
  
  // Wait for agents to load
  await page.waitForSelector('.agent-card');
  
  // Check agent cards are displayed
  const agentCards = await page.$$('.agent-card');
  expect(agentCards.length).toBeGreaterThan(0);
  
  // Check agent information is displayed
  const agentName = await page.textContent('.agent-card:first-child .agent-name');
  expect(agentName).toBeTruthy();
});

test('create agent modal opens', async ({ page }) => {
  await page.goto('/agents');
  
  // Click create agent button
  await page.click('button:has-text("Create Agent")');
  
  // Check modal is displayed
  await expect(page.locator('.modal')).toBeVisible();
  
  // Check form fields are displayed
  await expect(page.locator('input[name="name"]')).toBeVisible();
  await expect(page.locator('select[name="type"]')).toBeVisible();
});
```

---

## 8. Deployment

### 8.1 Dashboard Deployment

```dockerfile
# Dashboard Dockerfile
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

RUN npm ci --only=production

EXPOSE 3000

CMD ["npm", "start"]
```

### 8.2 HUD Deployment

```toml
# src-tauri/Cargo.toml
[package]
name = "openbro247-hud"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0.0", features = [] }

[dependencies]
tauri = { version = "2.0.0", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }
tokio-tungstenite = "0.20"
```

---

## 9. Future Enhancements

### 9.1 Planned Features

1. **Real-time Collaboration**: Multiple users viewing same dashboard
2. **Customizable Layouts**: Drag-and-drop dashboard customization
3. **Advanced Visualizations**: Charts, graphs, and analytics
4. **Mobile Support**: Responsive design for mobile devices
5. **Offline Support**: Service worker for offline functionality

### 9.2 Research Areas

1. **WebGL Rendering**: GPU-accelerated visualizations
2. **Voice Control**: Voice commands for HUD
3. **Gesture Recognition**: Hand gesture control
4. **AR Integration**: Augmented reality overlay
5. **Brain-Computer Interface**: Neural control (long-term)

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-20  
**Status**: Internal Documentation  
**Access**: Engineering Team Only
