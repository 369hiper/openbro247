# OpenBro247: Aggressive Implementation Roadmap

## TL;DR

You have brilliant **architecture** but **90% stub code**. This document provides:
- Exact files that need implementation
- Code patterns to follow
- Integration points
- Testing strategy
- 3-month path to MVP

---

## Phase 1: Make Agents Actually DO Things (Weeks 1-2)

### 1.1 Complete ComputerUseOrchestrator Methods

#### Current State (BROKEN)
```typescript
// src/computer-use/orchestrator.ts
private async executeWebNavigation(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
  // TODO: Not implemented
  throw new Error('Not implemented');
}
```

#### Required Implementation

**File:** `src/computer-use/executors/webExecutor.ts` (NEW)
```typescript
import { BrowserEngine } from '../../browser/engine';
import { Logger } from '../../utils/logger';
import { ComputerUseTask, ComputerUseResult } from '../types';

export class WebExecutor {
  private logger: Logger;
  
  constructor(private browserEngine: BrowserEngine) {
    this.logger = new Logger('WebExecutor');
  }

  async execute(task: ComputerUseTask): Promise<ComputerUseResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Web task: ${task.description}`);

      // 1. Parse task parameters
      const { targetUrl, actions, assertions } = this.parseWebTask(task);

      // 2. Navigate if needed
      if (targetUrl && targetUrl !== this.browserEngine.getCurrentUrl()) {
        await this.browserEngine.navigate(targetUrl);
        await this.browserEngine.waitForLoadState('networkidle');
      }

      // 3. Execute actions (click, type, select, etc.)
      const results = [];
      for (const action of actions) {
        const result = await this.executeAction(action);
        results.push(result);
        
        if (!result.success) {
          throw new Error(`Action failed: ${action.name} - ${result.error}`);
        }
      }

      // 4. Verify assertions
      if (assertions && assertions.length > 0) {
        for (const assertion of assertions) {
          const passed = await this.verifyAssertion(assertion);
          if (!passed) {
            throw new Error(`Assertion failed: ${assertion.description}`);
          }
        }
      }

      // 5. Capture final state
      const screenshot = await this.browserEngine.takeScreenshot();
      const pageContent = await this.browserEngine.getPageContent();

      return {
        success: true,
        data: {
          screenshot,
          pageContent,
          actions: results,
          duration: Date.now() - startTime
        },
        toolUsed: 'webExecutor',
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('Web execution failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        context: await this.getCurrentContext(),
        executionTime: Date.now() - startTime,
        toolUsed: 'webExecutor'
      };
    }
  }

  private async executeAction(action: any): Promise<any> {
    switch (action.type) {
      case 'navigate':
        return await this.browserEngine.navigate(action.url);
      case 'click':
        return await this.browserEngine.click(action.selector);
      case 'type':
        return await this.browserEngine.type(action.selector, action.text);
      case 'select':
        return await this.browserEngine.select(action.selector, action.value);
      case 'scroll':
        return await this.browserEngine.scroll(action.pixels);
      case 'wait':
        return await this.browserEngine.waitForSelector(action.selector, action.timeout);
      case 'screenshot':
        return await this.browserEngine.takeScreenshot();
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async verifyAssertion(assertion: any): Promise<boolean> {
    switch (assertion.type) {
      case 'element_visible':
        return await this.browserEngine.isElementVisible(assertion.selector);
      case 'text_contains':
        const text = await this.browserEngine.getPageText();
        return text.includes(assertion.text);
      case 'url_matches':
        return this.browserEngine.getCurrentUrl().includes(assertion.pattern);
      default:
        return false;
    }
  }

  private parseWebTask(task: ComputerUseTask): any {
    // Parse task.parameters into structured format
    return {
      targetUrl: task.parameters?.url,
      actions: task.parameters?.actions || [],
      assertions: task.parameters?.assertions || []
    };
  }

  private async getCurrentContext(): Promise<any> {
    return {
      currentUrl: this.browserEngine.getCurrentUrl(),
      pageTitle: await this.browserEngine.getPageTitle(),
      timestamp: new Date()
    };
  }
}
```

**File:** `src/computer-use/executors/desktopExecutor.ts` (NEW)
```typescript
import { WindowsControl } from '../../desktop/windowsControl';
import { InputSimulator } from '../../desktop/inputSimulator';
import { ScreenCapture } from '../../desktop/screenCapture';
import { Logger } from '../../utils/logger';
import { ComputerUseTask, ComputerUseResult } from '../types';

export class DesktopExecutor {
  private logger: Logger;

  constructor(
    private windowsControl: WindowsControl,
    private inputSimulator: InputSimulator,
    private screenCapture: ScreenCapture
  ) {
    this.logger = new Logger('DesktopExecutor');
  }

  async execute(task: ComputerUseTask): Promise<ComputerUseResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Desktop task: ${task.description}`);

      const { operation, parameters } = task;

      let result: any;
      switch (operation) {
        case 'open_application':
          result = await this.openApplication(parameters.appName);
          break;
        case 'close_application':
          result = await this.closeApplication(parameters.appName);
          break;
        case 'type_text':
          result = await this.typeText(parameters.text);
          break;
        case 'click_mouse':
          result = await this.clickMouse(parameters.x, parameters.y);
          break;
        case 'read_file':
          result = await this.readFile(parameters.filePath);
          break;
        case 'write_file':
          result = await this.writeFile(parameters.filePath, parameters.content);
          break;
        case 'execute_command':
          result = await this.executeCommand(parameters.command);
          break;
        case 'screenshot':
          result = await this.takeScreenshot();
          break;
        default:
          throw new Error(`Unknown desktop operation: ${operation}`);
      }

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        toolUsed: 'desktopExecutor'
      };

    } catch (error) {
      this.logger.error('Desktop execution failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
        toolUsed: 'desktopExecutor'
      };
    }
  }

  private async openApplication(appName: string): Promise<any> {
    return await this.windowsControl.launchApplication(appName);
  }

  private async closeApplication(appName: string): Promise<any> {
    return await this.windowsControl.closeApplication(appName);
  }

  private async typeText(text: string): Promise<any> {
    return await this.inputSimulator.typeText(text);
  }

  private async clickMouse(x: number, y: number): Promise<any> {
    return await this.inputSimulator.click(x, y);
  }

  private async readFile(filePath: string): Promise<string> {
    const fs = require('fs').promises;
    return await fs.readFile(filePath, 'utf-8');
  }

  private async writeFile(filePath: string, content: string): Promise<any> {
    const fs = require('fs').promises;
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  }

  private async executeCommand(command: string): Promise<any> {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      exec(command, (error: any, stdout: string, stderr: string) => {
        if (error) reject(error);
        resolve({ stdout, stderr, command });
      });
    });
  }

  private async takeScreenshot(): Promise<Buffer> {
    return await this.screenCapture.captureScreen();
  }
}
```

**File:** `src/computer-use/executors/codeExecutor.ts` (NEW)
```typescript
import { VSCodeController } from '../../desktop/vscodeController';
import { ModelRouter } from '../../models/modelRouter';
import { Logger } from '../../utils/logger';
import { ComputerUseTask, ComputerUseResult } from '../types';

export class CodeExecutor {
  private logger: Logger;

  constructor(
    private vscodeController: VSCodeController,
    private modelRouter: ModelRouter
  ) {
    this.logger = new Logger('CodeExecutor');
  }

  async execute(task: ComputerUseTask): Promise<ComputerUseResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Code task: ${task.description}`);

      const { operation, parameters } = task;

      let result: any;
      switch (operation) {
        case 'generate_code':
          result = await this.generateCode(parameters.prompt, parameters.language);
          break;
        case 'edit_file':
          result = await this.editFile(parameters.filePath, parameters.changes);
          break;
        case 'create_file':
          result = await this.createFile(parameters.filePath, parameters.content);
          break;
        case 'run_tests':
          result = await this.runTests(parameters.testPath);
          break;
        case 'format_code':
          result = await this.formatCode(parameters.filePath);
          break;
        case 'analyze_error':
          result = await this.analyzeError(parameters.errorMessage, parameters.context);
          break;
        default:
          throw new Error(`Unknown code operation: ${operation}`);
      }

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        toolUsed: 'codeExecutor'
      };

    } catch (error) {
      this.logger.error('Code execution failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
        toolUsed: 'codeExecutor'
      };
    }
  }

  private async generateCode(prompt: string, language: string): Promise<any> {
    const systemMessage = `You are a code generation expert. Generate production-grade ${language} code based on the following requirements.\n\nBest practices:\n- Type-safe\n- Well-commented\n- Error handling\n- Following ${language} conventions`;

    const response = await this.modelRouter.route(
      'code-gen',
      { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' },
      prompt,
      { systemMessage }
    );

    return { code: response, language };
  }

  private async editFile(filePath: string, changes: any[]): Promise<any> {
    return await this.vscodeController.editFile(filePath, changes);
  }

  private async createFile(filePath: string, content: string): Promise<any> {
    return await this.vscodeController.createFile(filePath, content);
  }

  private async runTests(testPath: string): Promise<any> {
    return await this.vscodeController.runTests(testPath);
  }

  private async formatCode(filePath: string): Promise<any> {
    return await this.vscodeController.formatFile(filePath);
  }

  private async analyzeError(errorMessage: string, context: string): Promise<any> {
    const systemMessage = 'You are an expert debugging assistant. Analyze this error and provide specific fix recommendations.';

    const response = await this.modelRouter.route(
      'error-analysis',
      { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' },
      `Error: ${errorMessage}\n\nContext: ${context}`,
      { systemMessage }
    );

    return { analysis: response };
  }
}
```

**File:** `src/computer-use/orchestrator.ts` (UPDATE)
```typescript
// Add to imports
import { WebExecutor } from './executors/webExecutor';
import { DesktopExecutor } from './executors/desktopExecutor';
import { CodeExecutor } from './executors/codeExecutor';

export class ComputerUseOrchestrator {
  // ... existing code ...
  
  private webExecutor: WebExecutor;
  private desktopExecutor: DesktopExecutor;
  private codeExecutor: CodeExecutor;

  async initialize(): Promise<void> {
    try {
      await this.windowsControl.initialize();
      await this.screenCapture.initialize();
      await this.vscodeController.initialize();

      // Initialize executors
      this.webExecutor = new WebExecutor(this.browserEngine);
      this.desktopExecutor = new DesktopExecutor(
        this.windowsControl,
        getInputSimulator(),
        this.screenCapture
      );
      this.codeExecutor = new CodeExecutor(this.vscodeController, this.modelRouter);

      this.logger.info('Computer Use Orchestrator initialized');
    } catch (error) {
      this.logger.error('Failed to initialize', error);
      throw error;
    }
  }

  private async executeWebNavigation(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    return await this.webExecutor.execute(task);
  }

  private async executeDesktopOperation(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    return await this.desktopExecutor.execute(task);
  }

  private async executeCodingTask(task: ComputerUseTask, context: ComputerContext): Promise<ComputerUseResult> {
    return await this.codeExecutor.execute(task);
  }
}
```

---

### 1.2 Add Missing Desktop APIs

**File:** `src/desktop/windowsControl.ts` (UPDATE)
```typescript
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';

export class WindowsControl {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('WindowsControl');
  }

  async initialize(): Promise<void> {
    this.logger.info('WindowsControl initialized');
  }

  async launchApplication(appName: string): Promise<any> {
    try {
      const command = this.getApplicationLaunchCommand(appName);
      execSync(command, { detached: true, stdio: 'ignore' });
      return { success: true, app: appName };
    } catch (error) {
      this.logger.error(`Failed to launch ${appName}`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async closeApplication(appName: string): Promise<any> {
    try {
      const command = `taskkill /IM ${appName}.exe /F`;
      execSync(command);
      return { success: true, app: appName };
    } catch (error) {
      this.logger.error(`Failed to close ${appName}`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private getApplicationLaunchCommand(appName: string): string {
    const apps: Record<string, string> = {
      'vscode': 'code',
      'code': 'code',
      'chrome': 'chrome',
      'firefox': 'firefox',
      'notepad': 'notepad',
      'explorer': 'explorer'
    };
    return apps[appName.toLowerCase()] || appName;
  }
}
```

**File:** `src/desktop/inputSimulator.ts` (NEW)
```typescript
import { Logger } from '../utils/logger';

export class InputSimulator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('InputSimulator');
  }

  async typeText(text: string): Promise<any> {
    // Use xdotool on Linux/Mac or sendkeys on Windows
    // For MVP: keyboard event simulation via Python subprocess
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      // Placeholder: use AutoHotkey on Windows
      exec(`echo "${text}" | xclip -selection clipboard`, () => {
        exec('xdotool key ctrl+v', () => {
          resolve({ success: true, text });
        });
      });
    });
  }

  async click(x: number, y: number): Promise<any> {
    // Use xdotool or similar
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(`xdotool mousemove ${x} ${y} click 1`, () => {
        resolve({ success: true, x, y });
      });
    });
  }
}

export function getInputSimulator(): InputSimulator {
  return new InputSimulator();
}
```

---

## Phase 2: Make Agents See Things (Weeks 3-4)

### 2.1 Wire Vision System

**File:** `src/vision/visionAnalyzer.ts` (COMPLETE REWRITE)
```typescript
import axios from 'axios';
import { Logger } from '../utils/logger';

export interface ScreenAnalysis {
  elements: UIElement[];
  text: string;
  layout: any;
  colors: string[];
  state: 'interactive' | 'loading' | 'error';
}

export interface UIElement {
  type: 'button' | 'input' | 'text' | 'image' | 'link';
  label: string;
  bbox: { x: number; y: number; width: number; height: number };
  clickable: boolean;
  visible: boolean;
}

export class VisionAnalyzer {
  private logger: Logger;

  constructor(private apiKey: string, private modelId: 'gpt-4-vision' | 'claude-3-5-sonnet') {
    this.logger = new Logger('VisionAnalyzer');
  }

  async analyzeScreenshot(screenshotBase64: string): Promise<ScreenAnalysis> {
    try {
      this.logger.info('Analyzing screenshot...');

      // 1. Send to Claude Vision or GPT-4 Vision
      const visionResponse = await this.callVisionAPI(screenshotBase64);

      // 2. Parse response to extract UI elements
      const elements = this.parseUIElements(visionResponse);

      // 3. Extract text via OCR
      const text = await this.extractTextWithOCR(screenshotBase64);

      return {
        elements,
        text,
        layout: this.analyzeLayout(elements),
        colors: this.extractColors(elements),
        state: this.determinePageState(elements, text)
      };

    } catch (error) {
      this.logger.error('Vision analysis failed', error);
      return {
        elements: [],
        text: '',
        layout: {},
        colors: [],
        state: 'error'
      };
    }
  }

  private async callVisionAPI(imageBase64: string): Promise<string> {
    if (this.modelId === 'claude-3-5-sonnet') {
      return await this.callClaudeVision(imageBase64);
    } else {
      return await this.callGPT4Vision(imageBase64);
    }
  }

  private async callClaudeVision(imageBase64: string): Promise<string> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: imageBase64
                }
              },
              {
                type: 'text',
                text: `Analyze this screenshot. Identify:
1. All interactive elements (buttons, inputs, links)
2. Text content and labels
3. Visual layout and structure
4. Current page state (loading, interactive, error)

Respond in JSON format:
{
  "elements": [{"type": "button", "label": "...", "bbox": {"x": 0, "y": 0, "width": 100, "height": 40}, "clickable": true}],
  "text": "extracted text",
  "state": "interactive"
}`
              }
            ]
          }
        ]
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    return response.data.content[0].text;
  }

  private async callGPT4Vision(imageBase64: string): Promise<string> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-vision-preview',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`
                }
              },
              {
                type: 'text',
                text: 'Identify all interactive elements (buttons, inputs, links) and describe layout...'
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      }
    );

    return response.data.choices[0].message.content;
  }

  private parseUIElements(response: string): UIElement[] {
    try {
      const parsed = JSON.parse(response);
      return parsed.elements || [];
    } catch {
      return [];
    }
  }

  private async extractTextWithOCR(screenshotBase64: string): Promise<string> {
    // Integrate Tesseract or EasyOCR
    // For MVP: use simple regex on vision response
    return 'TODO: Implement OCR integration';
  }

  private analyzeLayout(elements: UIElement[]): any {
    return {
      elementCount: elements.length,
      interactive: elements.filter(e => e.clickable).length,
      bbox: this.calculateBoundingBox(elements)
    };
  }

  private extractColors(elements: UIElement[]): string[] {
    // Extract dominant colors from UI
    return ['#ffffff', '#000000'];
  }

  private determinePageState(elements: UIElement[], text: string): 'interactive' | 'loading' | 'error' {
    if (text.toLowerCase().includes('loading')) return 'loading';
    if (text.toLowerCase().includes('error')) return 'error';
    return 'interactive';
  }

  private calculateBoundingBox(elements: UIElement[]): any {
    if (elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    // Calculate collective bbox
    return elements[0].bbox;
  }
}
```

**File:** `src/vision/screenCapture.ts` (COMPLETE REWRITE)
```typescript
import { Screenshot, getScreenshot } from './desktop/screenCapture'; // Native binding
import { Logger } from '../utils/logger';

export class ScreenCaptureService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ScreenCapture');
  }

  async captureScreen(): Promise<Buffer> {
    try {
      // Use native Windows API for high-performance capture
      const screenshot = getScreenshot();
      return Buffer.from(screenshot);
    } catch (error) {
      this.logger.error('Screen capture failed', error);
      throw error;
    }
  }

  async captureScreenAsBase64(): Promise<string> {
    const buffer = await this.captureScreen();
    return buffer.toString('base64');
  }

  async startRecording(outputPath: string): Promise<any> {
    // Use ffmpeg or similar for video recording
    return { started: true };
  }

  async stopRecording(): Promise<any> {
    return { stopped: true };
  }
}
```

---

## Phase 3: Expand Tool Registry (Week 2 in parallel)

**File:** `src/skills/toolRegistry.ts` (ADD THESE TOOLS)

```typescript
// File Operations
registry.register({
  name: 'read_file',
  description: 'Read contents of a file',
  inputSchema: {
    path: { type: 'string', description: 'File path', required: true }
  },
  handler: async (input) => {
    const fs = require('fs').promises;
    try {
      const content = await fs.readFile(input.path, 'utf-8');
      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to read file' };
    }
  }
});

registry.register({
  name: 'write_file',
  description: 'Write content to a file',
  inputSchema: {
    path: { type: 'string', description: 'File path', required: true },
    content: { type: 'string', description: 'File content', required: true }
  },
  handler: async (input) => {
    const fs = require('fs').promises;
    try {
      await fs.writeFile(input.path, input.content, 'utf-8');
      return { success: true, data: { path: input.path } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to write file' };
    }
  }
});

// Terminal Execution
registry.register({
  name: 'execute_command',
  description: 'Execute a terminal command',
  inputSchema: {
    command: { type: 'string', description: 'Command to execute', required: true },
    cwd: { type: 'string', description: 'Working directory' }
  },
  handler: async (input) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(input.command, { cwd: input.cwd || '.' }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true, data: { stdout, stderr } });
        }
      });
    });
  }
});

// Browser Operations (via BrowserEngine)
registry.register({
  name: 'browser_navigate',
  description: 'Navigate browser to URL',
  inputSchema: {
    url: { type: 'string', description: 'Target URL', required: true }
  },
  handler: async (input) => {
    try {
      await browserEngine.navigate(input.url);
      return { success: true, data: { url: input.url } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to navigate' };
    }
  }
});

registry.register({
  name: 'browser_click',
  description: 'Click element on page',
  inputSchema: {
    selector: { type: 'string', description: 'CSS selector', required: true }
  },
  handler: async (input) => {
    try {
      await browserEngine.click(input.selector);
      return { success: true, data: { selector: input.selector } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to click' };
    }
  }
});

// Vision Operations
registry.register({
  name: 'analyze_screenshot',
  description: 'Analyze current screenshot',
  inputSchema: {},
  handler: async (input) => {
    try {
      const screenshotBase64 = await screenCapture.captureScreenAsBase64();
      const analysis = await visionAnalyzer.analyzeScreenshot(screenshotBase64);
      return { success: true, data: analysis };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Analysis failed' };
    }
  }
});
```

---

## Phase 4: Implement Learning Loop (Week 4 + ongoing)

**File:** `src/computer-use/learningLoop.ts` (NEW)

```typescript
import { SQLiteStore } from '../memory/sqliteStore';
import { ModelRouter } from '../models/modelRouter';
import { Logger } from '../utils/logger';

export interface TaskOutcome {
  taskId: string;
  success: boolean;
  duration: number;
  attemptsRequired: number;
  errors: string[];
  improvements: string[];
}

export class LearningLoop {
  private logger: Logger;

  constructor(
    private sqliteStore: SQLiteStore,
    private modelRouter: ModelRouter
  ) {
    this.logger = new Logger('LearningLoop');
  }

  async recordOutcome(outcome: TaskOutcome): Promise<void> {
    this.logger.info(`Recording outcome for task ${outcome.taskId}`);

    // 1. Store the outcome
    await this.sqliteStore.insertRecord('task_outcomes', outcome);

    // 2. Find similar past tasks
    const similarTasks = await this.findSimilarTasks(outcome.taskId);

    // 3. Extract patterns
    const patterns = await this.extractPatterns([outcome, ...similarTasks]);

    // 4. Generate improvements
    const improvements = await this.generateImprovements(outcome, patterns);

    // 5. Store improvements for future use
    await this.storeImprovements(outcome.taskId, improvements);

    this.logger.info(`Learning recorded: ${improvements.length} improvements generated`);
  }

  private async findSimilarTasks(taskId: string): Promise<TaskOutcome[]> {
    const query = `
      SELECT * FROM task_outcomes
      WHERE taskId LIKE ? AND timestamp > datetime('now', '-7 days')
      ORDER BY timestamp DESC
      LIMIT 5
    `;
    return await this.sqliteStore.query(query, [taskId.split('-')[0] + '%']);
  }

  private async extractPatterns(outcomes: TaskOutcome[]): Promise<any[]> {
    const patterns = [];

    // Success patterns
    const successful = outcomes.filter(o => o.success);
    if (successful.length > 0) {
      patterns.push({
        type: 'success_pattern',
        avgDuration: successful.reduce((a, o) => a + o.duration, 0) / successful.length,
        errorRate: (outcomes.filter(o => !o.success).length / outcomes.length)
      });
    }

    // Error patterns
    const errors = outcomes.flatMap(o => o.errors);
    const errorCounts = new Map();
    errors.forEach(e => {
      errorCounts.set(e, (errorCounts.get(e) || 0) + 1);
    });
    if (errorCounts.size > 0) {
      patterns.push({
        type: 'error_pattern',
        commonErrors: Array.from(errorCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
      });
    }

    return patterns;
  }

  private async generateImprovements(outcome: TaskOutcome, patterns: any[]): Promise<string[]> {
    const systemPrompt = `You are a process optimization AI. Given task outcomes and patterns, suggest improvements to the task execution strategy.`;

    const prompt = `
      Task Outcome: ${JSON.stringify(outcome)}
      Patterns: ${JSON.stringify(patterns)}

      Suggest 3-5 specific, actionable improvements for the next attempt.
      Format: JSON array of strings
    `;

    const response = await this.modelRouter.route('learning', {}, prompt, { systemMessage: systemPrompt });

    try {
      return JSON.parse(response);
    } catch {
      return [response];
    }
  }

  private async storeImprovements(taskId: string, improvements: string[]): Promise<void> {
    for (const improvement of improvements) {
      await this.sqliteStore.insertRecord('task_improvements', {
        taskId,
        improvement,
        timestamp: new Date().toISOString(),
        applied: false
      });
    }
  }

  async getStrategyForTask(taskId: string): Promise<any[]> {
    const improvements = await this.sqliteStore.query(
      `SELECT improvement FROM task_improvements WHERE taskId LIKE ? ORDER BY timestamp DESC LIMIT 5`,
      [taskId.split('-')[0] + '%']
    );

    return improvements.map(r => r.improvement);
  }
}
```

---

## Testing Strategy

**File:** `src/__tests__/computer-use.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ComputerUseOrchestrator } from '../computer-use/orchestrator';
import { BrowserEngine } from '../browser/engine';

describe('ComputerUseOrchestrator', () => {
  let orchestrator: ComputerUseOrchestrator;
  let browserEngine: BrowserEngine;

  beforeAll(async () => {
    browserEngine = new BrowserEngine({ headless: true });
    orchestrator = new ComputerUseOrchestrator(browserEngine, null);
    await orchestrator.initialize();
    await browserEngine.launch();
  });

  afterAll(async () => {
    await browserEngine.close();
  });

  it('should execute web navigation tasks', async () => {
    const task = {
      id: 'test-1',
      type: 'web_navigation' as const,
      description: 'Navigate to Google',
      parameters: {
        url: 'https://google.com',
        actions: [
          { type: 'navigate', url: 'https://google.com' }
        ]
      }
    };

    const result = await orchestrator.executeComputerTask(task as any);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should handle desktop operations', async () => {
    const task = {
      id: 'test-2',
      type: 'desktop_operation' as const,
      description: 'Take screenshot',
      operation: 'screenshot',
      parameters: {}
    };

    const result = await orchestrator.executeComputerTask(task as any);
    expect(result.success).toBe(true);
  });

  it('should analyze screenshots', async () => {
    const analyzer = new VisionAnalyzer('api-key', 'claude-3-5-sonnet');
    const screenshot = await browserEngine.takeScreenshot();
    const analysis = await analyzer.analyzeScreenshot(screenshot.toString('base64'));
    
    expect(analysis.elements).toBeDefined();
    expect(analysis.text).toBeDefined();
  });
});
```

---

## Deployment Path

### MVP (3 months)
```
Node.js + Express API
├── Computer Orchestrator (complete)
├── Vision System (wired)
├── Desktop Control (working)
├── Tool Registry (20+ tools)
└── Learning Loop (basic)
```

### Phase 2 (months 4-6)
```
+ Channel Integrations (Discord, Telegram)
+ Advanced Learning
+ Performance Optimization
+ Monitoring Dashboard
```

### Phase 3 (months 7-12)
```
+ Multi-agent Orchestration
+ Enterprise Features
+ Cloud Deployment
+ SaaS Infrastructure
```

---

## Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| Task Success Rate | > 85% | Week 8 |
| Avg Execution Time | < 5s (web), < 10s (desktop) | Week 10 |
| Vision Accuracy | > 90% element detection | Week 4 |
| Tool Coverage | 20+ functional tools | Week 2 |
| Learning Effectiveness | 30% faster on repeated tasks | Week 12 |
| Production Stability | 99.5% uptime | Week 14 |

---

This roadmap is **achievable** with focused effort. The code patterns are provided. The integrations are clear. The only missing ingredient is **execution**.

**Start with Week 1: Implement the three executors. Get ONE thing working end-to-end first. Then iterate.**

Get started and let me know when you hit blockers!
