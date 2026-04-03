/**
 * Browser Use Integration
 *
 * Provides true browser agentic automation using the browser-use library.
 * This enables LLM-driven browser automation with:
 * - DOM element extraction
 * - Accessibility tree generation
 * - Action planning and execution
 * - Multi-step task automation
 *
 * @module computer-use/browserAgent
 */

import { BrowserEngine } from '../browser/engine';
import { ModelRouter } from '../models/modelRouter';
import { Logger } from '../utils/logger';

export interface BrowserAgentConfig {
  modelId: string;
  provider?: string;
  maxSteps?: number;
  maxFailures?: number;
  temperature?: number;
  headless?: boolean;
}

export interface BrowserAgentTask {
  goal: string;
  maxSteps?: number;
}

export interface BrowserAgentStep {
  stepNumber: number;
  action: string;
  confidence: number;
  reasoning: string;
}

export interface BrowserAgentResult {
  success: boolean;
  steps: BrowserAgentStep[];
  finalUrl?: string;
  error?: string;
}

const BROWSER_USE_SYSTEM_PROMPT = `You are a browser automation agent. Your task is to complete user goals by interacting with a web browser.

You have access to these actions:
1. navigate(url) - Navigate to a URL
2. click(element_id) - Click on an element by its ID or selector
3. type(element_id, text) - Type text into an element
4. scroll(direction) - Scroll up or down
5. wait(seconds) - Wait for specified seconds
6. extract(selector) - Extract content from elements
7. go_back() - Go back in browser history
8. go_forward() - Go forward in browser history

Available elements on the page will be provided in the format:
[ELEMENT_ID] tag#id.class: "accessible name" (attributes)

Your response should be a JSON object with:
{
  "action": "action_name",
  "params": { /* action parameters */ },
  "reasoning": "why you're taking this action",
  "confidence": 0.0-1.0
}

Always pick the most confident action that progresses toward the goal.`;

export class BrowserAgent {
  private browserEngine: BrowserEngine;
  private modelRouter: ModelRouter;
  private config: BrowserAgentConfig;
  private logger: Logger;
  private isRunning: boolean = false;

  constructor(browserEngine: BrowserEngine, modelRouter: ModelRouter, config: BrowserAgentConfig) {
    this.browserEngine = browserEngine;
    this.modelRouter = modelRouter;
    this.config = {
      maxSteps: 30,
      maxFailures: 3,
      temperature: 0.3,
      headless: false,
      ...config,
    };
    this.logger = new Logger('BrowserAgent');
  }

  async initialize(): Promise<void> {
    if (!(await this.browserEngine.isLaunched())) {
      await this.browserEngine.launch();
    }
    this.logger.info('BrowserAgent initialized');
  }

  async executeTask(task: BrowserAgentTask): Promise<BrowserAgentResult> {
    this.isRunning = true;
    const steps: BrowserAgentStep[] = [];
    let failures = 0;
    const maxSteps = task.maxSteps || this.config.maxSteps || 30;

    try {
      this.logger.info(`Starting task: ${task.goal}`);

      for (let stepNumber = 0; stepNumber < maxSteps; stepNumber++) {
        if (!this.isRunning) {
          this.logger.info('Task stopped by user');
          break;
        }

        try {
          // Get current page state
          const pageState = await this.getPageState();

          // Get action from LLM
          const actionResponse = await this.getNextAction(task.goal, pageState);

          if (!actionResponse.action) {
            this.logger.warn('No action returned, task may be complete');
            break;
          }

          // Execute action
          const result = await this.executeAction(actionResponse.action, actionResponse.params);

          steps.push({
            stepNumber,
            action: actionResponse.action,
            confidence: actionResponse.confidence || 0.5,
            reasoning: actionResponse.reasoning || 'No reasoning provided',
          });

          // Check if task is complete
          if (this.isTaskComplete(actionResponse.action, result)) {
            this.logger.info('Task completed successfully');
            return {
              success: true,
              steps,
              finalUrl: await this.browserEngine.getCurrentUrl(),
            };
          }

          failures = 0; // Reset failure count on success

          // Small delay between steps
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          failures++;
          this.logger.error(`Step ${stepNumber} failed: ${error}`);

          if (failures >= (this.config.maxFailures || 3)) {
            throw new Error(`Too many failures (${failures}), stopping`);
          }
        }
      }

      return {
        success: false,
        steps,
        error: 'Max steps reached without completion',
        finalUrl: await this.browserEngine.getCurrentUrl(),
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async getPageState(): Promise<string> {
    try {
      // Get URL and title
      const url = await this.browserEngine.getCurrentUrl();
      const title = await this.browserEngine.getTitle();

      // Get interactive elements
      const elements = await this.browserEngine.evaluate(`
        () => {
          const getElementInfo = (el, index) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return {
              id: 'el_' + index,
              tag: el.tagName.toLowerCase(),
              idAttr: el.id || null,
              classAttr: el.className?.split(' ').filter(c => c)[0] || null,
              name: el.getAttribute('name') || null,
              type: el.getAttribute('type') || null,
              placeholder: el.getAttribute('placeholder') || null,
              text: el.innerText?.substring(0, 80)?.trim() || el.textContent?.substring(0, 80)?.trim() || null,
              href: el.href || null,
              role: el.getAttribute('role') || null,
              isVisible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
            };
          };

          const selectors = ['a', 'button', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]'];
          const elements = [];
          let idx = 0;

          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
              const info = getElementInfo(el, idx++);
              if (info.isVisible && (info.text || info.placeholder || info.type)) {
                elements.push(info);
              }
            });
          });

          return elements.slice(0, 30);
        }
      `);

      // Format elements for LLM
      const elementList = ((elements as any[]) || [])
        .map((el: any, i: number) => {
          const label = el.text || el.placeholder || el.type || el.tag;
          return `[el_${i}] ${el.tag}${el.idAttr ? '#' + el.idAttr : ''}${el.classAttr ? '.' + el.classAttr : ''}: "${label}"${el.href ? ' (link)' : ''}`;
        })
        .join('\n');

      return `
URL: ${url}
Title: ${title}

Interactive Elements:
${elementList || 'No elements found'}
`.trim();
    } catch (error) {
      this.logger.error('Failed to get page state', error);
      return 'Error getting page state';
    }
  }

  private async getNextAction(
    goal: string,
    pageState: string
  ): Promise<{
    action: string;
    params: any;
    reasoning: string;
    confidence: number;
  }> {
    const prompt = `
Goal: ${goal}

Current Page State:
${pageState}

Determine the next action to take. Respond with JSON:
{
  "action": "action_name",
  "params": { /* parameters for the action */ },
  "reasoning": "why this action helps achieve the goal",
  "confidence": 0.0-1.0
}

Actions: navigate, click, type, scroll, wait, extract, go_back, go_forward, done
- For click: params should have "selector" or "elementIndex"
- For type: params should have "selector" or "elementIndex" and "text"
- For scroll: params should have "direction" ("up" or "down")
- For navigate: params should have "url"
- For done: goal is achieved, params can be empty
`;

    try {
      const response = await this.modelRouter.route(
        'browser-agent',
        {
          provider: this.config.provider || 'openrouter',
          modelId: this.config.modelId,
          parameters: { temperature: this.config.temperature ?? 0.3, maxTokens: 500 },
        },
        prompt,
        { systemMessage: BROWSER_USE_SYSTEM_PROMPT }
      );

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          action: parsed.action || 'wait',
          params: parsed.params || {},
          reasoning: parsed.reasoning || '',
          confidence: parsed.confidence || 0.5,
        };
      }

      return { action: 'wait', params: {}, reasoning: 'Could not parse response', confidence: 0 };
    } catch (error) {
      this.logger.error('Failed to get next action', error);
      return { action: 'wait', params: {}, reasoning: 'Error', confidence: 0 };
    }
  }

  private async executeAction(action: string, params: any): Promise<any> {
    this.logger.info(`Executing action: ${action}`, params);

    switch (action.toLowerCase()) {
      case 'navigate':
        if (params.url) {
          await this.browserEngine.navigate(params.url);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        break;

      case 'click':
        if (params.selector) {
          await this.browserEngine.click(params.selector);
        } else if (params.elementIndex !== undefined) {
          await this.browserEngine.evaluate(`
            () => {
              const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
              if (elements[${params.elementIndex}]) {
                elements[${params.elementIndex}].click();
              }
            }
          `);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        break;

      case 'type':
        if (params.text) {
          if (params.selector) {
            await this.browserEngine.type(params.text, params.selector);
          } else if (params.elementIndex !== undefined) {
            await this.browserEngine.evaluate(`
              () => {
                const elements = document.querySelectorAll('input, textarea, [contenteditable="true"]');
                if (elements[${params.elementIndex}]) {
                  elements[${params.elementIndex}].focus();
                }
              }
            `);
            await this.browserEngine.type(params.text);
          }
        }
        break;

      case 'scroll':
        const scrollAmount = params.direction === 'down' ? 500 : -500;
        await this.browserEngine.evaluate(`
          () => window.scrollBy(0, ${scrollAmount})
        `);
        break;

      case 'wait':
        await new Promise(resolve => setTimeout(resolve, (params.seconds || 1) * 1000));
        break;

      case 'go_back':
        await this.browserEngine.evaluate(`() => window.history.back()`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;

      case 'go_forward':
        await this.browserEngine.evaluate(`() => window.history.forward()`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;

      case 'extract':
        if (params.selector) {
          const content = await this.browserEngine.extractText(params.selector);
          return { extracted: content };
        }
        break;

      case 'done':
        return { completed: true };

      default:
        this.logger.warn(`Unknown action: ${action}`);
    }

    return { success: true };
  }

  private isTaskComplete(action: string, result: any): boolean {
    if (action === 'done') return true;
    if (result?.completed) return true;
    return false;
  }

  stop(): void {
    this.isRunning = false;
    this.logger.info('BrowserAgent stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  async getCurrentState(): Promise<{ url: string; title: string }> {
    return {
      url: await this.browserEngine.getCurrentUrl(),
      title: await this.browserEngine.getTitle(),
    };
  }
}

export function createBrowserAgent(
  browserEngine: BrowserEngine,
  modelRouter: ModelRouter,
  config: BrowserAgentConfig
): BrowserAgent {
  return new BrowserAgent(browserEngine, modelRouter, config);
}
