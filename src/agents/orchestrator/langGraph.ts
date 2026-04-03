import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import { ModelRouter } from '../../models/modelRouter';
import { ExecutionLogger } from '../../computer-use/executionLogger';

// ============================================================================
// LANGGRAPH-STYLE STATE MACHINE ORCHESTRATION
// ============================================================================
import { ToolRegistry } from '../../skills/toolRegistry';
import { ComputerUseOrchestrator } from '../../computer-use/orchestrator';
import { EventEmitter } from 'events';

/**
 * Agent state that flows through the graph
 */
export interface AgentState {
  id: string;
  mode: AgentMode;
  goal: string;
  context: Record<string, any>;
  plan: ExecutionPlan | null;
  currentStep: number;
  results: StepResult[];
  errors: AgentError[];
  capabilities: string[];
  artifacts: Artifact[];
  metadata: Record<string, any>;
  status: 'idle' | 'planning' | 'executing' | 'waiting' | 'self_improving' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export type AgentMode = 'web' | 'code' | 'computer' | 'hybrid';

export interface ExecutionPlan {
  id: string;
  steps: PlanStep[];
  requiredCapabilities: string[];
  estimatedDuration: number;
}

export interface PlanStep {
  id: string;
  order: number;
  type: string;
  tool: string;
  params: Record<string, any>;
  description: string;
  retryable: boolean;
  maxRetries: number;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  toolUsed: string;
}

export interface AgentError {
  stepId: string;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

export interface Artifact {
  id: string;
  type: string;
  name: string;
  path: string;
  data?: any;
  createdAt: Date;
}

/**
 * Node in the state graph
 */
export interface GraphNode {
  id: string;
  type: 'start' | 'decision' | 'action' | 'end' | 'self_improve';
  label: string;
  handler: (state: AgentState) => Promise<AgentState>;
  transitions: GraphTransition[];
}

/**
 * Transition between nodes
 */
export interface GraphTransition {
  condition: (state: AgentState) => boolean;
  target: string;
  label?: string;
}

/**
 * LangGraph-style state machine orchestrator
 *
 * State flow:
 * START -> ANALYZE -> DECIDE_MODE -> EXECUTE ->
 *   (success) -> VERIFY -> NOTIFY -> END
 *   (failure) -> SELF_IMPROVE -> RETRY -> EXECUTE
 *                 (can't improve) -> NOTIFY -> END
 */
export class LangGraphOrchestrator {
  private nodes: Map<string, GraphNode> = new Map();
  private logger: Logger;
  private executionLogger: ExecutionLogger;
  private modelRouter: ModelRouter;
  private activeStates: Map<string, AgentState> = new Map();
  private toolRegistry?: ToolRegistry;
  private computerOrchestrator?: ComputerUseOrchestrator;
  public events: EventEmitter = new EventEmitter();

  constructor(
    modelRouter: ModelRouter,
    toolRegistry?: ToolRegistry,
    computerOrchestrator?: ComputerUseOrchestrator
  ) {
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.computerOrchestrator = computerOrchestrator;
    this.logger = new Logger('LangGraphOrchestrator');
    this.executionLogger = new ExecutionLogger();
    this.initializeGraph();
  }

  /**
   * Initialize the state graph with all nodes
   */
  private initializeGraph(): void {
    // START node
    this.addNode({
      id: 'start',
      type: 'start',
      label: 'Start Agent Execution',
      handler: async state => {
        this.executionLogger.plan('info', `Agent started: ${state.goal}`, undefined, undefined);
        state.status = 'planning';
        state.updatedAt = new Date();
        return state;
      },
      transitions: [{ condition: () => true, target: 'analyze', label: 'Begin' }],
    });

    // ANALYZE node - understand the goal
    this.addNode({
      id: 'analyze',
      type: 'action',
      label: 'Analyze Goal',
      handler: async state => {
        this.executionLogger.plan('info', 'Analyzing goal...', undefined, undefined);

        const analysis = await this.analyzeGoal(state.goal, state.context);
        state.context.analysis = analysis;
        state.capabilities = analysis.requiredCapabilities;
        state.updatedAt = new Date();

        return state;
      },
      transitions: [{ condition: () => true, target: 'decide_mode', label: 'Analysis complete' }],
    });

    // DECIDE_MODE node - determine which agent mode to use
    this.addNode({
      id: 'decide_mode',
      type: 'decision',
      label: 'Decide Agent Mode',
      handler: async state => {
        const mode = this.decideMode(state.context.analysis);
        state.mode = mode;
        this.executionLogger.plan('info', `Selected mode: ${mode}`, undefined, undefined);
        state.updatedAt = new Date();
        return state;
      },
      transitions: [
        { condition: s => s.mode === 'web', target: 'web_agent', label: 'Web Agent' },
        { condition: s => s.mode === 'code', target: 'code_agent', label: 'Code Agent' },
        {
          condition: s => s.mode === 'computer',
          target: 'computer_agent',
          label: 'Computer Agent',
        },
        { condition: s => s.mode === 'hybrid', target: 'hybrid_agent', label: 'Hybrid Agent' },
      ],
    });

    // WEB AGENT node
    this.addNode({
      id: 'web_agent',
      type: 'action',
      label: 'Execute Web Agent',
      handler: async state => {
        this.executionLogger.browser('info', 'Executing web agent tasks', undefined, undefined);
        state.status = 'executing';
        const result = await this.executeWebAgent(state);
        state.results.push(...result.results);
        state.artifacts.push(...result.artifacts);
        state.updatedAt = new Date();
        return state;
      },
      transitions: [
        { condition: s => s.results.every(r => r.success), target: 'verify', label: 'Success' },
        {
          condition: s => s.results.some(r => !r.success),
          target: 'handle_failure',
          label: 'Failure',
        },
      ],
    });

    // CODE AGENT node
    this.addNode({
      id: 'code_agent',
      type: 'action',
      label: 'Execute Code Agent',
      handler: async state => {
        this.executionLogger.coding('info', 'Executing code agent tasks', undefined, undefined);
        state.status = 'executing';
        const result = await this.executeCodeAgent(state);
        state.results.push(...result.results);
        state.artifacts.push(...result.artifacts);
        state.updatedAt = new Date();
        return state;
      },
      transitions: [
        { condition: s => s.results.every(r => r.success), target: 'verify', label: 'Success' },
        {
          condition: s => s.results.some(r => !r.success),
          target: 'handle_failure',
          label: 'Failure',
        },
      ],
    });

    // COMPUTER AGENT node
    this.addNode({
      id: 'computer_agent',
      type: 'action',
      label: 'Execute Computer Agent',
      handler: async state => {
        this.executionLogger.browser(
          'info',
          'Executing computer agent tasks',
          undefined,
          undefined
        );
        state.status = 'executing';
        const result = await this.executeComputerAgent(state);
        state.results.push(...result.results);
        state.artifacts.push(...result.artifacts);
        state.updatedAt = new Date();
        return state;
      },
      transitions: [
        { condition: s => s.results.every(r => r.success), target: 'verify', label: 'Success' },
        {
          condition: s => s.results.some(r => !r.success),
          target: 'handle_failure',
          label: 'Failure',
        },
      ],
    });

    // HYBRID AGENT node (combines web + code + computer)
    this.addNode({
      id: 'hybrid_agent',
      type: 'action',
      label: 'Execute Hybrid Agent',
      handler: async state => {
        this.executionLogger.plan('info', 'Executing hybrid agent tasks', undefined, undefined);
        state.status = 'executing';

        // Execute web tasks first
        const webResult = await this.executeWebAgent(state);
        state.results.push(...webResult.results);
        state.artifacts.push(...webResult.artifacts);

        // Then code tasks
        const codeResult = await this.executeCodeAgent(state);
        state.results.push(...codeResult.results);
        state.artifacts.push(...codeResult.artifacts);

        // Then computer tasks
        const computerResult = await this.executeComputerAgent(state);
        state.results.push(...computerResult.results);
        state.artifacts.push(...computerResult.artifacts);

        state.updatedAt = new Date();
        return state;
      },
      transitions: [
        { condition: s => s.results.every(r => r.success), target: 'verify', label: 'Success' },
        {
          condition: s => s.results.some(r => !r.success),
          target: 'handle_failure',
          label: 'Failure',
        },
      ],
    });

    // HANDLE_FAILURE node
    this.addNode({
      id: 'handle_failure',
      type: 'decision',
      label: 'Handle Failure',
      handler: async state => {
        const failedResults = state.results.filter(r => !r.success);
        const errors = failedResults.map(r => ({
          stepId: r.stepId,
          error: r.error || 'Unknown error',
          timestamp: new Date(),
          recoverable: true,
        }));
        state.errors.push(...errors);

        this.executionLogger.plan(
          'error',
          `Handling ${errors.length} failures`,
          undefined,
          undefined
        );
        state.updatedAt = new Date();
        return state;
      },
      transitions: [
        { condition: s => this.canSelfImprove(s), target: 'self_improve', label: 'Self-improve' },
        {
          condition: s => !this.canSelfImprove(s),
          target: 'notify_failure',
          label: 'Cannot improve',
        },
      ],
    });

    // SELF_IMPROVE node
    this.addNode({
      id: 'self_improve',
      type: 'self_improve',
      label: 'Self-Improve',
      handler: async state => {
        this.executionLogger.selfImprovement('info', 'Attempting self-improvement', undefined);
        state.status = 'self_improving';
        state.updatedAt = new Date();

        const improvement = await this.attemptSelfImprovement(state);
        if (improvement.success) {
          state.capabilities.push(...improvement.newCapabilities);
          this.executionLogger.selfImprovement(
            'info',
            `Added ${improvement.newCapabilities.length} capabilities`,
            undefined
          );
        }

        return state;
      },
      transitions: [
        {
          condition: s => s.metadata.selfImprovementSuccess === true,
          target: 'retry_execution',
          label: 'Retry',
        },
        {
          condition: s => s.metadata.selfImprovementSuccess === false,
          target: 'notify_failure',
          label: 'Failed',
        },
      ],
    });

    // RETRY_EXECUTION node
    this.addNode({
      id: 'retry_execution',
      type: 'action',
      label: 'Retry Execution',
      handler: async state => {
        this.executionLogger.plan(
          'info',
          'Retrying execution after self-improvement',
          undefined,
          undefined
        );
        state.results = []; // Clear failed results
        state.updatedAt = new Date();
        return state;
      },
      transitions: [{ condition: () => true, target: 'decide_mode', label: 'Re-decide mode' }],
    });

    // VERIFY node
    this.addNode({
      id: 'verify',
      type: 'action',
      label: 'Verify Results',
      handler: async state => {
        this.executionLogger.testing('info', 'Verifying results', undefined, undefined);
        const verified = await this.verifyResults(state);
        state.context.verification = verified;
        state.updatedAt = new Date();
        return state;
      },
      transitions: [
        {
          condition: s => s.context.verification?.success,
          target: 'notify_success',
          label: 'Verified',
        },
        {
          condition: s => !s.context.verification?.success,
          target: 'handle_failure',
          label: 'Verification failed',
        },
      ],
    });

    // NOTIFY_SUCCESS node
    this.addNode({
      id: 'notify_success',
      type: 'action',
      label: 'Notify Success',
      handler: async state => {
        state.status = 'completed';
        this.executionLogger.notification('info', `Goal completed: ${state.goal}`, undefined);
        state.updatedAt = new Date();
        return state;
      },
      transitions: [{ condition: () => true, target: 'end', label: 'End' }],
    });

    // NOTIFY_FAILURE node
    this.addNode({
      id: 'notify_failure',
      type: 'action',
      label: 'Notify Failure',
      handler: async state => {
        state.status = 'failed';
        this.executionLogger.notification('error', `Goal failed: ${state.goal}`, undefined);
        state.updatedAt = new Date();
        return state;
      },
      transitions: [{ condition: () => true, target: 'end', label: 'End' }],
    });

    // END node
    this.addNode({
      id: 'end',
      type: 'end',
      label: 'End',
      handler: async state => {
        this.executionLogger.plan('info', 'Agent execution ended', undefined, undefined);
        return state;
      },
      transitions: [],
    });

    this.logger.info('State graph initialized with 13 nodes');
  }

  /**
   * Execute the graph from start to end
   */
  async execute(goal: string, context: Record<string, any> = {}): Promise<AgentState> {
    const state: AgentState = {
      id: uuidv4(),
      mode: 'hybrid',
      goal,
      context,
      plan: null,
      currentStep: 0,
      results: [],
      errors: [],
      capabilities: [],
      artifacts: [],
      metadata: {},
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.activeStates.set(state.id, state);
    this.events.emit('graph:start', { executionId: state.id, goal });

    let currentNodeId = 'start';
    let iterations = 0;
    const maxIterations = 100;

    try {
      while (currentNodeId !== 'end' && iterations < maxIterations) {
        iterations++;
        const node = this.nodes.get(currentNodeId);

        if (!node) {
          throw new Error(`Node not found: ${currentNodeId}`);
        }

        this.logger.info(`Executing node: ${node.label} (${currentNodeId})`);
        this.events.emit('graph:node_start', { executionId: state.id, nodeId: currentNodeId });

        // Execute node handler
        const updatedState = await node.handler(state);
        Object.assign(state, updatedState);

        // Find next node
        const nextTransition = node.transitions.find(t => t.condition(state));
        if (!nextTransition) {
          throw new Error(`No valid transition from node: ${currentNodeId}`);
        }

        currentNodeId = nextTransition.target;
        this.events.emit('graph:transition', { executionId: state.id, from: currentNodeId, to: nextTransition.target });
        this.logger.info(`Transitioning to: ${nextTransition.label || currentNodeId}`);
      }

      if (iterations >= maxIterations) {
        this.logger.error('Max iterations reached');
        state.status = 'failed';
        state.errors.push({
          stepId: '',
          error: 'Max iterations reached',
          timestamp: new Date(),
          recoverable: false,
        });
        this.events.emit('graph:failure', { executionId: state.id, error: 'Max iterations reached' });
      }

      this.events.emit('graph:complete', { executionId: state.id, state });
      return state;
    } catch (error) {
      this.logger.error('Graph execution failed', error);
      state.status = 'failed';
      state.errors.push({
        stepId: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        recoverable: false,
      });
      this.events.emit('graph:failure', { executionId: state.id, error: error instanceof Error ? error.message : 'Unknown error' });
      return state;
    } finally {
      this.activeStates.delete(state.id);
    }
  }

  /**
   * Get current state by ID
   */
  getState(stateId: string): AgentState | undefined {
    return this.activeStates.get(stateId);
  }

  /**
   * Get all active states
   */
  getActiveStates(): AgentState[] {
    return Array.from(this.activeStates.values());
  }

  // ============================================================================
  // NODE HANDLERS (Implementation)
  // ============================================================================

  private async analyzeGoal(
    goal: string,
    context: Record<string, any>
  ): Promise<{
    requiredCapabilities: string[];
    suggestedMode: AgentMode;
    complexity: 'simple' | 'medium' | 'complex';
  }> {
    const prompt = `Analyze this goal and determine:
1. What capabilities are needed
2. What agent mode is best (web/code/computer/hybrid)
3. Complexity level

GOAL: ${goal}
CONTEXT: ${JSON.stringify(context)}

Respond with JSON:
{
  "requiredCapabilities": ["browser", "code", "api"],
  "suggestedMode": "web|code|computer|hybrid",
  "complexity": "simple|medium|complex"
}`;

    try {
      const response = await this.modelRouter.route(
        'goal-analyzer',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.2, maxTokens: 500 },
        },
        prompt,
        { systemMessage: 'You are a goal analysis system. Respond only with valid JSON.' }
      );

      return JSON.parse(response);
    } catch {
      return {
        requiredCapabilities: ['browser', 'code'],
        suggestedMode: 'hybrid',
        complexity: 'medium',
      };
    }
  }

  private decideMode(analysis: any): AgentMode {
    if (!analysis) return 'hybrid';

    const modeMap: Record<string, AgentMode> = {
      web: 'web',
      code: 'code',
      computer: 'computer',
      hybrid: 'hybrid',
    };

    return modeMap[analysis.suggestedMode] || 'hybrid';
  }

  private canSelfImprove(state: AgentState): boolean {
    // Check if we haven't self-improved too many times
    const selfImproveCount = state.results.filter(r => r.toolUsed === 'self_improve').length;
    return selfImproveCount < 3 && state.errors.length > 0;
  }

  private async attemptSelfImprovement(state: AgentState): Promise<{
    success: boolean;
    newCapabilities: string[];
  }> {
    const prompt = `The agent failed with these errors:
${state.errors.map(e => `- ${e.error}`).join('\n')}

Current capabilities: ${state.capabilities.join(', ')}

What new capability would help? Respond with JSON:
{
  "success": true,
  "newCapabilities": ["new_capability_name"],
  "reasoning": "..."
}`;

    try {
      const response = await this.modelRouter.route(
        'self-improvement',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.3, maxTokens: 500 },
        },
        prompt,
        { systemMessage: 'You are a self-improvement system. Respond only with valid JSON.' }
      );

      const result = JSON.parse(response);
      state.metadata.selfImprovementSuccess = result.success;
      return result;
    } catch {
      state.metadata.selfImprovementSuccess = false;
      return { success: false, newCapabilities: [] };
    }
  }

  private async verifyResults(state: AgentState): Promise<{ success: boolean; details: string }> {
    const successCount = state.results.filter(r => r.success).length;
    const totalCount = state.results.length;

    return {
      success: successCount === totalCount,
      details: `${successCount}/${totalCount} steps succeeded`,
    };
  }

  // Implementations for agent executions
  private async executeWebAgent(
    state: AgentState
  ): Promise<{ results: StepResult[]; artifacts: Artifact[] }> {
    this.executionLogger.browser('info', 'Web agent executing', undefined, undefined);
    
    if (!this.toolRegistry) {
      throw new Error('ToolRegistry not available for Web Agent');
    }

    const prompt = `You are a web agent. Goal: ${state.goal}
Context: ${JSON.stringify(state.context)}
Available tools: web_search, browse_url, browser_click, browser_type

Choose one tool to execute.
Respond with JSON:
{
  "tool": "web_search",
  "params": { "query": "example" }
}`;

    try {
      const response = await this.modelRouter.route(
        'web-agent',
        { provider: 'openrouter', modelId: 'anthropic/claude-3-5-sonnet', parameters: { temperature: 0.2, maxTokens: 1000 } },
        prompt,
        { systemMessage: 'You are a web agent. Respond only with valid JSON.' }
      );
      
      const action = JSON.parse(response);
      const result = await this.toolRegistry.execute(action.tool, action.params || {});
      
      return {
        results: [{
          stepId: uuidv4(),
          success: result.success,
          toolUsed: action.tool,
          executionTime: result.durationMs || 0,
          data: result.data,
          error: result.error
        }],
        artifacts: []
      };
    } catch (error: any) {
      return {
        results: [{
          stepId: uuidv4(),
          success: false,
          toolUsed: 'unknown',
          executionTime: 0,
          error: error.message
        }],
        artifacts: []
      };
    }
  }

  private async executeCodeAgent(
    state: AgentState
  ): Promise<{ results: StepResult[]; artifacts: Artifact[] }> {
    this.executionLogger.coding('info', 'Code agent executing', undefined, undefined);
    
    if (!this.toolRegistry) {
      throw new Error('ToolRegistry not available for Code Agent');
    }

    const prompt = `You are a coding agent. Goal: ${state.goal}
Context: ${JSON.stringify(state.context)}
Available tools: read_file, write_file, edit_file, search_files, run_command

Choose one tool to execute.
Respond with JSON:
{
  "tool": "read_file",
  "params": { "path": "src/index.ts" }
}`;

    try {
      const response = await this.modelRouter.route(
        'code-agent',
        { provider: 'openrouter', modelId: 'anthropic/claude-3-5-sonnet', parameters: { temperature: 0.2, maxTokens: 1000 } },
        prompt,
        { systemMessage: 'You are a coding agent. Respond only with valid JSON.' }
      );
      
      const action = JSON.parse(response);
      const result = await this.toolRegistry.execute(action.tool, action.params || {});
      
      return {
        results: [{
          stepId: uuidv4(),
          success: result.success,
          toolUsed: action.tool,
          executionTime: result.durationMs || 0,
          data: result.data,
          error: result.error
        }],
        artifacts: []
      };
    } catch (error: any) {
      return {
        results: [{
          stepId: uuidv4(),
          success: false,
          toolUsed: 'unknown',
          executionTime: 0,
          error: error.message
        }],
        artifacts: []
      };
    }
  }

  private async executeComputerAgent(
    state: AgentState
  ): Promise<{ results: StepResult[]; artifacts: Artifact[] }> {
    this.executionLogger.browser('info', 'Computer agent executing', undefined, undefined);
    
    if (!this.computerOrchestrator) {
      throw new Error('ComputerUseOrchestrator not available for Computer Agent');
    }

    const task = {
      id: uuidv4(),
      description: state.goal,
      type: 'desktop_operation',
      status: 'pending',
      priority: 'high',
      metadata: state.context
    } as any;

    try {
      const result = await this.computerOrchestrator.executeComputerTask(task);
      
      return {
        results: [{
          stepId: task.id,
          success: result.success,
          toolUsed: result.toolUsed,
          executionTime: result.executionTime,
          data: result.data,
          error: result.error
        }],
        artifacts: []
      };
    } catch (error: any) {
      return {
        results: [{
          stepId: uuidv4(),
          success: false,
          toolUsed: 'computer_agent',
          executionTime: 0,
          error: error.message
        }],
        artifacts: []
      };
    }
  }

  private addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }
}
