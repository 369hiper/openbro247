import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Logger } from '../../utils/logger';
import { ModelRouter } from '../../models/modelRouter';
import { PermissionManager } from '../permissions/permissionManager';
import { ExecutionLogger } from '../../computer-use/executionLogger';
import { MCPToolRegistry } from '../../mcp/toolRegistry';

// ============================================================================
// MULTI-AGENT PARALLEL ORCHESTRATION SYSTEM
// ============================================================================

/**
 * Agent role types
 */
export type AgentRole =
  | 'browser' // Chrome browser automation (can have multiple)
  | 'computer' // Physical computer control (SINGLE ONLY)
  | 'app_builder' // App creation and management
  | 'researcher' // Internet research
  | 'coder' // Code generation
  | 'tester'; // Testing and QA

/**
 * Agent instance configuration
 */
export interface AgentInstance {
  id: string;
  name: string;
  role: AgentRole;
  status: 'idle' | 'running' | 'paused' | 'error' | 'completed';
  modelConfig: ModelConfig;
  permissions: string[];
  currentTask?: AgentTask;
  taskQueue: AgentTask[];
  results: TaskResult[];
  logs: AgentLogEntry[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  stats: AgentStats;
  metadata: Record<string, any>;
}

/**
 * Model configuration per agent
 */
export interface ModelConfig {
  provider: 'openrouter' | 'openai' | 'anthropic' | 'google' | 'local';
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  parameters: {
    temperature: number;
    maxTokens: number;
    topP?: number;
  };
}

/**
 * Task for an agent
 */
export interface AgentTask {
  id: string;
  agentId: string;
  goal: string;
  steps: TaskStep[];
  currentStep: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'interrupted';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  interruptRequested?: boolean;
  correctionRequest?: CorrectionRequest;
}

/**
 * Task step
 */
export interface TaskStep {
  id: string;
  order: number;
  description: string;
  action: string;
  params: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  thought?: string; // Agent's thinking process
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Correction request (interrupt and correct)
 */
export interface CorrectionRequest {
  id: string;
  taskId: string;
  stepId?: string;
  correction: string;
  originalThought?: string;
  appliedAt: Date;
  appliedBy: string;
}

/**
 * Task result
 */
export interface TaskResult {
  taskId: string;
  success: boolean;
  data: any;
  duration: number;
  completedAt: Date;
}

/**
 * Real-time log entry
 */
export interface AgentLogEntry {
  id: string;
  agentId: string;
  taskId?: string;
  stepId?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: 'thought' | 'action' | 'result' | 'error' | 'system';
  message: string;
  data?: any;
  timestamp: Date;
}

/**
 * Agent statistics
 */
export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  stepsCompleted: number;
  errorsEncountered: number;
  totalRuntime: number;
  lastActivityAt?: Date;
}

/**
 * Browser tab assignment for browser agents
 */
export interface BrowserTabAssignment {
  agentId: string;
  tabId: string;
  url: string;
  title: string;
  isActive: boolean;
  lastActivityAt: Date;
}

/**
 * Master agent lock (only one computer agent at a time)
 */
interface ComputerAgentLock {
  agentId: string;
  lockedAt: Date;
  expiresAt: Date;
}

/**
 * MultiAgentOrchestrator - Manages parallel agent execution
 */
export class MultiAgentOrchestrator extends EventEmitter {
  private agents: Map<string, AgentInstance> = new Map();
  private tasks: Map<string, AgentTask> = new Map();
  private logs: AgentLogEntry[] = [];
  private browserTabs: Map<string, BrowserTabAssignment> = new Map();
  private computerLock: ComputerAgentLock | null = null;

  private wsClients: Map<string, WebSocket> = new Map();
  private modelRouter: ModelRouter;
  private permissionManager: PermissionManager;
  private executionLogger: ExecutionLogger;
  private toolRegistry: MCPToolRegistry;
  private logger: Logger;

  private maxParallelAgents: number = 10;
  private maxBrowserAgents: number = 5;
  private isRunning: boolean = false;

  constructor(
    modelRouter: ModelRouter,
    permissionManager: PermissionManager,
    executionLogger: ExecutionLogger,
    toolRegistry: MCPToolRegistry
  ) {
    super();
    this.modelRouter = modelRouter;
    this.permissionManager = permissionManager;
    this.executionLogger = executionLogger;
    this.toolRegistry = toolRegistry;
    this.logger = new Logger('MultiAgentOrchestrator');
  }

  /**
   * Initialize the multi-agent orchestrator
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Multi-Agent Orchestrator...');
    this.isRunning = true;

    // Create default agents
    await this.createDefaultAgents();

    this.logger.info(`Multi-Agent Orchestrator initialized with ${this.agents.size} agents`);
  }

  /**
   * Create default agent pool
   */
  private async createDefaultAgents(): Promise<void> {
    // Browser agents (can have multiple, each in different tab)
    for (let i = 0; i < 3; i++) {
      await this.createAgent({
        name: `Browser-Agent-${i + 1}`,
        role: 'browser',
        modelConfig: {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.7, maxTokens: 4096 },
        },
        permissions: ['browser'],
      });
    }

    // Computer agent (SINGLE ONLY)
    await this.createAgent({
      name: 'Computer-Master',
      role: 'computer',
      modelConfig: {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-5-sonnet',
        parameters: { temperature: 0.5, maxTokens: 4096 },
      },
      permissions: ['computer', 'camera', 'terminal'],
    });

    // App builder agents (can have multiple)
    for (let i = 0; i < 2; i++) {
      await this.createAgent({
        name: `App-Builder-${i + 1}`,
        role: 'app_builder',
        modelConfig: {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.7, maxTokens: 8192 },
        },
        permissions: ['terminal', 'file_system', 'network'],
      });
    }

    // Research agent
    await this.createAgent({
      name: 'Research-Agent',
      role: 'researcher',
      modelConfig: {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-5-sonnet',
        parameters: { temperature: 0.5, maxTokens: 4096 },
      },
      permissions: ['browser', 'network'],
    });

    // Coder agent
    await this.createAgent({
      name: 'Code-Agent',
      role: 'coder',
      modelConfig: {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-5-sonnet',
        parameters: { temperature: 0.3, maxTokens: 8192 },
      },
      permissions: ['terminal', 'file_system'],
    });

    // Tester agent
    await this.createAgent({
      name: 'Test-Agent',
      role: 'tester',
      modelConfig: {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-5-sonnet',
        parameters: { temperature: 0.2, maxTokens: 4096 },
      },
      permissions: ['terminal', 'browser', 'file_system'],
    });
  }

  // ============================================================================
  // AGENT MANAGEMENT
  // ============================================================================

  /**
   * Create a new agent
   */
  async createAgent(config: {
    name: string;
    role: AgentRole;
    modelConfig: ModelConfig;
    permissions: string[];
  }): Promise<AgentInstance> {
    // Check computer agent limit
    if (config.role === 'computer') {
      const existingComputer = Array.from(this.agents.values()).find(a => a.role === 'computer');
      if (existingComputer) {
        throw new Error('Computer agent already exists. Only one computer agent allowed.');
      }
    }

    // Check browser agent limit
    if (config.role === 'browser') {
      const browserCount = Array.from(this.agents.values()).filter(
        a => a.role === 'browser'
      ).length;
      if (browserCount >= this.maxBrowserAgents) {
        throw new Error(`Maximum browser agents (${this.maxBrowserAgents}) reached.`);
      }
    }

    const agent: AgentInstance = {
      id: uuidv4(),
      name: config.name,
      role: config.role,
      status: 'idle',
      modelConfig: config.modelConfig,
      permissions: config.permissions,
      taskQueue: [],
      results: [],
      logs: [],
      createdAt: new Date(),
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        stepsCompleted: 0,
        errorsEncountered: 0,
        totalRuntime: 0,
      },
      metadata: {},
    };

    this.agents.set(agent.id, agent);
    this.logger.info(`Created agent: ${agent.name} (${agent.role})`);
    this.broadcastEvent('agent:created', agent);

    return agent;
  }

  /**
   * Update agent model configuration
   */
  async updateAgentModel(agentId: string, modelConfig: Partial<ModelConfig>): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    agent.modelConfig = { ...agent.modelConfig, ...modelConfig };
    this.logger.info(
      `Updated model for agent ${agent.name}: ${agent.modelConfig.provider}/${agent.modelConfig.modelId}`
    );
    this.broadcastEvent('agent:model_updated', { agentId, modelConfig: agent.modelConfig });
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agents by role
   */
  getAgentsByRole(role: AgentRole): AgentInstance[] {
    return Array.from(this.agents.values()).filter(a => a.role === role);
  }

  /**
   * Get available browser agents
   */
  getAvailableBrowserAgents(): AgentInstance[] {
    return Array.from(this.agents.values()).filter(
      a => a.role === 'browser' && a.status === 'idle'
    );
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    if (agent.status === 'running') {
      throw new Error('Cannot delete running agent. Stop it first.');
    }

    this.agents.delete(agentId);
    this.logger.info(`Deleted agent: ${agent.name}`);
    this.broadcastEvent('agent:deleted', { agentId });
  }

  // ============================================================================
  // TASK EXECUTION (PARALLEL)
  // ============================================================================

  /**
   * Assign a task to an agent
   */
  async assignTask(
    agentId: string,
    goal: string,
    priority: AgentTask['priority'] = 'medium'
  ): Promise<AgentTask> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    // Check computer lock for computer agents
    if (agent.role === 'computer') {
      if (this.computerLock && this.computerLock.agentId !== agentId) {
        if (this.computerLock.expiresAt > new Date()) {
          throw new Error(`Computer is locked by agent ${this.computerLock.agentId}`);
        }
      }
    }

    const task: AgentTask = {
      id: uuidv4(),
      agentId,
      goal,
      steps: [],
      currentStep: 0,
      status: 'pending',
      priority,
      createdAt: new Date(),
    };

    agent.taskQueue.push(task);
    this.tasks.set(task.id, task);

    this.logger.info(`Task assigned to ${agent.name}: ${goal}`);
    this.broadcastEvent('task:assigned', { agentId, task });

    // Start processing if agent is idle
    if (agent.status === 'idle') {
      this.processAgentQueue(agentId);
    }

    return task;
  }

  /**
   * Submit a task and let the orchestrator pick the best agent
   */
  async submitTask(
    goal: string,
    options: {
      role?: AgentRole;
      priority?: AgentTask['priority'];
      preferredModel?: string;
    } = {}
  ): Promise<{ taskId: string; agentId: string }> {
    // Find best agent
    let agent: AgentInstance | undefined;

    if (options.role) {
      // Find available agent with specific role
      const candidates = Array.from(this.agents.values()).filter(
        a => a.role === options.role && a.status === 'idle'
      );
      agent = candidates[0];
    } else {
      // Find any available agent
      agent = Array.from(this.agents.values()).find(a => a.status === 'idle');
    }

    if (!agent) {
      throw new Error('No available agents. All agents are busy.');
    }

    const task = await this.assignTask(agent.id, goal, options.priority);
    return { taskId: task.id, agentId: agent.id };
  }

  /**
   * Process agent's task queue
   */
  private async processAgentQueue(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== 'idle') return;

    const task = agent.taskQueue.shift();
    if (!task) {
      agent.status = 'idle';
      return;
    }

    // Acquire computer lock if needed
    if (agent.role === 'computer') {
      this.computerLock = {
        agentId: agent.id,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      };
    }

    agent.status = 'running';
    agent.currentTask = task;
    task.status = 'running';
    task.startedAt = new Date();

    this.broadcastEvent('task:started', { agentId, taskId: task.id });

    try {
      // Generate plan using agent's model
      await this.generateTaskPlan(agent, task);

      // Execute steps
      await this.executeTaskSteps(agent, task);

      // Complete task
      task.status = 'completed';
      task.completedAt = new Date();
      agent.stats.tasksCompleted++;
      agent.results.push({
        taskId: task.id,
        success: true,
        data: task.result,
        duration: task.completedAt.getTime() - task.startedAt!.getTime(),
        completedAt: task.completedAt,
      });

      this.broadcastEvent('task:completed', { agentId, taskId: task.id, result: task.result });
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.completedAt = new Date();
      agent.stats.tasksFailed++;
      agent.stats.errorsEncountered++;

      this.addLog(agent.id, 'error', 'error', `Task failed: ${task.error}`);
      this.broadcastEvent('task:failed', { agentId, taskId: task.id, error: task.error });
    } finally {
      agent.currentTask = undefined;
      agent.status = 'idle';
      agent.completedAt = new Date();

      // Release computer lock
      if (agent.role === 'computer') {
        this.computerLock = null;
      }

      // Process next task in queue
      if (agent.taskQueue.length > 0) {
        this.processAgentQueue(agentId);
      }
    }
  }

  /**
   * Generate task plan using agent's model
   */
  private async generateTaskPlan(agent: AgentInstance, task: AgentTask): Promise<void> {
    this.addLog(agent.id, 'system', 'info', `Generating plan for: ${task.goal}`);

    const systemPrompt = this.getAgentSystemPrompt(agent);
    const prompt = `Create a detailed execution plan for this goal:

GOAL: ${task.goal}

Available tools for ${agent.role}:
${this.getAgentTools(agent)}

Respond with JSON:
{
  "steps": [
    {
      "description": "Step description",
      "action": "tool_name",
      "params": { "key": "value" }
    }
  ]
}`;

    try {
      const response = await this.modelRouter.route(agent.id, agent.modelConfig, prompt, {
        systemMessage: systemPrompt,
      });

      const parsed = this.parsePlanResponse(response);

      task.steps = parsed.steps.map((step: any, index: number) => ({
        id: uuidv4(),
        order: index + 1,
        description: step.description,
        action: step.action,
        params: step.params || {},
        status: 'pending',
      }));

      this.addLog(agent.id, 'system', 'info', `Plan generated with ${task.steps.length} steps`);
      this.broadcastEvent('task:plan_generated', {
        agentId: agent.id,
        taskId: task.id,
        steps: task.steps,
      });
    } catch (error) {
      throw new Error(`Failed to generate plan: ${error}`);
    }
  }

  /**
   * Execute task steps
   */
  private async executeTaskSteps(agent: AgentInstance, task: AgentTask): Promise<void> {
    for (let i = task.currentStep; i < task.steps.length; i++) {
      const step = task.steps[i];

      // Check for interrupt request
      if (task.interruptRequested) {
        this.addLog(agent.id, 'system', 'warn', 'Task interrupted by user');

        // Apply correction if provided
        if (task.correctionRequest) {
          await this.applyCorrection(agent, task, task.correctionRequest);
          task.interruptRequested = false;
          task.correctionRequest = undefined;
        } else {
          task.status = 'interrupted';
          return;
        }
      }

      step.status = 'running';
      step.startedAt = new Date();
      task.currentStep = i;

      this.addLog(agent.id, 'action', 'info', `Step ${step.order}: ${step.description}`);
      this.broadcastEvent('step:started', { agentId: agent.id, taskId: task.id, step });

      try {
        const result = await this.executeStep(agent, step);

        step.status = 'completed';
        step.result = result;
        step.completedAt = new Date();
        agent.stats.stepsCompleted++;

        this.addLog(agent.id, 'result', 'info', `Step ${step.order} completed`);
        this.broadcastEvent('step:completed', { agentId: agent.id, taskId: task.id, step, result });
      } catch (error) {
        step.status = 'failed';
        step.completedAt = new Date();
        throw error;
      }
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(agent: AgentInstance, step: TaskStep): Promise<any> {
    // Check permission
    const permissionType = this.getPermissionForAction(step.action);
    if (permissionType) {
      const { permitted } = await this.permissionManager.checkPermission(
        permissionType as any,
        step.action,
        step.params
      );
      if (!permitted) {
        throw new Error(`Permission denied for ${step.action}`);
      }
    }

    // Execute using tool registry or direct handler
    try {
      const result = await this.toolRegistry.executeTool(step.action, step.params);
      return result;
    } catch (error) {
      // Throw error if tool execution fails
      throw error;
    }
  }

  /**
   * Apply user correction to a task
   */
  private async applyCorrection(
    agent: AgentInstance,
    task: AgentTask,
    correction: CorrectionRequest
  ): Promise<void> {
    this.addLog(agent.id, 'system', 'info', `Applying correction: ${correction.correction}`);

    // Generate new plan from correction point
    const systemPrompt = this.getAgentSystemPrompt(agent);
    const prompt = `A user has interrupted and provided a correction. Continue from where you were.

ORIGINAL GOAL: ${task.goal}
COMPLETED STEPS: ${task.steps
      .filter(s => s.status === 'completed')
      .map(s => s.description)
      .join('\n')}
CURRENT STEP: ${task.steps[task.currentStep]?.description}
USER CORRECTION: ${correction.correction}

Create new steps to continue from here. Respond with JSON:
{
  "steps": [
    {
      "description": "Step description",
      "action": "tool_name",
      "params": {}
    }
  ]
}`;

    try {
      const response = await this.modelRouter.route(agent.id, agent.modelConfig, prompt, {
        systemMessage: systemPrompt,
      });

      const parsed = this.parsePlanResponse(response);

      // Replace remaining steps
      const remainingSteps: TaskStep[] = parsed.steps.map((step: any, index: number) => ({
        id: uuidv4(),
        order: task.currentStep + index + 1,
        description: step.description,
        action: step.action,
        params: step.params || {},
        status: 'pending',
      }));

      task.steps = [...task.steps.slice(0, task.currentStep), ...remainingSteps];
    } catch (error) {
      throw new Error(`Failed to apply correction: ${error}`);
    }
  }

  // ============================================================================
  // INTERRUPT & CORRECT
  // ============================================================================

  /**
   * Request interrupt for a running task
   */
  async requestInterrupt(
    taskId: string,
    correction?: {
      correction: string;
      appliedBy: string;
    }
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') {
      throw new Error(`Task not found or not running: ${taskId}`);
    }

    task.interruptRequested = true;

    if (correction) {
      const agent = this.agents.get(task.agentId);
      task.correctionRequest = {
        id: uuidv4(),
        taskId,
        correction: correction.correction,
        originalThought: agent?.currentTask?.steps[agent.currentTask.currentStep]?.thought,
        appliedAt: new Date(),
        appliedBy: correction.appliedBy,
      };
    }

    this.logger.info(`Interrupt requested for task: ${taskId}`);
    this.broadcastEvent('task:interrupt_requested', { taskId, hasCorrection: !!correction });
  }

  // ============================================================================
  // BROWSER AGENT MANAGEMENT
  // ============================================================================

  /**
   * Assign browser tab to agent
   */
  assignBrowserTab(agentId: string, tabId: string, url: string): void {
    const agent = this.agents.get(agentId);
    if (!agent || agent.role !== 'browser') {
      throw new Error('Agent must be a browser agent');
    }

    this.browserTabs.set(tabId, {
      agentId,
      tabId,
      url,
      title: '',
      isActive: true,
      lastActivityAt: new Date(),
    });

    this.logger.info(`Browser tab ${tabId} assigned to ${agent.name}`);
    this.broadcastEvent('browser:tab_assigned', { agentId, tabId, url });
  }

  /**
   * Get browser tab assignments
   */
  getBrowserTabs(): BrowserTabAssignment[] {
    return Array.from(this.browserTabs.values());
  }

  /**
   * Get tabs for specific agent
   */
  getAgentBrowserTabs(agentId: string): BrowserTabAssignment[] {
    return Array.from(this.browserTabs.values()).filter(t => t.agentId === agentId);
  }

  // ============================================================================
  // REAL-TIME LOGS
  // ============================================================================

  /**
   * Add log entry
   */
  addLog(
    agentId: string,
    category: AgentLogEntry['category'],
    level: AgentLogEntry['level'],
    message: string,
    data?: any
  ): void {
    const log: AgentLogEntry = {
      id: uuidv4(),
      agentId,
      taskId: this.agents.get(agentId)?.currentTask?.id,
      level,
      category,
      message,
      data,
      timestamp: new Date(),
    };

    this.logs.push(log);
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.logs.push(log);
    }

    // Keep last 10000 logs
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-10000);
    }

    // Broadcast to WebSocket clients
    this.broadcastEvent('log:new', log);
  }

  /**
   * Get logs for agent
   */
  getAgentLogs(agentId: string, limit: number = 100): AgentLogEntry[] {
    const agent = this.agents.get(agentId);
    return agent?.logs.slice(-limit) || [];
  }

  /**
   * Get all logs
   */
  getAllLogs(limit: number = 500): AgentLogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get logs for task
   */
  getTaskLogs(taskId: string): AgentLogEntry[] {
    return this.logs.filter(l => l.taskId === taskId);
  }

  // ============================================================================
  // WEBSOCKET REAL-TIME COMMUNICATION
  // ============================================================================

  /**
   * Register WebSocket client
   */
  registerWebSocketClient(clientId: string, ws: WebSocket): void {
    this.wsClients.set(clientId, ws);
    this.logger.info(`WebSocket client registered: ${clientId}`);

    // Send current state
    ws.send(
      JSON.stringify({
        type: 'state',
        data: {
          agents: this.getAllAgents(),
          tasks: Array.from(this.tasks.values()),
          browserTabs: this.getBrowserTabs(),
        },
      })
    );

    ws.on('close', () => {
      this.wsClients.delete(clientId);
      this.logger.info(`WebSocket client disconnected: ${clientId}`);
    });

    ws.on('message', (message: any) => {
      try {
        const parsed = JSON.parse(message.toString());
        this.handleWebSocketMessage(clientId, parsed);
      } catch (error) {
        this.logger.error('Failed to parse WebSocket message', error);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleWebSocketMessage(
    clientId: string,
    message: { type: string; data: any }
  ): Promise<void> {
    switch (message.type) {
      case 'interrupt':
        await this.requestInterrupt(message.data.taskId, message.data.correction);
        break;

      case 'update_model':
        await this.updateAgentModel(message.data.agentId, message.data.modelConfig);
        break;

      case 'pause_agent':
        const pauseAgent = this.agents.get(message.data.agentId);
        if (pauseAgent) pauseAgent.status = 'paused';
        break;

      case 'resume_agent':
        const resumeAgent = this.agents.get(message.data.agentId);
        if (resumeAgent && resumeAgent.status === 'paused') {
          resumeAgent.status = 'idle';
          this.processAgentQueue(resumeAgent.id);
        }
        break;

      case 'get_logs':
        const logs = this.getAgentLogs(message.data.agentId, message.data.limit);
        this.sendToClient(clientId, 'logs', { agentId: message.data.agentId, logs });
        break;
    }
  }

  /**
   * Broadcast event to all WebSocket clients
   */
  broadcastEvent(eventType: string, data: any): void {
    const message = JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() });

    for (const [clientId, ws] of this.wsClients) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      } catch (error) {
        this.logger.warn(`Failed to send to client ${clientId}`);
      }
    }
  }

  /**
   * Send to specific client
   */
  sendToClient(clientId: string, eventType: string, data: any): void {
    const ws = this.wsClients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() }));
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getAgentSystemPrompt(agent: AgentInstance): string {
    const prompts: Record<AgentRole, string> = {
      browser: `You are a browser automation agent. You control Chrome browser tabs.
You can navigate, click, type, take screenshots, and extract content.
Always think step by step and describe what you're doing.`,

      computer: `You are the master computer agent. You control the physical computer.
You can type, click, open applications, take screenshots.
Be careful - you are the ONLY computer agent. Use your access wisely.`,

      app_builder: `You are an app builder agent. You create, build, run, and test applications.
You can write code, install dependencies, start servers, and run tests.
Create production-ready applications with proper error handling.`,

      researcher: `You are a research agent. You browse the internet to gather information.
Search the web, fetch URLs, extract content, and compile findings.
Be thorough and cite your sources.`,

      coder: `You are a code agent. You write, edit, and refactor code.
Follow best practices, add comments, and ensure code quality.
Test your code before submitting.`,

      tester: `You are a testing agent. You test applications and report issues.
Run unit tests, integration tests, and visual tests.
Provide detailed bug reports with reproduction steps.`,
    };

    return prompts[agent.role];
  }

  private getAgentTools(agent: AgentInstance): string {
    const toolSets: Record<AgentRole, string[]> = {
      browser: [
        'browser_navigate',
        'browser_click',
        'browser_type',
        'browser_screenshot',
        'browser_extract_text',
      ],
      computer: ['computer_type', 'computer_click', 'computer_open_app', 'computer_screenshot'],
      app_builder: [
        'code_write',
        'code_edit',
        'run_command',
        'npm_install',
        'run_server',
        'test_app',
      ],
      researcher: ['web_search', 'web_fetch', 'browser_navigate', 'browser_screenshot'],
      coder: ['code_write', 'code_edit', 'code_read', 'run_command', 'run_tests'],
      tester: ['run_command', 'run_tests', 'browser_navigate', 'browser_screenshot', 'code_write'],
    };

    return toolSets[agent.role].map(t => `- ${t}`).join('\n');
  }

  private getPermissionForAction(action: string): string | null {
    const permissionMap: Record<string, string> = {
      browser_navigate: 'browser',
      browser_click: 'browser',
      browser_type: 'browser',
      browser_screenshot: 'browser',
      computer_type: 'computer',
      computer_click: 'computer',
      computer_screenshot: 'camera',
      run_command: 'terminal',
      code_write: 'file_system',
      code_edit: 'file_system',
      web_fetch: 'network',
    };

    return permissionMap[action] || null;
  }

  private parsePlanResponse(response: string): any {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').replace(/```\s*$/g, '');
    }
    try {
      return JSON.parse(jsonStr);
    } catch {
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Failed to parse plan response');
    }
  }

  /**
   * Get orchestrator stats
   */
  getStats(): {
    totalAgents: number;
    runningAgents: number;
    idleAgents: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    browserAgents: number;
    computerAgentLocked: boolean;
  } {
    const agents = Array.from(this.agents.values());
    const tasks = Array.from(this.tasks.values());

    return {
      totalAgents: agents.length,
      runningAgents: agents.filter(a => a.status === 'running').length,
      idleAgents: agents.filter(a => a.status === 'idle').length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      browserAgents: agents.filter(a => a.role === 'browser').length,
      computerAgentLocked: !!this.computerLock,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let _multiAgentOrchestrator: MultiAgentOrchestrator | null = null;

export function getMultiAgentOrchestrator(
  modelRouter: ModelRouter,
  permissionManager: PermissionManager,
  executionLogger: ExecutionLogger,
  toolRegistry: MCPToolRegistry
): MultiAgentOrchestrator {
  if (!_multiAgentOrchestrator) {
    _multiAgentOrchestrator = new MultiAgentOrchestrator(
      modelRouter,
      permissionManager,
      executionLogger,
      toolRegistry
    );
  }
  return _multiAgentOrchestrator;
}
