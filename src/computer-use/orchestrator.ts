import { BrowserEngine } from '../browser/engine';
import { WindowsControl, getWindowsControl } from '../desktop/windowsControl';
import { ScreenCapture, getScreenCapture } from '../desktop/screenCapture';
import { VSCodeController, getVSCodeController } from '../desktop/vscodeController';
import { ModelRouter } from '../models/modelRouter';
import { Logger } from '../utils/logger';
import {
  ComputerUseTask,
  ComputerContext,
  ComputerTool,
  ComputerUseResult,
  ComputerOperation,
  DigitalOperatorConfig,
  ScreenState,
  UIElement
} from './types';

export class ComputerUseOrchestrator {
  private browserEngine: BrowserEngine;
  private windowsControl: WindowsControl;
  private screenCapture: ScreenCapture;
  private vscodeController: VSCodeController;
  private modelRouter: ModelRouter;
  private logger: Logger;

  private tools: Map<string, ComputerTool> = new Map();
  private activeTasks: Map<string, ComputerUseTask> = new Map();
  private contextHistory: ComputerContext[] = [];

  constructor(
    browserEngine: BrowserEngine,
    modelRouter: ModelRouter
  ) {
    this.browserEngine = browserEngine;
    this.windowsControl = getWindowsControl();
    this.screenCapture = getScreenCapture();
    this.vscodeController = getVSCodeController();
    this.modelRouter = modelRouter;
    this.logger = new Logger('ComputerUseOrchestrator');

    this.initializeTools();
  }

  async initialize(): Promise<void> {
    try {
      await this.windowsControl.initialize();
      await this.screenCapture.initialize();
      await this.vscodeController.initialize();

      this.logger.info('Computer Use Orchestrator initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Computer Use Orchestrator', error);
      throw error;
    }
  }

  async executeComputerTask(task: ComputerUseTask): Promise<ComputerUseResult> {
    const startTime = Date.now();
    this.activeTasks.set(task.id, task);

    try {
      this.logger.info(`Executing computer task: ${task.description} (${task.type})`);

      // Get current computer context
      const context = await this.getCurrentContext();

      let result: ComputerUseResult;

      switch (task.type) {
        case 'web_navigation':
          result = await this.executeWebNavigation(task, context);
          break;
        case 'desktop_operation':
          result = await this.executeDesktopOperation(task, context);
          break;
        case 'coding_task':
          result = await this.executeCodingTask(task, context);
          break;
        case 'research':
          result = await this.executeResearchTask(task, context);
          break;
        case 'monitoring':
          result = await this.executeMonitoringTask(task, context);
          break;
        case 'complex_workflow':
          result = await this.executeComplexWorkflow(task, context);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const executionTime = Date.now() - startTime;
      result.executionTime = executionTime;

      this.logger.info(`Computer task completed: ${task.id} (${executionTime}ms)`);
      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Computer task failed: ${task.id}`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        context: await this.getCurrentContext(),
        executionTime,
        toolUsed: 'orchestrator'
      };
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  async executeHighLevelOperation(operation: ComputerOperation): Promise<ComputerUseResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Executing high-level operation: ${operation.type} - ${operation.description || ''}`);

      const context = await this.getCurrentContext();
      let result: any;

      switch (operation.type) {
        case 'open_application':
          result = await this.openApplication(operation.target!);
          break;
        case 'close_application':
          result = await this.closeApplication(operation.target!);
          break;
        case 'navigate_web':
          result = await this.navigateToUrl(operation.parameters?.url);
          break;
        case 'take_screenshot':
          result = await this.captureScreen(operation.parameters);
          break;
        case 'type_text':
          result = await this.typeText(operation.parameters?.text, operation.parameters?.element);
          break;
        case 'click_element':
          result = await this.clickElement(operation.parameters?.element);
          break;
        case 'edit_file':
          result = await this.editFile(operation.parameters?.filePath, operation.parameters?.changes);
          break;
        case 'run_command':
          result = await this.runTerminalCommand(operation.parameters?.command);
          break;
        case 'monitor_screen':
          result = await this.monitorScreen(operation.parameters);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      return {
        success: true,
        data: result,
        context: await this.getCurrentContext(),
        executionTime: Date.now() - startTime,
        toolUsed: operation.type
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        context: await this.getCurrentContext(),
        executionTime: Date.now() - startTime,
        toolUsed: operation.type
      };
    }
  }

  async getAvailableTools(): Promise<ComputerTool[]> {
    return Array.from(this.tools.values());
  }

  async getCurrentContext(): Promise<ComputerContext> {
    try {
      const windows = await this.windowsControl.getWindows();
      const activeWindow = windows.find(w => w.title)?.title || 'Unknown';

      const openApplications = windows
        .filter(w => w.title && w.title.trim().length > 0)
        .map(w => w.title);

      let currentUrl: string | undefined;
      try {
        if (await this.browserEngine.isLaunched()) {
          currentUrl = await this.browserEngine.getCurrentUrl();
        }
      } catch (error) {
        // Browser not available
      }

      const context: ComputerContext = {
        activeWindow,
        openApplications,
        currentUrl,
        timestamp: new Date()
      };

      // Store context in history (keep last 10)
      this.contextHistory.push(context);
      if (this.contextHistory.length > 10) {
        this.contextHistory.shift();
      }

      return context;
    } catch (error) {
      this.logger.error('Failed to get current context', error);
      return {
        activeWindow: 'Unknown',
        openApplications: [],
        timestamp: new Date()
      };
    }
  }

  // High-level computer operations
  private async openApplication(appName: string): Promise<any> {
    const result = await this.windowsControl.launchApplication(appName);
    this.logger.info(`Opened application: ${appName} (PID: ${result})`);
    return { processId: result };
  }

  private async closeApplication(appName: string): Promise<any> {
    const windows = await this.windowsControl.getWindows();
    const appWindow = windows.find(w => w.title.toLowerCase().includes(appName.toLowerCase()));

    if (appWindow) {
      await this.windowsControl.closeWindow(appWindow.hwnd);
      this.logger.info(`Closed application: ${appName}`);
      return { closed: true };
    }

    throw new Error(`Application not found: ${appName}`);
  }

  private async navigateToUrl(url: string): Promise<any> {
    if (!await this.browserEngine.isLaunched()) {
      await this.browserEngine.launch();
    }

    await this.browserEngine.navigate(url);
    const title = await this.browserEngine.getTitle();
    const finalUrl = await this.browserEngine.getCurrentUrl();

    this.logger.info(`Navigated to: ${finalUrl}`);
    return { url: finalUrl, title };
  }

  private async captureScreen(options?: any): Promise<any> {
    const screenshot = await this.screenCapture.capture(options);
    const monitors = await this.screenCapture.getMonitors();

    this.logger.info(`Captured screen (${screenshot.length} bytes)`);
    return {
      screenshot,
      monitors,
      format: options?.format || 'png',
      size: screenshot.length
    };
  }

  private async typeText(text: string, element?: UIElement): Promise<any> {
    if (element) {
      await this.clickElement(element);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await this.windowsControl.typeText(text);
    this.logger.info(`Typed text: ${text.length} characters`);
    return { typed: text.length };
  }

  private async clickElement(element: UIElement): Promise<any> {
    await this.windowsControl.clickElement(element);
    this.logger.info(`Clicked element: ${element.name}`);
    return { clicked: element.name };
  }

  private async editFile(filePath: string, changes: string): Promise<any> {
    await this.vscodeController.writeFile(filePath, changes);
    this.logger.info(`Edited file: ${filePath}`);
    return { file: filePath, modified: true };
  }

  private async runTerminalCommand(command: string): Promise<any> {
    await this.vscodeController.runTerminalCommand(command);
    this.logger.info(`Ran terminal command: ${command}`);
    return { command, executed: true };
  }

  private async monitorScreen(options?: any): Promise<any> {
    const screenshot = await this.screenCapture.capture(options);
    const previousContext = this.contextHistory[this.contextHistory.length - 2];

    let changes = null;
    if (previousContext?.screenState?.screenshot) {
      changes = await this.screenCapture.detectChanges(
        previousContext.screenState.screenshot,
        { threshold: options?.threshold || 0.1 }
      );
    }

    return {
      screenshot,
      changes,
      timestamp: new Date()
    };
  }

  // Task-specific execution methods
  private async executeWebNavigation(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    const screenshot = await this.screenCapture.capture();

    return {
      success: true,
      data: { screenshot, navigated: true },
      context,
      executionTime: 0,
      toolUsed: 'web_navigation',
      screenshot
    };
  }

  private async executeDesktopOperation(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    const screenshot = await this.screenCapture.capture();

    return {
      success: true,
      data: { screenshot, operation: 'desktop' },
      context,
      executionTime: 0,
      toolUsed: 'desktop_operation',
      screenshot
    };
  }

  private async executeCodingTask(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    const screenshot = await this.screenCapture.capture();

    return {
      success: true,
      data: { screenshot, coding: true },
      context,
      executionTime: 0,
      toolUsed: 'coding_task',
      screenshot
    };
  }

  private async executeResearchTask(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    const screenshot = await this.screenCapture.capture();

    return {
      success: true,
      data: { screenshot, research: true },
      context,
      executionTime: 0,
      toolUsed: 'research',
      screenshot
    };
  }

  private async executeMonitoringTask(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    const screenshot = await this.screenCapture.capture();

    return {
      success: true,
      data: { screenshot, monitoring: true },
      context,
      executionTime: 0,
      toolUsed: 'monitoring',
      screenshot
    };
  }

  private async executeComplexWorkflow(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    const screenshot = await this.screenCapture.capture();

    return {
      success: true,
      data: { screenshot, workflow: true },
      context,
      executionTime: 0,
      toolUsed: 'complex_workflow',
      screenshot
    };
  }

  private initializeTools(): void {
    // Browser tools
    this.tools.set('browser_navigate', {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser',
      capabilities: ['web', 'navigation'],
      execute: async (params) => await this.navigateToUrl(params.url)
    });

    this.tools.set('browser_click', {
      name: 'browser_click',
      description: 'Click on an element in the browser',
      capabilities: ['web', 'interaction'],
      execute: async (params) => await this.browserEngine.click(params.selector)
    });

    // Desktop tools
    this.tools.set('desktop_click', {
      name: 'desktop_click',
      description: 'Click on a UI element on the desktop',
      capabilities: ['desktop', 'interaction'],
      execute: async (params) => await this.clickElement(params.element)
    });

    this.tools.set('desktop_type', {
      name: 'desktop_type',
      description: 'Type text on the desktop',
      capabilities: ['desktop', 'input'],
      execute: async (params) => await this.typeText(params.text, params.element)
    });

    // VS Code tools
    this.tools.set('vscode_edit', {
      name: 'vscode_edit',
      description: 'Edit a file in VS Code',
      capabilities: ['coding', 'filesystem'],
      execute: async (params) => await this.editFile(params.filePath, params.content)
    });

    // Screen tools
    this.tools.set('screen_capture', {
      name: 'screen_capture',
      description: 'Capture the current screen',
      capabilities: ['visual', 'monitoring'],
      execute: async (params) => await this.captureScreen(params)
    });
  }
}

// Singleton instance
let _computerUseOrchestrator: ComputerUseOrchestrator | null = null;

export function getComputerUseOrchestrator(
  browserEngine: BrowserEngine,
  modelRouter: ModelRouter
): ComputerUseOrchestrator {
  if (!_computerUseOrchestrator) {
    _computerUseOrchestrator = new ComputerUseOrchestrator(browserEngine, modelRouter);
  }
  return _computerUseOrchestrator;
}
