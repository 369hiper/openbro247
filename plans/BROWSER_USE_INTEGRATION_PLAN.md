# Production-Grade Browser-Use Integration Plan

## Executive Summary

After researching the industry landscape, I've identified the optimal path forward: **Use the TypeScript port of browser-use** (`browser-use` npm package) which provides a production-grade, battle-tested foundation for AI-powered browser automation.

## 🎯 Recommended Approach: browser-use TypeScript

### Why browser-use TypeScript?

1. **Official TypeScript Port** - Native Node.js experience with full type safety
2. **Production-Ready** - Used by 81.3k+ GitHub stars, battle-tested by thousands
3. **Vision-First** - Built-in screenshot analysis at every step
4. **Multi-LLM Support** - OpenAI, Anthropic, Google, Ollama, etc.
5. **MCP Integration** - Extensible tool system
6. **Docker Ready** - Container support with VNC
7. **Active Development** - Regular updates and bug fixes

### Package Information
```json
{
  "name": "browser-use",
  "version": "latest",
  "description": "TypeScript port of browser-use - Make websites accessible for AI agents",
  "repository": "https://github.com/webllm/browser-use",
  "npm": "https://www.npmjs.com/package/browser-use"
}
```

---

## 📦 Implementation Plan

### Phase 1: Core Integration (Week 1)

#### 1.1 Install Dependencies
```bash
npm install browser-use @playwright/test
npx playwright install chromium
```

#### 1.2 Create Browser Agent Service
```typescript
// src/agents/browserAgent.ts
import { Agent, BrowserSession, BrowserProfile } from 'browser-use';
import { ChatOpenAI } from 'browser-use/llm/openai';
import { ChatAnthropic } from 'browser-use/llm/anthropic';

export interface BrowserAgentConfig {
  task: string;
  llmProvider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  apiKey?: string;
  useVision?: boolean;
  maxSteps?: number;
  maxActionsPerStep?: number;
  maxFailures?: number;
  generateGif?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export class BrowserAgentService {
  private agent: Agent | null = null;
  private session: BrowserSession | null = null;

  async createAgent(config: BrowserAgentConfig): Promise<Agent> {
    // Initialize LLM based on provider
    const llm = this.initializeLLM(config);

    // Create browser profile
    const profile = new BrowserProfile({
      headless: config.headless ?? false,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      highlight_elements: true,
    });

    // Create browser session
    this.session = new BrowserSession({ browser_profile: profile });

    // Create agent
    this.agent = new Agent({
      task: config.task,
      llm,
      browser_session: this.session,
      use_vision: config.useVision ?? true,
      max_actions_per_step: config.maxActionsPerStep ?? 5,
      max_failures: config.maxFailures ?? 3,
      generate_gif: config.generateGif,
      validate_output: true,
      use_thinking: true,
    });

    return this.agent;
  }

  private initializeLLM(config: BrowserAgentConfig) {
    switch (config.llmProvider) {
      case 'openai':
        return new ChatOpenAI({
          model: config.model ?? 'gpt-4o',
          apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
        });
      case 'anthropic':
        return new ChatAnthropic({
          model: config.model ?? 'claude-sonnet-4-20250514',
          apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
        });
      case 'ollama':
        // Ollama support via OpenAI-compatible API
        return new ChatOpenAI({
          model: config.model ?? 'llama3',
          apiKey: 'ollama',
          baseUrl: process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434/v1',
        });
      default:
        throw new Error(`Unsupported LLM provider: ${config.llmProvider}`);
    }
  }

  async runTask(task: string, options?: Partial<BrowserAgentConfig>): Promise<any> {
    if (!this.agent) {
      await this.createAgent({ task, ...options });
    }

    const history = await this.agent!.run();
    return {
      success: true,
      history,
      finalResult: history.final_result(),
      duration: history.total_duration_seconds(),
      tokens: history.total_input_tokens(),
    };
  }

  async stop(): Promise<void> {
    if (this.agent) {
      this.agent.stop();
    }
  }

  async pause(): Promise<void> {
    if (this.agent) {
      this.agent.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.agent) {
      this.agent.resume();
    }
  }

  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.close();
    }
  }
}
```

#### 1.3 Create Agent Manager
```typescript
// src/agents/agentManager.ts
import { BrowserAgentService, BrowserAgentConfig } from './browserAgent';
import { v4 as uuidv4 } from 'uuid';

export interface AgentInstance {
  id: string;
  name: string;
  agent: BrowserAgentService;
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  currentTask?: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export class AgentManager {
  private agents: Map<string, AgentInstance> = new Map();

  async createAgent(name: string, config: BrowserAgentConfig): Promise<AgentInstance> {
    const id = uuidv4();
    const agentService = new BrowserAgentService();
    await agentService.createAgent(config);

    const instance: AgentInstance = {
      id,
      name,
      agent: agentService,
      status: 'idle',
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.agents.set(id, instance);
    return instance;
  }

  async runTask(agentId: string, task: string): Promise<any> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    instance.status = 'running';
    instance.currentTask = task;
    instance.lastActiveAt = new Date();

    try {
      const result = await instance.agent.runTask(task);
      instance.status = 'idle';
      instance.currentTask = undefined;
      return result;
    } catch (error) {
      instance.status = 'error';
      throw error;
    }
  }

  async pauseAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (instance) {
      await instance.agent.pause();
      instance.status = 'paused';
    }
  }

  async resumeAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (instance) {
      await instance.agent.resume();
      instance.status = 'running';
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (instance) {
      await instance.agent.stop();
      instance.status = 'stopped';
    }
  }

  async deleteAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (instance) {
      await instance.agent.cleanup();
      this.agents.delete(agentId);
    }
  }

  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }
}
```

---

### Phase 2: API Integration (Week 2)

#### 2.1 Create REST API Endpoints
```typescript
// src/api/routes/browserAgent.ts
import { Router, Request, Response } from 'express';
import { AgentManager } from '../../agents/agentManager';
import { BrowserAgentConfig } from '../../agents/browserAgent';

const router = Router();
const agentManager = new AgentManager();

// Create a new agent
router.post('/agents', async (req: Request, res: Response) => {
  try {
    const { name, config } = req.body;
    const instance = await agentManager.createAgent(name, config);
    res.json({
      success: true,
      agent: {
        id: instance.id,
        name: instance.name,
        status: instance.status,
        createdAt: instance.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Run a task
router.post('/agents/:agentId/run', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { task } = req.body;
    const result = await agentManager.runTask(agentId, task);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Pause agent
router.post('/agents/:agentId/pause', async (req: Request, res: Response) => {
  try {
    await agentManager.pauseAgent(req.params.agentId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resume agent
router.post('/agents/:agentId/resume', async (req: Request, res: Response) => {
  try {
    await agentManager.resumeAgent(req.params.agentId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop agent
router.post('/agents/:agentId/stop', async (req: Request, res: Response) => {
  try {
    await agentManager.stopAgent(req.params.agentId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get agent status
router.get('/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const instance = agentManager.getAgent(req.params.agentId);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({
      success: true,
      agent: {
        id: instance.id,
        name: instance.name,
        status: instance.status,
        currentTask: instance.currentTask,
        createdAt: instance.createdAt,
        lastActiveAt: instance.lastActiveAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all agents
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const agents = agentManager.listAgents().map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      currentTask: a.currentTask,
      createdAt: a.createdAt,
      lastActiveAt: a.lastActiveAt,
    }));
    res.json({ success: true, agents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete agent
router.delete('/agents/:agentId', async (req: Request, res: Response) => {
  try {
    await agentManager.deleteAgent(req.params.agentId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

---

### Phase 3: Docker & VNC Setup (Week 3)

#### 3.1 Dockerfile
```dockerfile
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    curl \
    unzip \
    xvfb \
    libxss1 \
    libnss3 \
    libnspr4 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    fonts-liberation \
    fonts-noto-color-emoji \
    dbus \
    xauth \
    x11vnc \
    supervisor \
    net-tools \
    procps \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install noVNC
RUN git clone https://github.com/novnc/noVNC.git /opt/novnc \
    && git clone https://github.com/novnc/websockify /opt/novnc/utils/websockify \
    && ln -s /opt/novnc/vnc.html /opt/novnc/index.html

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Install Playwright browsers
RUN npx playwright install chromium

# Set up supervisor
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 3000 6080 5901 9222

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

#### 3.2 docker-compose.yml
```yaml
version: '3.8'

services:
  browser-agent:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"   # API
      - "6080:6080"   # noVNC
      - "5901:5901"   # VNC
      - "9222:9222"   # Chrome DevTools
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OLLAMA_ENDPOINT=${OLLAMA_ENDPOINT:-http://localhost:11434}
      - VNC_PASSWORD=${VNC_PASSWORD:-youvncpassword}
      - DISPLAY=:99
    volumes:
      - ./data:/app/data
      - ./recordings:/app/recordings
    shm_size: "2gb"
    cap_add:
      - SYS_ADMIN
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "nc", "-z", "localhost", "5901"]
      interval: 10s
      timeout: 5s
      retries: 3
```

#### 3.3 supervisord.conf
```ini
[supervisord]
user=root
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0
loglevel=error

[program:xvfb]
command=Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=100
startsecs=3

[program:vnc_setup]
command=bash -c "mkdir -p ~/.vnc && echo '%(ENV_VNC_PASSWORD)s' | vncpasswd -f > ~/.vnc/passwd && chmod 600 ~/.vnc/passwd"
autorestart=false
startsecs=0
priority=150

[program:x11vnc]
command=bash -c "sleep 5 && DISPLAY=:99 x11vnc -display :99 -forever -shared -rfbauth /root/.vnc/passwd -rfbport 5901"
autorestart=true
priority=200
startsecs=10
depends_on=vnc_setup,xvfb

[program:novnc]
command=bash -c "sleep 5 && cd /opt/novnc && ./utils/novnc_proxy --vnc localhost:5901 --listen 0.0.0.0:6080 --web /opt/novnc"
autorestart=true
priority=300
depends_on=x11vnc

[program:app]
command=node dist/index.js
directory=/app
autorestart=true
priority=400
depends_on=xvfb
```

---

### Phase 4: Frontend Integration (Week 4)

#### 4.1 React Dashboard Component
```typescript
// frontend/dashboard/src/components/BrowserAgent.tsx
import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Badge, Progress } from '@/components/ui';

interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  currentTask?: string;
}

export const BrowserAgentDashboard: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  // Fetch agents
  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgents = async () => {
    const response = await fetch('/api/browser-agents');
    const data = await response.json();
    if (data.success) {
      setAgents(data.agents);
    }
  };

  const createAgent = async () => {
    const response = await fetch('/api/browser-agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Agent-${Date.now()}`,
        config: {
          llmProvider: 'openai',
          model: 'gpt-4o',
          useVision: true,
          headless: false,
        },
      }),
    });
    const data = await response.json();
    if (data.success) {
      fetchAgents();
    }
  };

  const runTask = async () => {
    if (!selectedAgent || !task) return;

    setIsRunning(true);
    const response = await fetch(`/api/browser-agents/${selectedAgent}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    });
    const data = await response.json();
    setIsRunning(false);

    if (data.success) {
      setTask('');
      fetchAgents();
    }
  };

  const pauseAgent = async () => {
    if (!selectedAgent) return;
    await fetch(`/api/browser-agents/${selectedAgent}/pause`, { method: 'POST' });
    fetchAgents();
  };

  const resumeAgent = async () => {
    if (!selectedAgent) return;
    await fetch(`/api/browser-agents/${selectedAgent}/resume`, { method: 'POST' });
    fetchAgents();
  };

  const stopAgent = async () => {
    if (!selectedAgent) return;
    await fetch(`/api/browser-agents/${selectedAgent}/stop`, { method: 'POST' });
    fetchAgents();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Browser Agent Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Agent List */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Agents</h2>
          <Button onClick={createAgent} className="mb-4">
            Create New Agent
          </Button>
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`p-3 border rounded cursor-pointer ${
                  selectedAgent === agent.id ? 'border-blue-500 bg-blue-50' : ''
                }`}
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{agent.name}</span>
                  <Badge
                    variant={
                      agent.status === 'running'
                        ? 'success'
                        : agent.status === 'error'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {agent.status}
                  </Badge>
                </div>
                {agent.currentTask && (
                  <p className="text-sm text-gray-500 mt-1">
                    Task: {agent.currentTask}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Task Execution */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Run Task</h2>
          <div className="space-y-4">
            <Input
              placeholder="Enter task description..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={isRunning}
            />
            <div className="flex gap-2">
              <Button onClick={runTask} disabled={!selectedAgent || !task || isRunning}>
                {isRunning ? 'Running...' : 'Run Task'}
              </Button>
              <Button onClick={pauseAgent} variant="outline" disabled={!selectedAgent}>
                Pause
              </Button>
              <Button onClick={resumeAgent} variant="outline" disabled={!selectedAgent}>
                Resume
              </Button>
              <Button onClick={stopAgent} variant="destructive" disabled={!selectedAgent}>
                Stop
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* VNC Viewer */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold mb-4">Browser View (VNC)</h2>
        <iframe
          src={`${window.location.protocol}//${window.location.hostname}:6080/vnc.html?autoconnect=true&password=youvncpassword`}
          className="w-full h-96 border rounded"
          title="VNC Viewer"
        />
      </Card>
    </div>
  );
};
```

---

## 📊 Feature Comparison: Before vs After

| Feature | Before (Current) | After (browser-use) |
|---------|------------------|---------------------|
| Agent Loop | ❌ Switch statement | ✅ Full step-by-step |
| Vision | ❌ Unused screenshots | ✅ Every step |
| Pause/Resume/Stop | ❌ None | ✅ Full control |
| Error Recovery | ❌ None | ✅ Retry logic |
| Human-in-the-Loop | ❌ None | ✅ Ask for help |
| State Management | ❌ Stateless | ✅ Full history |
| MCP Integration | ❌ None | ✅ Extensible |
| Docker/VNC | ❌ None | ✅ Production-ready |
| UI | ❌ API only | ✅ Dashboard |
| History/GIF | ❌ None | ✅ Full recording |
| LLM Providers | ❌ Limited | ✅ 15+ providers |
| Anti-Detection | ❌ Basic | ✅ Chrome args |

---

## 🚀 Quick Start Commands

```bash
# 1. Install browser-use
npm install browser-use @playwright/test

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Set environment variables
export OPENAI_API_KEY=your_key_here
# or
export ANTHROPIC_API_KEY=your_key_here

# 4. Run locally
npm run dev

# 5. Run with Docker
docker compose up --build

# 6. Access services
# - API: http://localhost:3000
# - Dashboard: http://localhost:3000/dashboard
# - VNC: http://localhost:6080/vnc.html
```

---

## 📁 File Structure

```
src/
├── agents/
│   ├── browserAgent.ts          # Core browser agent service
│   ├── agentManager.ts          # Agent lifecycle management
│   └── index.ts                 # Exports
├── api/
│   └── routes/
│       └── browserAgent.ts      # REST API endpoints
├── browser/
│   └── engine.ts                # Existing (can be deprecated)
├── computer-use/
│   ├── orchestrator.ts          # Refactor to use browserAgent
│   ├── digitalOperator.ts       # Refactor to use browserAgent
│   └── types.ts                 # Update types
frontend/
└── dashboard/
    └── src/
        └── components/
            └── BrowserAgent.tsx  # Dashboard UI
Dockerfile                        # Production container
docker-compose.yml                # Multi-service setup
supervisord.conf                  # Process management
```

---

## ✅ Implementation Checklist

### Week 1: Core Integration
- [ ] Install browser-use package
- [ ] Create BrowserAgentService
- [ ] Create AgentManager
- [ ] Write unit tests
- [ ] Test with OpenAI/Anthropic

### Week 2: API Integration
- [ ] Create REST API endpoints
- [ ] Add WebSocket support for real-time updates
- [ ] Integrate with existing API server
- [ ] Write API tests

### Week 3: Docker & Infrastructure
- [ ] Create Dockerfile
- [ ] Create docker-compose.yml
- [ ] Set up supervisord
- [ ] Configure VNC/noVNC
- [ ] Test container deployment

### Week 4: Frontend & Polish
- [ ] Create React dashboard
- [ ] Add real-time status updates
- [ ] Add VNC viewer integration
- [ ] Write documentation
- [ ] Performance optimization

---

## 🎯 Success Metrics

1. **Agent Loop**: Executes tasks step-by-step with vision
2. **Error Recovery**: Handles failures gracefully with retries
3. **Human-in-the-Loop**: Can ask for help when stuck
4. **State Management**: Tracks history and can resume
5. **Production Ready**: Docker deployment with VNC monitoring
6. **Extensible**: MCP integration for custom tools

---

## 💡 Next Steps

1. **Review this plan** with your team
2. **Approve the approach** (browser-use TypeScript)
3. **Switch to Code mode** to start implementation
4. **Begin with Phase 1** (Core Integration)

This plan provides a clear path from your current proof-of-concept to a production-grade browser automation system.
