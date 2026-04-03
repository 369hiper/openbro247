import { ModelRouter } from '../models/modelRouter';
import { BrowserEngine } from '../browser/engine';
import { getClaudeCodeController } from '../desktop/claudeCodeController';
import { ComputerUseOrchestrator, getComputerUseOrchestrator } from './orchestrator';
import { Logger } from '../utils/logger';
import { DigitalOperatorConfig, ComputerUseTask, ComputerOperation } from './types';

export class AutonomousDigitalOperator {
  private config: DigitalOperatorConfig;
  private modelRouter: ModelRouter;
  private computerOrchestrator: ComputerUseOrchestrator;
  private logger: Logger;

  private isActive = false;
  private currentTask: ComputerUseTask | null = null;
  private taskQueue: ComputerUseTask[] = [];

  constructor(
    config: DigitalOperatorConfig,
    modelRouter: ModelRouter,
    browserEngine: BrowserEngine
  ) {
    this.config = config;
    this.modelRouter = modelRouter;
    this.computerOrchestrator = getComputerUseOrchestrator(browserEngine, modelRouter, getClaudeCodeController());
    this.logger = new Logger(`DigitalOperator-${config.name}`);
  }

  async initialize(): Promise<void> {
    try {
      await this.computerOrchestrator.initialize();
      this.logger.info(
        `Autonomous Digital Operator initialized: ${this.config.name} (${this.config.role})`
      );

      // Log capabilities
      const tools = await this.computerOrchestrator.getAvailableTools();
      this.logger.info(`Available tools: ${tools.map(t => t.name).join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to initialize Digital Operator', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.isActive) return;

    this.isActive = true;
    this.logger.info('Autonomous Digital Operator started');

    // Start processing task queue
    this.processTaskQueue();
  }

  async stop(): Promise<void> {
    this.isActive = false;
    this.logger.info('Autonomous Digital Operator stopped');
  }

  async executeTask(task: ComputerUseTask): Promise<any> {
    try {
      this.logger.info(`Executing task: ${task.description}`);

      // Update task status
      task.status = 'in_progress';
      task.startedAt = new Date();

      this.currentTask = task;

      // Execute using computer orchestrator
      const result = await this.computerOrchestrator.executeComputerTask(task);

      // Update task status
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = new Date();

      if (result.success) {
        task.result = result.data;
      } else {
        task.error = result.error;
      }

      this.logger.info(`Task ${task.id} completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);

      return result;
    } catch (error) {
      this.logger.error(`Task execution failed: ${task.id}`, error);

      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.completedAt = new Date();

      throw error;
    } finally {
      this.currentTask = null;
    }
  }

  async queueTask(task: ComputerUseTask): Promise<void> {
    this.taskQueue.push(task);
    this.logger.info(`Task queued: ${task.id} - ${task.description}`);
  }

  async analyzeScreenAndPlan(query: string): Promise<ComputerOperation[]> {
    try {
      this.logger.info(`Analyzing screen and planning for: ${query}`);

      // Capture current screen state
      const context = await this.computerOrchestrator.getCurrentContext();

      // Get browser elements if browser is active
      let browserElements = '';
      let pageContent = '';
      let screenshotBase64 = '';

      try {
        // Try to get browser elements
        const browserState = await this.computerOrchestrator.executeHighLevelOperation({
          type: 'browser_get_accessibility_tree',
          parameters: {},
        });

        if (browserState.success && browserState.data) {
          browserElements = browserState.data.accessibilityTree || '';
          pageContent = JSON.stringify(browserState.data.pageInfo || {}, null, 2);
        }
      } catch (e) {
        this.logger.debug('Could not get browser elements, using screenshot only');
      }

      // Capture screenshot for vision models
      try {
        const screenshotResult = await this.computerOrchestrator.executeHighLevelOperation({
          type: 'take_screenshot',
          parameters: {},
        });
        if (screenshotResult.success && screenshotResult.screenshot) {
          screenshotBase64 = Buffer.isBuffer(screenshotResult.screenshot)
            ? screenshotResult.screenshot.toString('base64').substring(0, 1000)
            : '';
        }
      } catch (e) {
        this.logger.debug('Could not capture screenshot');
      }

      // Use VLM to analyze screen and generate plan
      const systemPrompt = `You are ${this.config.name}, an autonomous digital operator with role: ${this.config.role}.

You have access to computer automation tools and can see the current screen state.
Based on the user's request and current computer context, generate a sequence of high-level computer operations.

## Available Operations:
- open_application: Open a specific application (requires: target: app name)
- close_application: Close a specific application (requires: target: app name)
- navigate_web: Navigate browser to URL (requires: parameters: { url: "..." })
- take_screenshot: Capture screen
- type_text: Type text (requires: parameters: { text: "...", element?: selector })
- click_element: Click on UI element (requires: parameters: { selector: "...", element?: description })
- edit_file: Edit file in VS Code (requires: parameters: { filePath: "...", changes: "..." })
- run_command: Run terminal command (requires: parameters: { command: "...", cwd?: "..." })
- monitor_screen: Monitor screen changes
- browser_get_elements: Get interactive elements from browser page

## Current Context:
- Active Window: ${context.activeWindow || 'Unknown'}
- Open Applications: ${(context.openApplications || []).join(', ') || 'None'}
- Current URL: ${context.currentUrl || 'None'}

## Browser Page Information:
${pageContent || 'No browser content available'}

## Accessibility Tree (Interactive Elements):
${browserElements || 'No elements available'}

## Task:
User request: ${query}

## Output Format:
Respond with a JSON array of operations. Each operation must have:
{
  "type": "operation_type",
  "target": "optional target",
  "parameters": { /* operation-specific parameters */ },
  "description": "what this step does"
}

Be specific with selectors and parameters. Use minimal steps needed.`;

      const planResponse = await this.modelRouter.route(
        `operator-${this.config.name}`,
        {
          provider: 'openrouter',
          modelId: this.config.llmModel,
          parameters: { temperature: 0.3, maxTokens: 2000 },
        },
        `Generate a plan to accomplish: "${query}". 
        
Current screen state:
- Active window: ${context.activeWindow}
- Open apps: ${(context.openApplications || []).slice(0, 5).join(', ')}
- Current URL: ${context.currentUrl || 'none'}

Available elements: ${browserElements ? browserElements.substring(0, 2000) : 'none'}`,
        { systemMessage: systemPrompt }
      );

      // Parse the response as JSON - handle various formats
      let operations: ComputerOperation[] = [];

      try {
        // Try direct JSON parse
        const parsed = JSON.parse(planResponse);
        if (Array.isArray(parsed)) {
          operations = parsed;
        } else if (parsed.operations) {
          operations = parsed.operations;
        } else if (parsed.steps) {
          operations = parsed.steps;
        }
      } catch (parseError) {
        // Try to extract JSON from response
        const jsonMatch = planResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            operations = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            // Try to find object patterns
            const objMatches = planResponse.match(/\{[\s\S]*?"type"[\s\S]*?\}/g);
            if (objMatches) {
              operations = objMatches
                .map(m => {
                  try {
                    return JSON.parse(m);
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean);
            }
          }
        }
      }

      // Validate and clean operations
      operations = operations
        .filter(op => op && op.type)
        .map(op => ({
          type: op.type,
          target: op.target,
          parameters: op.parameters || {},
          description: op.description || op.type,
        }));

      this.logger.info(`Generated plan with ${operations.length} operations`);
      return operations;
    } catch (error) {
      this.logger.error('Failed to analyze screen and plan', error);
      throw error;
    }
  }

  async executePlan(operations: ComputerOperation[]): Promise<any[]> {
    const results = [];

    for (const operation of operations) {
      try {
        this.logger.info(`Executing operation: ${operation.type}`);

        const result = await this.computerOrchestrator.executeHighLevelOperation(operation);
        results.push(result);

        if (!result.success) {
          this.logger.warn(`Operation failed: ${operation.type} - ${result.error}`);
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(`Operation execution failed: ${operation.type}`, error);
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          operation: operation.type,
        });
      }
    }

    return results;
  }

  async processNaturalLanguageCommand(command: string): Promise<any> {
    try {
      this.logger.info(`Processing natural language command: ${command}`);

      // Step 1: Analyze screen and generate plan
      const operations = await this.analyzeScreenAndPlan(command);

      // Step 2: Execute the plan
      const results = await this.executePlan(operations);

      // Step 3: Summarize results
      const successfulOps = results.filter(r => r.success).length;
      const failedOps = results.filter(r => !r.success).length;

      this.logger.info(`Command completed: ${successfulOps} successful, ${failedOps} failed`);

      return {
        command,
        operations: results,
        summary: {
          total: results.length,
          successful: successfulOps,
          failed: failedOps,
        },
      };
    } catch (error) {
      this.logger.error('Failed to process natural language command', error);
      throw error;
    }
  }

  getStatus(): {
    isActive: boolean;
    currentTask: ComputerUseTask | null;
    queuedTasks: number;
    config: DigitalOperatorConfig;
  } {
    return {
      isActive: this.isActive,
      currentTask: this.currentTask,
      queuedTasks: this.taskQueue.length,
      config: this.config,
    };
  }

  private async processTaskQueue(): Promise<void> {
    while (this.isActive) {
      if (this.taskQueue.length > 0 && !this.currentTask) {
        const task = this.taskQueue.shift()!;
        await this.executeTask(task);
      }

      // Wait before checking queue again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Factory function for creating digital operators
export function createDigitalOperator(
  config: DigitalOperatorConfig,
  modelRouter: ModelRouter,
  browserEngine: BrowserEngine
): AutonomousDigitalOperator {
  return new AutonomousDigitalOperator(config, modelRouter, browserEngine);
}

// Predefined operator configurations
export const OPERATOR_CONFIGS = {
  researcher: {
    name: 'DeepResearch',
    role: 'Autonomous Research Specialist',
    capabilities: ['web_navigation', 'research', 'monitoring'],
    llmModel: 'qwen/qwen3-next-80b-a3b-instruct:free',
    visionEnabled: true,
    maxConcurrentTasks: 3,
    securityLevel: 'medium' as const,
    workspace: './workspaces/research',
    tools: {
      browser: true,
      desktop: true,
      vscode: false,
      screen: true,
      filesystem: true,
    },
  } as DigitalOperatorConfig,

  developer: {
    name: 'CodeArchitect',
    role: 'Autonomous Software Engineer',
    capabilities: ['coding_task', 'desktop_operation', 'monitoring'],
    llmModel: 'qwen/qwen3-coder:free',
    visionEnabled: true,
    maxConcurrentTasks: 2,
    securityLevel: 'high' as const,
    workspace: './workspaces/coding',
    tools: {
      browser: false,
      desktop: true,
      vscode: true,
      screen: true,
      filesystem: true,
    },
  } as DigitalOperatorConfig,

  analyst: {
    name: 'DataAnalyzer',
    role: 'Autonomous Data Analyst',
    capabilities: ['web_navigation', 'desktop_operation', 'research'],
    llmModel: 'minimax/minimax-m2.5:free',
    visionEnabled: true,
    maxConcurrentTasks: 4,
    securityLevel: 'medium' as const,
    workspace: './workspaces/analysis',
    tools: {
      browser: true,
      desktop: true,
      vscode: true,
      screen: true,
      filesystem: true,
    },
  } as DigitalOperatorConfig,

  assistant: {
    name: 'DigitalAssistant',
    role: 'General Purpose Digital Assistant',
    capabilities: ['web_navigation', 'desktop_operation', 'coding_task', 'research', 'monitoring'],
    llmModel: 'mistralai/mistral-small-3.1-24b-instruct:free',
    visionEnabled: true,
    maxConcurrentTasks: 5,
    securityLevel: 'high' as const,
    workspace: './workspaces/assistant',
    tools: {
      browser: true,
      desktop: true,
      vscode: true,
      screen: true,
      filesystem: true,
    },
  } as DigitalOperatorConfig,
};
