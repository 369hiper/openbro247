import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BrowserEngine } from '../browser/engine';
import { ModelRouter } from '../models/modelRouter';
import { Logger } from '../utils/logger';
import { ComputerUseOrchestrator } from './orchestrator';
import { ExecutionLogger } from './executionLogger';
import { getClaudeCodeController } from '../desktop/claudeCodeController';
import { TaskPlanner } from './taskPlanner';
import { SelfImprovement } from './selfImprovement';
import { GoalNotifier } from './goalNotifier';
import {
  AutonomousAgentConfig,
  AgentState,
  ExecutionPlan,
  ExecutionStep,
  ComputerUseResult,
  Artifact,
  ExecutionLogEntry,
  Capability,
} from './types';

const DEFAULT_CONFIG: AutonomousAgentConfig = {
  name: 'KiloAgent',
  workspace: './workspace',
  llmModel: 'anthropic/claude-3-5-sonnet',
  maxConcurrentTasks: 3,
  maxRetries: 3,
  timeout: 300000, // 5 minutes
  autoNotify: true,
  notificationChannels: ['websocket'],
  selfImprovementEnabled: true,
  browserConfig: {
    headless: false,
    defaultTimeout: 30000,
    screenshotOnFailure: true,
  },
};

/**
 * AutonomousAgent is a KiloCode 2.0 style orchestrator that can:
 * - Analyze goals and create execution plans
 * - Research topics via web browsing
 * - Build and run applications
 * - Test and fix issues automatically
 * - Self-improve by adding new capabilities
 * - Log all activities comprehensively
 * - Notify users when goals are accomplished
 */
export class AutonomousAgent {
  private config: AutonomousAgentConfig;
  private orchestrator: ComputerUseOrchestrator;
  private taskPlanner: TaskPlanner;
  private executionLogger: ExecutionLogger;
  private selfImprovement: SelfImprovement;
  private goalNotifier: GoalNotifier;
  private modelRouter: ModelRouter;
  private logger: Logger;

  private activePlans: Map<string, ExecutionPlan> = new Map();
  private artifacts: Map<string, Artifact[]> = new Map();
  private state: AgentState;
  private isRunning: boolean = false;

  constructor(
    browserEngine: BrowserEngine,
    modelRouter: ModelRouter,
    config: Partial<AutonomousAgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.modelRouter = modelRouter;

    // Initialize components
    this.orchestrator = new ComputerUseOrchestrator(browserEngine, modelRouter, getClaudeCodeController());
    this.executionLogger = new ExecutionLogger({
      maxLogs: 50000,
      logFile: path.join(this.config.workspace, 'logs'),
    });
    this.taskPlanner = new TaskPlanner(modelRouter);
    this.selfImprovement = new SelfImprovement(modelRouter, this.executionLogger, this.config);
    this.goalNotifier = new GoalNotifier(this.executionLogger, this.config);

    this.logger = new Logger(`AutonomousAgent-${this.config.name}`);

    // Initialize agent state
    this.state = {
      id: uuidv4(),
      config: this.config,
      capabilities: [],
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        improvementsApplied: 0,
        uptime: 0,
        startedAt: new Date(),
      },
    };
  }

  /**
   * Initialize the autonomous agent
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Autonomous Agent...');

    try {
      // Create workspace directory
      await fs.mkdir(this.config.workspace, { recursive: true });
      await fs.mkdir(path.join(this.config.workspace, 'projects'), { recursive: true });
      await fs.mkdir(path.join(this.config.workspace, 'logs'), { recursive: true });
      await fs.mkdir(path.join(this.config.workspace, 'artifacts'), { recursive: true });

      // Initialize sub-components
      await this.orchestrator.initialize();
      await this.selfImprovement.initialize();

      this.state.stats.startedAt = new Date();
      this.isRunning = true;

      this.logger.info(`Autonomous Agent "${this.config.name}" initialized successfully`);
      this.executionLogger.plan('info', 'Agent initialized', { config: this.config });
    } catch (error) {
      this.logger.error('Failed to initialize Autonomous Agent', error);
      throw error;
    }
  }

  /**
   * Execute a goal autonomously - the main entry point
   * The agent will:
   * 1. Analyze the goal and create a plan
   * 2. Execute each step (research, code, test, deploy)
   * 3. Self-improve if needed
   * 4. Log everything
   * 5. Notify user when done
   */
  async executeGoal(
    goal: string,
    context: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    planId: string;
    summary: string;
    artifacts: Artifact[];
    logs: ExecutionLogEntry[];
  }> {
    const startTime = Date.now();
    this.logger.info(`Executing goal: ${goal}`);
    this.executionLogger.plan('info', `Goal started: ${goal}`);

    try {
      // Step 1: Create execution plan
      this.executionLogger.plan('info', 'Creating execution plan...');
      const plan = await this.taskPlanner.createPlan(goal, context);
      this.activePlans.set(plan.id, plan);

      this.executionLogger.plan('info', `Plan created with ${plan.steps.length} steps`, {
        planId: plan.id,
        steps: plan.steps.map(s => s.description),
      });

      // Step 2: Execute the plan
      plan.status = 'executing';
      const result = await this.executePlan(plan);

      // Step 3: Handle results
      const duration = Date.now() - startTime;
      const artifacts = this.artifacts.get(plan.id) || [];
      const logs = this.executionLogger.getLogsForPlan(plan.id);

      if (result.success) {
        plan.status = 'completed';
        this.state.stats.tasksCompleted++;

        const summary = this.generateSummary(plan, result, duration);

        // Notify user
        if (this.config.autoNotify) {
          await this.goalNotifier.notifyGoalCompleted(plan.id, goal, summary, {
            tasksCompleted: plan.steps.filter(s => s.status === 'completed').length,
            tasksFailed: plan.steps.filter(s => s.status === 'failed').length,
            duration,
            logs,
            artifacts,
          });
        }

        this.logger.info(`Goal completed successfully: ${goal}`);
        this.executionLogger.plan('info', `Goal completed: ${goal}`, { duration, summary });

        return { success: true, planId: plan.id, summary, artifacts, logs };
      } else {
        plan.status = 'failed';
        this.state.stats.tasksFailed++;

        const summary = `Goal failed: ${result.error || 'Unknown error'}`;

        if (this.config.autoNotify) {
          await this.goalNotifier.notifyGoalFailed(plan.id, goal, summary, {
            tasksCompleted: plan.steps.filter(s => s.status === 'completed').length,
            tasksFailed: plan.steps.filter(s => s.status === 'failed').length,
            duration,
            logs,
            artifacts,
          });
        }

        this.logger.error(`Goal failed: ${goal}`, result.error);
        this.executionLogger.plan('error', `Goal failed: ${goal}`, { error: result.error });

        return { success: false, planId: plan.id, summary, artifacts, logs };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.state.stats.tasksFailed++;
      this.executionLogger.plan('critical', `Goal execution crashed: ${errorMessage}`);

      return {
        success: false,
        planId: '',
        summary: `Execution crashed: ${errorMessage}`,
        artifacts: [],
        logs: this.executionLogger.getAllLogs(),
      };
    }
  }

  /**
   * Execute a plan step by step
   */
  private async executePlan(plan: ExecutionPlan): Promise<ComputerUseResult> {
    const context = await this.orchestrator.getCurrentContext();

    let i = 0;
    while (i < plan.steps.length) {
      const step = plan.steps[i];
      if (step.status === 'completed') {
        i++;
        continue;
      }

      this.executionLogger.stepStarted(step, plan.id);
      step.status = 'in_progress';
      step.startedAt = new Date();

      try {
        const result = await this.executeStep(step, plan);

        if (result.success) {
          step.status = 'completed';
          step.completedAt = new Date();
          step.result = result.data;
          this.executionLogger.stepCompleted(step, plan.id, result.data);
          i++; // Move to next step only on success
        } else {
          throw new Error(result.error || 'Step failed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        step.error = errorMessage;
        step.retryCount++;

        this.executionLogger.stepFailed(step, plan.id, errorMessage);
        this.logger.error(`Step ${step.order} failed: ${errorMessage}`);

        // Retry logic
        if (step.retryCount < step.maxRetries) {
          this.logger.info(`Retrying step ${step.order} (${step.retryCount}/${step.maxRetries})`);
          step.status = 'pending';
          continue; // Staying on the same step
        }

        // Try self-improvement
        if (this.config.selfImprovementEnabled) {
          this.logger.info('Attempting self-improvement...');
          const improvement = await this.selfImprovement.analyzeAndImprove(
            step.description,
            errorMessage,
            { step, plan }
          );

          if (improvement.improved) {
            this.state.stats.improvementsApplied++;
            this.logger.info(`Self-improved: ${improvement.reasoning}`);
            step.status = 'pending'; // Retry with new capability
            continue; // Staying on the same step
          }
        }

        // Step failed permanently
        return {
          success: false,
          error: `Step ${step.order} failed: ${errorMessage}`,
          context,
          executionTime: 0,
          toolUsed: step.tool,
        };
      }
    }

    return {
      success: true,
      data: { planCompleted: true },
      context,
      executionTime: 0,
      toolUsed: 'plan_executor',
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: ExecutionStep, plan: ExecutionPlan): Promise<ComputerUseResult> {
    const context = await this.orchestrator.getCurrentContext();

    switch (step.tool) {
      // Research tools
      case 'web_search':
        return this.executeWebSearch(step.params as any, context);

      case 'web_fetch':
        return this.executeWebFetch(step.params as any, context);

      // Browser tools
      case 'browser_navigate':
        return this.orchestrator.executeHighLevelOperation({
          type: 'navigate_web',
          parameters: step.params,
          description: step.description,
        });

      case 'browser_click':
        return this.orchestrator.executeHighLevelOperation({
          type: 'click_element',
          parameters: step.params,
          description: step.description,
        });

      case 'browser_type':
        return this.orchestrator.executeHighLevelOperation({
          type: 'type_text',
          parameters: step.params,
          description: step.description,
        });

      case 'browser_screenshot':
        return this.orchestrator.executeHighLevelOperation({
          type: 'take_screenshot',
          parameters: step.params,
          description: step.description,
        });

      // Code tools
      case 'code_write':
        return this.executeCodeWrite(step.params as any, plan);

      case 'code_edit':
        return this.executeCodeEdit(step.params as any, plan);

      case 'code_delete':
        return this.executeCodeDelete(step.params as any, plan);

      case 'code_read':
        return this.executeCodeRead(step.params as any, plan);

      // Execution tools
      case 'run_command':
        return this.orchestrator.executeHighLevelOperation({
          type: 'run_command',
          parameters: step.params,
          description: step.description,
        });

      case 'npm_install':
        return this.executeNpmInstall(step.params as any, plan);

      case 'run_server':
        return this.executeRunServer(step.params as any, plan);

      // Testing tools
      case 'test_app':
        return this.executeTestApp(step.params as any, plan);

      // Notification tools
      case 'notify_user':
        return this.executeNotifyUser(step.params as any, plan);

      // Self-improvement tools
      case 'self_improve':
        return this.executeSelfImprove(step.params as any, plan);

      default:
        throw new Error(`Unknown tool: ${step.tool}`);
    }
  }

  // ============================================================================
  // TOOL IMPLEMENTATIONS
  // ============================================================================

  private async executeWebSearch(
    params: { query: string },
    context: any
  ): Promise<ComputerUseResult> {
    this.executionLogger.research('info', `Web search: ${params.query}`);

    try {
      // Navigate to search engine and search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.query)}`;
      await this.orchestrator.executeHighLevelOperation({
        type: 'navigate_web',
        parameters: { url: searchUrl },
      });

      // Extract structured page content
      const result = await this.orchestrator.executeHighLevelOperation({
        type: 'extract_page_content',
        parameters: {},
      });

      return {
        success: true,
        data: {
          query: params.query,
          searchUrl,
          content: result.data,
        },
        context,
        executionTime: 0,
        toolUsed: 'web_search',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
        context,
        executionTime: 0,
        toolUsed: 'web_search',
      };
    }
  }

  private async executeWebFetch(params: { url: string }, context: any): Promise<ComputerUseResult> {
    this.executionLogger.research('info', `Fetching URL: ${params.url}`);

    try {
      const response = await fetch(params.url);
      const content = await response.text();

      return {
        success: true,
        data: { url: params.url, content, status: response.status },
        context,
        executionTime: 0,
        toolUsed: 'web_fetch',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fetch failed',
        context,
        executionTime: 0,
        toolUsed: 'web_fetch',
      };
    }
  }

  private async executeCodeWrite(
    params: { path: string; content: string; cwd?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.coding('info', `Writing file: ${params.path}`);

    try {
      // Determine target directory: use provided cwd, or workspace, or project dir
      const targetDir = params.cwd || this.config.workspace;
      let filePath = params.path;

      // If path is not absolute, join with target directory
      if (!path.isAbsolute(params.path)) {
        filePath = path.join(targetDir, params.path);
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Write file
      await fs.writeFile(filePath, params.content, 'utf-8');

      // Record artifact
      this.addArtifact(plan.id, {
        id: uuidv4(),
        type: 'file',
        name: params.path,
        path: filePath,
        metadata: { size: params.content.length, cwd: targetDir },
        createdAt: new Date(),
      });

      this.executionLogger.coding('info', `File written: ${filePath}`);

      return {
        success: true,
        data: { path: params.path, fullPath: filePath, written: true },
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_write',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Write failed';
      this.executionLogger.coding('error', `Failed to write file: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_write',
      };
    }
  }

  private async executeCodeEdit(
    params: { path: string; oldText: string; newText: string; cwd?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.coding('info', `Editing file: ${params.path}`);

    try {
      const targetDir = params.cwd || this.config.workspace;
      let filePath = params.path;

      if (!path.isAbsolute(params.path)) {
        filePath = path.join(targetDir, params.path);
      }

      const content = await fs.readFile(filePath, 'utf-8');

      // Support both simple string replace and regex
      let updated: string;
      if (params.oldText.includes('//') || params.oldText.includes('*')) {
        // Likely a regex pattern
        const regex = new RegExp(params.oldText, 'g');
        updated = content.replace(regex, params.newText);
      } else {
        updated = content.replace(params.oldText, params.newText);
      }

      await fs.writeFile(filePath, updated, 'utf-8');

      this.executionLogger.coding('info', `File edited: ${filePath}`);

      return {
        success: true,
        data: { path: params.path, fullPath: filePath, edited: true },
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_edit',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Edit failed';
      this.executionLogger.coding('error', `Failed to edit file: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_edit',
      };
    }
  }

  private async executeCodeDelete(
    params: { path: string; cwd?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.coding('info', `Deleting file: ${params.path}`);

    try {
      const targetDir = params.cwd || this.config.workspace;
      let filePath = params.path;

      if (!path.isAbsolute(params.path)) {
        filePath = path.join(targetDir, params.path);
      }

      await fs.unlink(filePath);

      return {
        success: true,
        data: { path: params.path, deleted: true },
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_delete',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_delete',
      };
    }
  }

  private async executeCodeRead(
    params: { path: string; cwd?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.coding('info', `Reading file: ${params.path}`);

    try {
      const targetDir = params.cwd || this.config.workspace;
      let filePath = params.path;

      if (!path.isAbsolute(params.path)) {
        filePath = path.join(targetDir, params.path);
      }

      const content = await fs.readFile(filePath, 'utf-8');

      return {
        success: true,
        data: { path: params.path, fullPath: filePath, content },
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_read',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Read failed',
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'code_read',
      };
    }
  }

  private async executeNpmInstall(
    params: { packages?: string[]; cwd?: string; command?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    const packages = params.packages?.join(' ') || '';
    const npmCommand = params.command || (packages ? `npm install ${packages}` : 'npm install');

    this.executionLogger.coding(
      'info',
      `Running: ${npmCommand} in ${params.cwd || this.config.workspace}`
    );

    const result = await this.orchestrator.executeHighLevelOperation({
      type: 'terminal_run',
      parameters: {
        command: npmCommand,
        cwd: params.cwd || this.config.workspace,
      },
      description: 'Install npm packages',
    });

    return result;
  }

  private async executeRunServer(
    params: { command: string; port?: number; cwd?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.deployment(
      'info',
      `Starting server: ${params.command} in ${params.cwd || this.config.workspace}`
    );

    const projectDir = params.cwd || this.config.workspace;

    // Start server using start command for Windows compatibility or direct run
    const startCommand =
      process.platform === 'win32'
        ? `start "DevServer" /D "${projectDir}" ${params.command}`
        : `${params.command} &`;

    const result = await this.orchestrator.executeHighLevelOperation({
      type: 'terminal_run',
      parameters: {
        command: params.command,
        cwd: projectDir,
      },
      description: 'Start development server',
    });

    // Wait for server to be ready if port is specified
    if (params.port) {
      const serverReady = await this.waitForServer(params.port, 30000);
      if (!serverReady) {
        this.executionLogger.deployment('warn', `Server may not be ready on port ${params.port}`);
      }
    }

    // Record artifact
    this.addArtifact(plan.id, {
      id: uuidv4(),
      type: 'application',
      name: `Server on port ${params.port || 'unknown'}`,
      path: projectDir,
      metadata: { command: params.command, port: params.port },
      createdAt: new Date(),
    });

    return {
      ...result,
      data: {
        ...result.data,
        serverStarted: true,
        port: params.port,
        projectDir,
      },
    };
  }

  private async executeTestApp(
    params: { url?: string; tests?: any[]; cwd?: string; command?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.testing('info', 'Running application tests');

    const results: any[] = [];

    // If a test command is provided, run it
    if (params.command) {
      const testResult = await this.orchestrator.executeHighLevelOperation({
        type: 'terminal_run',
        parameters: {
          command: params.command,
          cwd: params.cwd || this.config.workspace,
        },
      });

      results.push({
        type: 'test_command',
        command: params.command,
        output: testResult.data?.stdout || testResult.data?.stderr || '',
        success: testResult.success,
      });
    }

    // If URL provided, navigate and verify
    if (params.url) {
      const navResult = await this.orchestrator.executeHighLevelOperation({
        type: 'navigate_web',
        parameters: { url: params.url },
      });

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get accessibility tree to verify page loaded
      const pageState = await this.orchestrator.executeHighLevelOperation({
        type: 'browser_get_accessibility_tree',
        parameters: {},
      });

      // Take screenshot for visual verification
      const screenshot = await this.orchestrator.executeHighLevelOperation({
        type: 'take_screenshot',
        parameters: {},
      });

      results.push({
        type: 'visual_check',
        url: params.url,
        pageLoaded: navResult.success,
        pageContent: pageState.data?.pageInfo?.title || 'Unknown',
        elementsCount: pageState.data?.elements?.length || 0,
        screenshot: screenshot.data?.screenshot ? 'captured' : 'failed',
        passed: navResult.success,
      });
    }

    // Record test report
    this.addArtifact(plan.id, {
      id: uuidv4(),
      type: 'report',
      name: 'Test Results',
      path: '',
      metadata: { results, timestamp: new Date().toISOString() },
      createdAt: new Date(),
    });

    return {
      success: true,
      data: { results },
      context: await this.orchestrator.getCurrentContext(),
      executionTime: 0,
      toolUsed: 'test_app',
    };
  }

  private async executeNotifyUser(
    params: { message: string; summary?: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.notification('info', `User notification: ${params.message}`);

    const logs = this.executionLogger.getLogsForPlan(plan.id);
    const artifacts = this.artifacts.get(plan.id) || [];

    await this.goalNotifier.notifyGoalNeedsReview(
      plan.id,
      plan.goal,
      params.summary || params.message,
      {
        tasksCompleted: plan.steps.filter(s => s.status === 'completed').length,
        tasksFailed: plan.steps.filter(s => s.status === 'failed').length,
        duration: Date.now() - plan.createdAt.getTime(),
        logs,
        artifacts,
      }
    );

    return {
      success: true,
      data: { notified: true },
      context: await this.orchestrator.getCurrentContext(),
      executionTime: 0,
      toolUsed: 'notify_user',
    };
  }

  private async executeSelfImprove(
    params: { name: string; description: string; code: string },
    plan: ExecutionPlan
  ): Promise<ComputerUseResult> {
    this.executionLogger.selfImprovement('info', `Self-improvement: ${params.name}`);

    try {
      const capability = await this.selfImprovement.createCapability({
        name: params.name,
        description: params.description,
        category: 'integration',
        code: params.code,
      });

      return {
        success: true,
        data: { capabilityId: capability.id, name: capability.name },
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'self_improve',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Self-improvement failed',
        context: await this.orchestrator.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'self_improve',
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async waitForServer(port: number, maxWait: number = 30000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      try {
        const response = await fetch(`http://localhost:${port}`, { method: 'HEAD' });
        if (response.ok || response.status < 500) {
          this.logger.info(`Server ready on port ${port}`);
          return true;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    this.logger.warn(`Server did not become ready on port ${port} within ${maxWait}ms`);
    return false;
  }

  private addArtifact(planId: string, artifact: Artifact): void {
    const existing = this.artifacts.get(planId) || [];
    existing.push(artifact);
    this.artifacts.set(planId, existing);
  }

  private generateSummary(
    plan: ExecutionPlan,
    result: ComputerUseResult,
    duration: number
  ): string {
    const completed = plan.steps.filter(s => s.status === 'completed').length;
    const failed = plan.steps.filter(s => s.status === 'failed').length;

    return (
      `Goal "${plan.goal}" completed in ${(duration / 1000).toFixed(1)}s. ` +
      `${completed}/${plan.steps.length} steps succeeded, ${failed} failed. ` +
      `Artifacts: ${(this.artifacts.get(plan.id) || []).length}.`
    );
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get agent state
   */
  getState(): AgentState {
    this.state.stats.uptime = Date.now() - this.state.stats.startedAt.getTime();
    return { ...this.state };
  }

  /**
   * Get execution logs
   */
  getLogs(
    options: { category?: string; level?: string; limit?: number } = {}
  ): ExecutionLogEntry[] {
    let logs = this.executionLogger.getAllLogs();

    if (options.category) {
      logs = logs.filter(l => l.category === options.category);
    }
    if (options.level) {
      logs = logs.filter(l => l.level === options.level);
    }
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): ExecutionPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Get all plans
   */
  getAllPlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values());
  }

  /**
   * Get artifacts for a plan
   */
  getArtifacts(planId: string): Artifact[] {
    return this.artifacts.get(planId) || [];
  }

  /**
   * Get capabilities
   */
  getCapabilities(): Capability[] {
    return this.selfImprovement.getCapabilities();
  }

  /**
   * Get notifications
   */
  getNotifications() {
    return this.goalNotifier.getAllNotifications();
  }

  /**
   * Register WebSocket for notifications
   */
  registerWebSocket(client: any): void {
    this.goalNotifier.registerWebSocketClient(client);
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info('Autonomous Agent stopped');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

let _autonomousAgent: AutonomousAgent | null = null;

export function getAutonomousAgent(
  browserEngine: BrowserEngine,
  modelRouter: ModelRouter,
  config?: Partial<AutonomousAgentConfig>
): AutonomousAgent {
  if (!_autonomousAgent) {
    _autonomousAgent = new AutonomousAgent(browserEngine, modelRouter, config);
  }
  return _autonomousAgent;
}

export function createAutonomousAgent(
  browserEngine: BrowserEngine,
  modelRouter: ModelRouter,
  config?: Partial<AutonomousAgentConfig>
): AutonomousAgent {
  return new AutonomousAgent(browserEngine, modelRouter, config);
}
