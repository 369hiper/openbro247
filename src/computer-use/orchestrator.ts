import { BrowserEngine } from '../browser/engine';
import { WindowsControl, getWindowsControl } from '../desktop/windowsControl';
import { ScreenCapture, getScreenCapture } from '../desktop/screenCapture';
import { IDEController } from './types';
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
  UIElement,
  ExecutionPlan,
  ExecutionStep,
  ExecutionLogEntry,
  GoalNotification,
  Artifact,
  Capability,
  AutonomousAgentConfig,
  AgentState,
} from './types';
import { AutonomousAgent, createAutonomousAgent, getAutonomousAgent } from './autonomousAgent';
import { TaskPlanner } from './taskPlanner';
import { ExecutionLogger } from './executionLogger';
import { SelfImprovement } from './selfImprovement';
import { GoalNotifier } from './goalNotifier';

export class ComputerUseOrchestrator {
  private browserEngine: BrowserEngine;
  private windowsControl: WindowsControl;
  private screenCapture: ScreenCapture;
  private ideController: IDEController;
  private modelRouter: ModelRouter;
  private logger: Logger;

  private tools: Map<string, ComputerTool> = new Map();
  private activeTasks: Map<string, ComputerUseTask> = new Map();
  private contextHistory: ComputerContext[] = [];

  constructor(browserEngine: BrowserEngine, modelRouter: ModelRouter, ideController: IDEController) {
    this.browserEngine = browserEngine;
    this.windowsControl = getWindowsControl();
    this.screenCapture = getScreenCapture();
    this.ideController = ideController;
    this.modelRouter = modelRouter;
    this.logger = new Logger('ComputerUseOrchestrator');

    this.initializeTools();
  }

  async initialize(): Promise<void> {
    try {
      await this.windowsControl.initialize();
      await this.screenCapture.initialize();
      await this.ideController.initialize();

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
        toolUsed: 'orchestrator',
      };
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  async executeHighLevelOperation(operation: ComputerOperation): Promise<ComputerUseResult> {
    const startTime = Date.now();

    try {
      this.logger.info(
        `Executing high-level operation: ${operation.type} - ${operation.description || ''}`
      );

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
        case 'browser_screenshot':
          result = await this.captureScreen(operation.parameters);
          break;
        case 'type_text':
        case 'browser_type':
          result = await this.typeText(operation.parameters?.text, operation.parameters?.element);
          break;
        case 'click_element':
        case 'browser_click':
          if (operation.parameters?.selector) {
            await this.browserEngine.click(operation.parameters.selector);
            result = { clicked: operation.parameters.selector };
          } else {
            result = await this.clickElement(operation.parameters?.element);
          }
          break;
        case 'edit_file':
        case 'vscode_edit':
        case 'vscode_write':
          result = await this.editFile(
            operation.parameters?.filePath,
            operation.parameters?.content || operation.parameters?.changes
          );
          break;
        case 'run_command':
        case 'terminal_run':
          result = await this.runTerminalCommand(
            operation.parameters?.command,
            operation.parameters?.cwd
          );
          break;
        case 'monitor_screen':
          result = await this.monitorScreen(operation.parameters);
          break;
        case 'browser_get_elements':
          result = { elements: await this.getBrowserElements() };
          break;
        case 'browser_get_accessibility_tree':
          const tree = await this.getAccessibilityTree();
          const content = await this.extractPageContent();
          result = { accessibilityTree: tree, pageInfo: content };
          break;
        case 'extract_page_content':
          result = await this.extractPageContent();
          break;
        case 'desktop_get_windows':
          result = { windows: await this.windowsControl.getWindows() };
          break;
        case 'desktop_launch_app':
          result = {
            processId: await this.windowsControl.launchApplication(
              operation.target!,
              operation.parameters?.args
            ),
          };
          break;
        case 'npm_install':
          result = await this.runTerminalCommand(
            `cd "${operation.parameters?.cwd || '.'}" && npm install`,
            operation.parameters?.cwd
          );
          break;
        case 'run_server':
          result = await this.runTerminalCommand(
            operation.parameters?.command,
            operation.parameters?.cwd
          );
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      return {
        success: true,
        data: result,
        context: await this.getCurrentContext(),
        executionTime: Date.now() - startTime,
        toolUsed: operation.type,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        context: await this.getCurrentContext(),
        executionTime: Date.now() - startTime,
        toolUsed: operation.type,
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
        timestamp: new Date(),
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
        timestamp: new Date(),
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
    if (!(await this.browserEngine.isLaunched())) {
      await this.browserEngine.launch();
    }

    await this.browserEngine.navigate(url);
    const title = await this.browserEngine.getTitle();
    const finalUrl = await this.browserEngine.getCurrentUrl();

    this.logger.info(`Navigated to: ${finalUrl}`);
    return { url: finalUrl, title };
  }

  public async captureScreen(options?: any): Promise<any> {
    const screenshot = await this.screenCapture.capture(options);
    const monitors = await this.screenCapture.getMonitors();

    this.logger.info(`Captured screen (${screenshot.length} bytes)`);
    return {
      screenshot,
      monitors,
      format: options?.format || 'png',
      size: screenshot.length,
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
    await this.ideController.writeFile(filePath, changes);
    this.logger.info(`Edited file: ${filePath}`);
    return { file: filePath, modified: true };
  }

  private async runTerminalCommand(command: string, cwd?: string): Promise<any> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const options = cwd ? { cwd, timeout: 60000 } : { timeout: 60000 };
      const { stdout, stderr } = await execAsync(command, options);
      this.logger.info(`Ran terminal command: ${command}`);
      return {
        command,
        executed: true,
        stdout: stdout.substring(0, 50000),
        stderr: stderr.substring(0, 10000),
        success: stderr.length === 0,
      };
    } catch (error: any) {
      this.logger.error(`Terminal command failed: ${command}`, error);
      return {
        command,
        executed: true,
        stdout: error.stdout?.substring(0, 50000) || '',
        stderr: error.message || error.stderr?.substring(0, 10000) || 'Command failed',
        success: false,
      };
    }
  }

  private async monitorScreen(options?: any): Promise<any> {
    const screenshot = await this.screenCapture.capture(options);
    const previousContext = this.contextHistory[this.contextHistory.length - 2];

    let changes = null;
    if (previousContext?.screenState?.screenshot) {
      changes = await this.screenCapture.detectChanges(previousContext.screenState.screenshot, {
        threshold: options?.threshold || 0.1,
      });
    }

    return {
      screenshot,
      changes,
      timestamp: new Date(),
    };
  }

  private async getBrowserElements(): Promise<any[]> {
    if (!(await this.browserEngine.isLaunched())) {
      return [];
    }

    try {
      const elements = await this.browserEngine.evaluate(`
        () => {
          const getElementInfo = (el) => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              className: el.className || null,
              name: el.getAttribute('name') || null,
              type: el.getAttribute('type') || null,
              placeholder: el.getAttribute('placeholder') || null,
              text: el.innerText?.substring(0, 100) || el.textContent?.substring(0, 100) || null,
              href: el.href || null,
              role: el.getAttribute('role') || null,
              ariaLabel: el.getAttribute('aria-label') || null,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              isVisible: rect.width > 0 && rect.height > 0 &&
                window.getComputedStyle(el).display !== 'none' &&
                window.getComputedStyle(el).visibility !== 'hidden'
            };
          };

          const selectors = [
            'a[href]', 'button', 'input', 'select', 'textarea',
            '[role="button"]', '[role="link"]', '[tabindex]:not([tabindex="-1"])',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div'
          ];

          const elements = [];
          const seen = new Set();

          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
              const info = getElementInfo(el);
              if (info.isVisible && (info.text?.trim() || info.placeholder || info.ariaLabel || info.type)) {
                const key = info.tag + '-' + (info.id || info.className?.split(' ')[0] || info.text?.substring(0, 20));
                if (!seen.has(key)) {
                  seen.add(key);
                  elements.push(info);
                }
              }
            });
          });

          return elements.slice(0, 50);
        }
      `);
      return (elements as any[]) || [];
    } catch (error) {
      this.logger.error('Failed to get browser elements', error);
      return [];
    }
  }

  private async getAccessibilityTree(): Promise<string> {
    const elements = await this.getBrowserElements();

    if (elements.length === 0) {
      return 'No accessible elements found';
    }

    return elements
      .map((el, i) => {
        const label = el.text?.trim() || el.placeholder || el.ariaLabel || el.type || el.tag;
        return `[${i}] ${el.tag}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ')[0] : ''}: "${label}"${el.href ? ' (link to: ' + el.href.substring(0, 50) + '...)' : ''}`;
      })
      .join('\n');
  }

  private async extractPageContent(): Promise<{
    title: string;
    url: string;
    mainContent: string;
    headings: string[];
  }> {
    if (!(await this.browserEngine.isLaunched())) {
      return { title: '', url: '', mainContent: '', headings: [] };
    }

    try {
      const result = await this.browserEngine.evaluate(`
        () => {
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .map(h => h.innerText.substring(0, 100))
            .slice(0, 10);
          
          const mainContent = document.body?.innerText?.substring(0, 2000) || '';
          
          return {
            title: document.title || '',
            url: window.location.href || '',
            mainContent,
            headings
          };
        }
      `);
      return result as any;
    } catch (error) {
      this.logger.error('Failed to extract page content', error);
      return { title: '', url: '', mainContent: '', headings: [] };
    }
  }

  private async executeWebNavigation(
    task: ComputerUseTask,
    context: ComputerContext
  ): Promise<ComputerUseResult> {
    try {
      const targetUrl = task.metadata?.url || task.metadata?.target;

      if (targetUrl) {
        if (!(await this.browserEngine.isLaunched())) {
          await this.browserEngine.launch();
        }
        await this.browserEngine.navigate(targetUrl);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const screenshot = await this.browserEngine.screenshot();
      const elements = await this.getBrowserElements();
      const content = await this.extractPageContent();
      const accessibilityTree = await this.getAccessibilityTree();

      return {
        success: true,
        data: {
          navigated: true,
          url: content.url,
          title: content.title,
          elementsCount: elements.length,
          accessibilityTree,
        },
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'web_navigation',
        screenshot,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'web_navigation',
      };
    }
  }

  private async executeDesktopOperation(
    task: ComputerUseTask,
    context: ComputerContext
  ): Promise<ComputerUseResult> {
    try {
      const operation = task.metadata?.operation || task.metadata?.action;
      const target = task.metadata?.target;

      let result: any = { operation };

      switch (operation) {
        case 'launch_app':
          if (target) {
            const pid = await this.windowsControl.launchApplication(target);
            result = { launched: true, processId: pid };
          }
          break;
        case 'close_app':
          if (target) {
            const windows = await this.windowsControl.getWindows();
            const appWindow = windows.find(w =>
              w.title.toLowerCase().includes(target.toLowerCase())
            );
            if (appWindow) {
              await this.windowsControl.closeWindow(appWindow.hwnd);
              result = { closed: true };
            }
          }
          break;
        case 'click_element':
          if (target) {
            const element = await this.windowsControl.findUIElement(target);
            if (element) {
              await this.windowsControl.clickElement(element);
              result = { clicked: element.name };
            }
          }
          break;
        case 'type_text':
          if (target) {
            await this.windowsControl.typeText(target);
            result = { typed: target.length };
          }
          break;
        case 'get_windows':
          const windows = await this.windowsControl.getWindows();
          result = { windows: windows.length, list: windows.map(w => w.title).slice(0, 20) };
          break;
        default:
          const screenshot = await this.screenCapture.capture();
          result.screenshot = true;
      }

      return {
        success: true,
        data: result,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'desktop_operation',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'desktop_operation',
      };
    }
  }

  private async executeCodingTask(
    task: ComputerUseTask,
    context: ComputerContext
  ): Promise<ComputerUseResult> {
    try {
      const operation = task.metadata?.operation;
      const filePath = task.metadata?.filePath;
      const content = task.metadata?.content;
      const command = task.metadata?.command;

      let result: any = { operation };

      switch (operation) {
        case 'write_file':
          if (filePath && content) {
            await this.ideController.writeFile(filePath, content);
            result = { written: true, path: filePath };
          }
          break;
        case 'read_file':
          if (filePath) {
            const fileContent = await this.ideController.readFile(filePath);
            result = { path: filePath, content: fileContent.substring(0, 50000) };
          }
          break;
        case 'run_command':
          if (command) {
            const output = await this.runTerminalCommand(command, task.metadata?.cwd);
            result = output;
          }
          break;
        case 'npm_install':
          if (filePath) {
            const output = await this.runTerminalCommand(
              `cd "${filePath}" && npm install`,
              filePath
            );
            result = output;
          }
          break;
        case 'run_server':
          if (command) {
            const output = await this.runTerminalCommand(command, task.metadata?.cwd);
            result = output;
          }
          break;
        default:
          result.error = 'Unknown coding operation';
      }

      return {
        success: true,
        data: result,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'coding_task',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'coding_task',
      };
    }
  }

  private async executeResearchTask(
    task: ComputerUseTask,
    context: ComputerContext
  ): Promise<ComputerUseResult> {
    try {
      const query = task.metadata?.query;
      const targetUrl = task.metadata?.url;

      if (targetUrl) {
        if (!(await this.browserEngine.isLaunched())) {
          await this.browserEngine.launch();
        }
        await this.browserEngine.navigate(targetUrl);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else if (query) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
        if (!(await this.browserEngine.isLaunched())) {
          await this.browserEngine.launch();
        }
        await this.browserEngine.navigate(searchUrl);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const screenshot = await this.browserEngine.screenshot();
      const content = await this.extractPageContent();
      const elements = await this.getBrowserElements();

      const links = elements
        .filter(el => el.tag === 'a' && el.href)
        .slice(0, 15)
        .map(el => ({ text: el.text, href: el.href }));

      return {
        success: true,
        data: {
          query: query || targetUrl,
          title: content.title,
          content: content.mainContent.substring(0, 5000),
          links,
          elementsCount: elements.length,
        },
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'research',
        screenshot,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'research',
      };
    }
  }

  private async executeMonitoringTask(
    task: ComputerUseTask,
    context: ComputerContext
  ): Promise<ComputerUseResult> {
    try {
      const screenshot = await this.screenCapture.capture();
      const windows = await this.windowsControl.getWindows();
      const processes = await this.windowsControl.getProcesses();

      const url = (await this.browserEngine.isLaunched())
        ? await this.browserEngine.getCurrentUrl()
        : null;

      return {
        success: true,
        data: {
          activeWindows: windows.length,
          windowList: windows.slice(0, 10).map(w => ({ title: w.title, className: w.className })),
          processesCount: processes.length,
          topProcesses: processes
            .slice(0, 5)
            .map(p => ({ name: p.name, memory: Math.round(p.memory / 1024 / 1024) + 'MB' })),
          browserUrl: url,
          timestamp: new Date().toISOString(),
        },
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'monitoring',
        screenshot,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'monitoring',
      };
    }
  }

  private async executeComplexWorkflow(
    task: ComputerUseTask,
    context: ComputerContext
  ): Promise<ComputerUseResult> {
    try {
      const steps = task.metadata?.steps || [];
      const results = [];

      for (const step of steps) {
        const stepResult = await this.executeHighLevelOperation(step);
        results.push({ step: step.type, result: stepResult });

        if (!stepResult.success) {
          throw new Error(`Step ${step.type} failed: ${stepResult.error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const screenshot = await this.screenCapture.capture();

      return {
        success: true,
        data: {
          workflow: true,
          stepsCompleted: results.length,
          results,
        },
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'complex_workflow',
        screenshot,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        context: await this.getCurrentContext(),
        executionTime: 0,
        toolUsed: 'complex_workflow',
      };
    }
  }

  private initializeTools(): void {
    // Browser tools
    this.tools.set('browser_navigate', {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser',
      capabilities: ['web', 'navigation'],
      execute: async params => {
        if (!(await this.browserEngine.isLaunched())) {
          await this.browserEngine.launch();
        }
        return await this.navigateToUrl(params.url);
      },
    });

    this.tools.set('browser_click', {
      name: 'browser_click',
      description: 'Click on an element in the browser using selector',
      capabilities: ['web', 'interaction'],
      execute: async params => {
        if (!(await this.browserEngine.isLaunched())) {
          await this.browserEngine.launch();
        }
        return await this.browserEngine.click(params.selector);
      },
    });

    this.tools.set('browser_type', {
      name: 'browser_type',
      description: 'Type text into an element in the browser',
      capabilities: ['web', 'input'],
      execute: async params => {
        if (!(await this.browserEngine.isLaunched())) {
          await this.browserEngine.launch();
        }
        return await this.browserEngine.type(params.text, params.selector, params.clear ?? true);
      },
    });

    this.tools.set('browser_screenshot', {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the browser',
      capabilities: ['web', 'visual'],
      execute: async params => {
        if (!(await this.browserEngine.isLaunched())) {
          return { error: 'Browser not launched' };
        }
        const screenshot = await this.browserEngine.screenshot(params.path);
        return { screenshot: screenshot.toString('base64'), size: screenshot.length };
      },
    });

    this.tools.set('browser_get_elements', {
      name: 'browser_get_elements',
      description: 'Get all interactive elements from the browser page',
      capabilities: ['web', 'analysis'],
      execute: async params => {
        if (!(await this.browserEngine.isLaunched())) {
          return { error: 'Browser not launched' };
        }
        const elements = await this.getBrowserElements();
        return { elements, count: elements.length };
      },
    });

    this.tools.set('browser_get_accessibility_tree', {
      name: 'browser_get_accessibility_tree',
      description: 'Get accessibility tree for LLM understanding of the page',
      capabilities: ['web', 'analysis'],
      execute: async params => {
        if (!(await this.browserEngine.isLaunched())) {
          return { error: 'Browser not launched' };
        }
        const tree = await this.getAccessibilityTree();
        const content = await this.extractPageContent();
        return { accessibilityTree: tree, pageInfo: content };
      },
    });

    // Desktop tools
    this.tools.set('desktop_click', {
      name: 'desktop_click',
      description: 'Click on a UI element on the desktop',
      capabilities: ['desktop', 'interaction'],
      execute: async params => await this.clickElement(params.element),
    });

    this.tools.set('desktop_type', {
      name: 'desktop_type',
      description: 'Type text on the desktop',
      capabilities: ['desktop', 'input'],
      execute: async params => await this.typeText(params.text, params.element),
    });

    this.tools.set('desktop_get_windows', {
      name: 'desktop_get_windows',
      description: 'Get list of all open windows',
      capabilities: ['desktop', 'monitoring'],
      execute: async params => {
        const windows = await this.windowsControl.getWindows();
        return { windows, count: windows.length };
      },
    });

    this.tools.set('desktop_find_element', {
      name: 'desktop_find_element',
      description: 'Find a UI element by name',
      capabilities: ['desktop', 'analysis'],
      execute: async params => {
        const element = await this.windowsControl.findUIElement(params.name);
        return { element };
      },
    });

    this.tools.set('desktop_launch_app', {
      name: 'desktop_launch_app',
      description: 'Launch an application',
      capabilities: ['desktop', 'execution'],
      execute: async params => {
        const pid = await this.windowsControl.launchApplication(params.app, params.args);
        return { processId: pid };
      },
    });

    this.tools.set('desktop_get_processes', {
      name: 'desktop_get_processes',
      description: 'Get list of running processes',
      capabilities: ['desktop', 'monitoring'],
      execute: async params => {
        const processes = await this.windowsControl.getProcesses();
        return { processes: processes.slice(0, 20), count: processes.length };
      },
    });

    // Terminal/Code tools
    this.tools.set('terminal_run', {
      name: 'terminal_run',
      description: 'Run a terminal command',
      capabilities: ['terminal', 'execution'],
      execute: async params => await this.runTerminalCommand(params.command, params.cwd),
    });

    // VS Code tools
    this.tools.set('vscode_edit', {
      name: 'vscode_edit',
      description: 'Edit a file in VS Code',
      capabilities: ['coding', 'filesystem'],
      execute: async params => await this.editFile(params.filePath, params.content),
    });

    this.tools.set('vscode_write', {
      name: 'vscode_write',
      description: 'Write content to a file',
      capabilities: ['coding', 'filesystem'],
      execute: async params => await this.editFile(params.filePath, params.content),
    });

    // Screen tools
    this.tools.set('screen_capture', {
      name: 'screen_capture',
      description: 'Capture the current screen',
      capabilities: ['visual', 'monitoring'],
      execute: async params => await this.captureScreen(params),
    });

    // Monitor tools
    this.tools.set('monitor_system', {
      name: 'monitor_system',
      description: 'Monitor system state (windows, processes, browser)',
      capabilities: ['monitoring'],
      execute: async params => {
        const screenshot = await this.screenCapture.capture();
        const windows = await this.windowsControl.getWindows();
        const processes = await this.windowsControl.getProcesses();
        const url = (await this.browserEngine.isLaunched())
          ? await this.browserEngine.getCurrentUrl()
          : null;
        return {
          windows: windows.slice(0, 20),
          processes: processes.slice(0, 20),
          browserUrl: url,
          screenshot: screenshot.toString('base64'),
        };
      },
    });
  }
}

// Singleton instance
let _computerUseOrchestrator: ComputerUseOrchestrator | null = null;

export function getComputerUseOrchestrator(
  browserEngine: BrowserEngine,
  modelRouter: ModelRouter,
  ideController: IDEController
): ComputerUseOrchestrator {
  if (!_computerUseOrchestrator) {
    _computerUseOrchestrator = new ComputerUseOrchestrator(browserEngine, modelRouter, ideController);
  }
  return _computerUseOrchestrator;
}

// ============================================================================
// AUTONOMOUS AGENT INTEGRATION (KiloCode 2.0 Style)
// ============================================================================

/**
 * Create a fully integrated autonomous agent with KiloCode 2.0 capabilities.
 * This is the main entry point for building a true agentic AI that can:
 * - Research topics via web browsing
 * - Build and run applications
 * - Test and fix issues automatically
 * - Self-improve by adding new capabilities
 * - Log all activities comprehensively
 * - Notify users when goals are accomplished
 */
export function createIntegratedAutonomousAgent(
  browserEngine: BrowserEngine,
  modelRouter: ModelRouter,
  config?: Partial<AutonomousAgentConfig>
): AutonomousAgent {
  const agent = createAutonomousAgent(browserEngine, modelRouter, {
    name: config?.name || 'KiloAgent',
    workspace: config?.workspace || './workspace',
    llmModel: config?.llmModel || 'anthropic/claude-3-5-sonnet',
    maxConcurrentTasks: config?.maxConcurrentTasks || 3,
    maxRetries: config?.maxRetries || 3,
    timeout: config?.timeout || 300000,
    autoNotify: config?.autoNotify ?? true,
    notificationChannels: config?.notificationChannels || ['websocket'],
    selfImprovementEnabled: config?.selfImprovementEnabled ?? true,
    browserConfig: {
      headless: config?.browserConfig?.headless ?? false,
      defaultTimeout: config?.browserConfig?.defaultTimeout || 30000,
      screenshotOnFailure: config?.browserConfig?.screenshotOnFailure ?? true,
    },
  });

  return agent;
}
