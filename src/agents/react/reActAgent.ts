// ============================================================================
// REAGENT - ReAct Agent with Tool Execution (Web-UI Style)
// ============================================================================
// Implements the ReAct (Reasoning + Acting) loop inspired by web-ui's BrowserUseAgent

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import { ModelRouter } from '../../models/modelRouter';
import { ModelConfig } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent action - what the agent wants to do
 */
export interface AgentAction {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  thought: string;
  timestamp: Date;
}

/**
 * Agent observation - result of an action
 */
export interface AgentObservation {
  actionId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

/**
 * Agent step - action + observation pair
 */
export interface AgentStep {
  index: number;
  action: AgentAction;
  observation: AgentObservation;
  timestamp: Date;
}

/**
 * Agent history - complete execution record
 */
export interface AgentHistory {
  id: string;
  task: string;
  steps: AgentStep[];
  status: 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  startedAt: Date;
  completedAt?: Date;
  finalResult?: string;
  error?: string;
}

/**
 * Agent state - current state of the agent
 */
export interface AgentState {
  id: string;
  task: string;
  step: number;
  maxSteps: number;
  history: AgentHistory;
  context: Record<string, unknown>;
  consecutiveFailures: number;
  maxFailures: number;
}

/**
 * Tool definition
 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Agent configuration
 */
export interface ReActAgentConfig {
  task: string;
  modelConfig: ModelConfig;
  maxSteps?: number;
  maxFailures?: number;
  tools?: Tool[];
  systemPrompt?: string;
  useContext?: boolean;
  autoStop?: boolean;
}

// ============================================================================
// ReActAgent - Core Agent Implementation
// ============================================================================

/**
 * ReAct Agent implementing the Reasoning-Action loop
 * Based on web-ui's BrowserUseAgent pattern
 */
export class ReActAgent extends EventEmitter {
  private logger: Logger;
  private modelRouter: ModelRouter;
  private config: ReActAgentConfig;
  private state: AgentState;
  private tools: Map<string, Tool> = new Map();
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private shouldStop: boolean = false;

  constructor(modelRouter: ModelRouter, config: ReActAgentConfig) {
    super();
    this.logger = new Logger(`ReActAgent-${config.task.slice(0, 20)}`);
    this.modelRouter = modelRouter;
    this.config = config;

    // Initialize state
    this.state = {
      id: uuidv4(),
      task: config.task,
      step: 0,
      maxSteps: config.maxSteps ?? 50,
      history: {
        id: uuidv4(),
        task: config.task,
        steps: [],
        status: 'running',
        startedAt: new Date(),
      },
      context: {},
      consecutiveFailures: 0,
      maxFailures: config.maxFailures ?? 5,
    };

    // Register tools
    for (const tool of config.tools ?? []) {
      this.registerTool(tool);
    }
  }

  /**
   * Register a tool for the agent to use
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Get list of available tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Run the agent (main execution loop)
   */
  async run(): Promise<AgentHistory> {
    if (this.isRunning) {
      throw new Error('Agent is already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.state.history.status = 'running';

    this.logger.info(`Starting agent execution for task: ${this.config.task}`);
    this.emit('start', this.state);

    try {
      while (
        this.state.step < this.state.maxSteps &&
        !this.shouldStop &&
        this.state.consecutiveFailures < this.state.maxFailures
      ) {
        // Handle pause
        while (this.isPaused && !this.shouldStop) {
          await this.sleep(100);
        }

        if (this.shouldStop) {
          this.logger.info('Agent stopped by request');
          this.state.history.status = 'stopped';
          break;
        }

        // Execute step
        await this.executeStep();

        // Check if task is complete
        if (await this.isTaskComplete()) {
          this.logger.info('Task completed successfully');
          this.state.history.status = 'completed';
          this.state.history.completedAt = new Date();
          break;
        }

        this.state.step++;
      }

      // Handle failure cases
      if (this.state.consecutiveFailures >= this.state.maxFailures) {
        this.logger.error('Max consecutive failures reached');
        this.state.history.status = 'failed';
        this.state.history.error = 'Max consecutive failures reached';
      }

      if (this.state.step >= this.state.maxSteps) {
        this.logger.warn('Max steps reached without completing task');
        this.state.history.status = 'failed';
        this.state.history.error = 'Max steps reached';
      }
    } catch (error) {
      this.logger.error('Agent execution failed', error);
      this.state.history.status = 'failed';
      this.state.history.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.isRunning = false;
      this.emit('end', this.state.history);
    }

    return this.state.history;
  }

  /**
   * Execute a single step of the agent
   */
  private async executeStep(): Promise<void> {
    this.logger.info(`Step ${this.state.step + 1}/${this.state.maxSteps}`);
    this.emit('stepStart', this.state);

    const startTime = Date.now();

    try {
      // 1. Observe current state (take screenshot, get context, etc.)
      const observation = await this.observe();

      // 2. Reason about what to do next
      const action = await this.reason(observation);

      // 3. Execute the action
      const result = await this.act(action);

      // 4. Record step
      const step: AgentStep = {
        index: this.state.step,
        action,
        observation: {
          actionId: action.id,
          success: result.success,
          data: result.data,
          error: result.error,
          duration: Date.now() - startTime,
        },
        timestamp: new Date(),
      };

      this.state.history.steps.push(step);

      // Update failure count
      if (result.success) {
        this.state.consecutiveFailures = 0;
      } else {
        this.state.consecutiveFailures++;
      }

      // Update context with results
      this.state.context = {
        ...this.state.context,
        lastAction: action,
        lastResult: result,
      };

      this.emit('stepEnd', step);
    } catch (error) {
      this.logger.error(`Step ${this.state.step} failed`, error);
      this.state.consecutiveFailures++;

      const errorStep: AgentStep = {
        index: this.state.step,
        action: {
          id: uuidv4(),
          tool: 'error',
          params: {},
          thought: 'Error during step execution',
          timestamp: new Date(),
        },
        observation: {
          actionId: '',
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        },
        timestamp: new Date(),
      };

      this.state.history.steps.push(errorStep);
    }
  }

  /**
   * Observe current state
   */
  private async observe(): Promise<string> {
    const observations: string[] = [];

    // Add current step info
    observations.push(`Current step: ${this.state.step + 1}/${this.state.maxSteps}`);

    // Add context if enabled
    if (this.config.useContext) {
      observations.push(`Context: ${JSON.stringify(this.state.context)}`);
    }

    // Add recent history
    const recentSteps = this.state.history.steps.slice(-3);
    if (recentSteps.length > 0) {
      observations.push('Recent actions:');
      for (const step of recentSteps) {
        observations.push(
          `  - ${step.action.tool}: ${step.observation.success ? 'Success' : 'Failed'}`
        );
      }
    }

    return observations.join('\n');
  }

  /**
   * Reason about what action to take
   */
  private async reason(observation: string): Promise<AgentAction> {
    const toolList = Array.from(this.tools.values())
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    const systemPrompt =
      this.config.systemPrompt ||
      `You are an autonomous AI agent tasked with completing: ${this.config.task}

You have access to the following tools:
${toolList}

Based on your observation and task goal, decide on the next action to take.

IMPORTANT: Respond with a JSON object containing:
- "thought": Your reasoning about what to do next
- "tool": The name of the tool to use (or "done" if task is complete)
- "params": Parameters for the tool (if applicable)

Example response:
{
  "thought": "I need to navigate to the website to begin the task",
  "tool": "browser_navigate",
  "params": { "url": "https://example.com" }
}

If the task is complete, respond with:
{
  "thought": "Task is complete",
  "tool": "done",
  "params": {}
}`;

    const response = await this.modelRouter.route(
      `agent-${this.state.id}`,
      this.config.modelConfig,
      `Observation:\n${observation}\n\nWhat action should I take next?`,
      {
        systemMessage: systemPrompt,
        temperature: 0.7,
        maxTokens: 1000,
      }
    );

    // Parse response
    try {
      const parsed = JSON.parse(response);
      return {
        id: uuidv4(),
        tool: parsed.tool,
        params: parsed.params || {},
        thought: parsed.thought,
        timestamp: new Date(),
      };
    } catch (error) {
      // Fallback: try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          id: uuidv4(),
          tool: parsed.tool || 'error',
          params: parsed.params || {},
          thought: parsed.thought || 'Failed to parse response',
          timestamp: new Date(),
        };
      }

      throw new Error('Failed to parse agent response');
    }
  }

  /**
   * Execute the decided action
   */
  private async act(action: AgentAction): Promise<ToolResult> {
    // Handle "done" action
    if (action.tool === 'done') {
      this.state.history.finalResult = (action.params.result as string) || 'Task completed';
      return { success: true, data: { done: true } };
    }

    // Get tool
    const tool = this.tools.get(action.tool);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${action.tool}. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
      };
    }

    // Execute tool
    this.logger.debug(`Executing tool: ${action.tool}`, action.params);
    try {
      return await tool.handler(action.params);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if task is complete
   */
  private async isTaskComplete(): Promise<boolean> {
    const lastStep = this.state.history.steps[this.state.history.steps.length - 1];
    if (!lastStep) return false;

    // Check if last action was "done"
    if (lastStep.action.tool === 'done' && lastStep.observation.success) {
      return true;
    }

    // Check context for completion signals
    if (this.state.context.taskComplete === true) {
      return true;
    }

    return false;
  }

  /**
   * Pause the agent
   */
  pause(): void {
    this.isPaused = true;
    this.logger.info('Agent paused');
    this.emit('pause');
  }

  /**
   * Resume the agent
   */
  resume(): void {
    this.isPaused = false;
    this.logger.info('Agent resumed');
    this.emit('resume');
  }

  /**
   * Stop the agent
   */
  stop(): void {
    this.shouldStop = true;
    this.isPaused = false;
    this.logger.info('Agent stop requested');
    this.emit('stop');
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get agent history
   */
  getHistory(): AgentHistory {
    return { ...this.state.history };
  }

  /**
   * Get execution summary
   */
  getSummary(): {
    task: string;
    status: string;
    steps: number;
    duration: number;
    successfulActions: number;
    failedActions: number;
  } {
    const history = this.state.history;
    const duration = history.completedAt
      ? history.completedAt.getTime() - history.startedAt.getTime()
      : Date.now() - history.startedAt.getTime();

    const successfulActions = history.steps.filter(s => s.observation.success).length;
    const failedActions = history.steps.filter(s => !s.observation.success).length;

    return {
      task: history.task,
      status: history.status,
      steps: history.steps.length,
      duration,
      successfulActions,
      failedActions,
    };
  }

  /**
   * Utility: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// AgentFactory - Create agents with common tool sets
// ============================================================================

/**
 * Factory for creating agents with pre-configured tools
 */
export class AgentFactory {
  private modelRouter: ModelRouter;

  constructor(modelRouter: ModelRouter) {
    this.modelRouter = modelRouter;
  }

  /**
   * Create a browser automation agent (web-ui style)
   */
  createBrowserAgent(config: ReActAgentConfig): ReActAgent {
    const browserTools: Tool[] = [
      {
        name: 'browser_navigate',
        description: 'Navigate to a URL',
        parameters: {
          url: { type: 'string', description: 'The URL to navigate to', required: true },
        },
        handler: async params => {
          // Implementation would use BrowserEngine
          return { success: true, data: { navigated: params.url } };
        },
      },
      {
        name: 'browser_click',
        description: 'Click on an element by CSS selector',
        parameters: {
          selector: { type: 'string', description: 'CSS selector', required: true },
        },
        handler: async params => {
          return { success: true, data: { clicked: params.selector } };
        },
      },
      {
        name: 'browser_type',
        description: 'Type text into an input element',
        parameters: {
          selector: { type: 'string', description: 'CSS selector', required: true },
          text: { type: 'string', description: 'Text to type', required: true },
        },
        handler: async params => {
          return { success: true, data: { typed: params.text } };
        },
      },
      {
        name: 'take_screenshot',
        description: 'Take a screenshot of current page',
        parameters: {},
        handler: async () => {
          return { success: true, data: { screenshot: 'base64_data' } };
        },
      },
    ];

    const agent = new ReActAgent(this.modelRouter, {
      ...config,
      tools: [...(config.tools || []), ...browserTools],
    });

    return agent;
  }

  /**
   * Create a coding agent (Cline style)
   */
  createCodingAgent(config: ReActAgentConfig): ReActAgent {
    const codingTools: Tool[] = [
      {
        name: 'read_file',
        description: 'Read contents of a file',
        parameters: {
          path: { type: 'string', description: 'File path', required: true },
        },
        handler: async params => {
          const fs = await import('fs/promises');
          const content = await fs.readFile(params.path as string, 'utf-8');
          return { success: true, data: { content } };
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        parameters: {
          path: { type: 'string', description: 'File path', required: true },
          content: { type: 'string', description: 'File content', required: true },
        },
        handler: async params => {
          const fs = await import('fs/promises');
          await fs.writeFile(params.path as string, params.content as string, 'utf-8');
          return { success: true, data: { written: true } };
        },
      },
      {
        name: 'edit_file',
        description: 'Edit a file by replacing old text with new',
        parameters: {
          path: { type: 'string', description: 'File path', required: true },
          oldText: { type: 'string', description: 'Text to replace', required: true },
          newText: { type: 'string', description: 'Replacement text', required: true },
        },
        handler: async params => {
          const fs = await import('fs/promises');
          const content = await fs.readFile(params.path as string, 'utf-8');
          const updated = content.replace(params.oldText as string, params.newText as string);
          await fs.writeFile(params.path as string, updated, 'utf-8');
          return { success: true, data: { edited: true } };
        },
      },
      {
        name: 'run_command',
        description: 'Execute a shell command',
        parameters: {
          command: { type: 'string', description: 'Command to execute', required: true },
          cwd: { type: 'string', description: 'Working directory' },
        },
        handler: async params => {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          const result = await execAsync(params.command as string, { cwd: params.cwd as string });
          return { success: true, data: result };
        },
      },
    ];

    const agent = new ReActAgent(this.modelRouter, {
      ...config,
      tools: [...(config.tools || []), ...codingTools],
    });

    return agent;
  }
}
