/**
 * Browser Agent Service
 * Core service that wraps browser-use Agent with multi-LLM support
 */

import {
  Agent,
  BrowserSession,
  BrowserProfile,
  AgentSettings,
} from 'browser-use';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { v4 as uuidv4 } from 'uuid';
import {
  BrowserAgentConfig,
  BrowserProfileConfig,
  AgentResult,
  LLMProvider,
  DEFAULT_PROVIDER_CONFIGS,
  AgentInstance,
} from './browserAgentTypes';

/**
 * Browser Agent Service
 * Wraps browser-use Agent with additional features
 */
export class BrowserAgentService {
  private agent: Agent | null = null;
  private session: BrowserSession | null = null;
  private config: BrowserAgentConfig | null = null;
  private isInitialized: boolean = false;

  /**
   * Initialize the agent with configuration
   */
  async initialize(config: BrowserAgentConfig): Promise<void> {
    this.config = config;

    // Create LLM based on provider
    const llm = this.createLLM(config);

    // Create browser profile
    const profile = new BrowserProfile({
      headless: false,
      viewport: {
        width: 1920,
        height: 1080,
      },
      highlight_elements: true,
    });

    // Create browser session
    this.session = new BrowserSession({ browser_profile: profile });

    // Create agent settings
    const settings: Partial<AgentSettings> = {
      use_vision: config.useVision ?? true,
      max_actions_per_step: config.maxActionsPerStep ?? 5,
      max_failures: config.maxFailures ?? 3,
      generate_gif: config.generateGif,
      use_thinking: config.useThinking ?? false,
    };

    // Create agent (task will be set when running)
    this.agent = new Agent({
      task: '', // Will be set per task
      llm,
      browser_session: this.session,
      ...settings,
    } as any);

    this.isInitialized = true;
  }

  /**
   * Create LLM based on provider configuration
   */
  private createLLM(config: BrowserAgentConfig) {
    const provider = config.llmProvider;
    const model = config.model;
    const baseUrl = config.baseUrl;
    const apiKey = config.apiKey;

    switch (provider) {
      case 'openai':
        return new ChatOpenAI({
          model: model || DEFAULT_PROVIDER_CONFIGS.openai.defaultModel,
          apiKey: apiKey || process.env.OPENAI_API_KEY,
          temperature: 0.7,
        });

      case 'anthropic':
        return new ChatAnthropic({
          model: model || DEFAULT_PROVIDER_CONFIGS.anthropic.defaultModel,
          apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
          temperature: 0.7,
        });

      case 'ollama':
        return new ChatOpenAI({
          modelName: model || DEFAULT_PROVIDER_CONFIGS.ollama.defaultModel,
          apiKey: 'ollama', // Dummy key for Ollama
          configuration: { baseURL: baseUrl || DEFAULT_PROVIDER_CONFIGS.ollama.baseUrl },
          temperature: 0.7,
        });

      case 'lmstudio':
        return new ChatOpenAI({
          modelName: model || DEFAULT_PROVIDER_CONFIGS.lmstudio.defaultModel,
          apiKey: 'lmstudio', // Dummy key for LMStudio
          configuration: { baseURL: baseUrl || DEFAULT_PROVIDER_CONFIGS.lmstudio.baseUrl },
          temperature: 0.7,
        });

      case 'openrouter':
        return new ChatOpenAI({
          modelName: model || DEFAULT_PROVIDER_CONFIGS.openrouter.defaultModel,
          apiKey: apiKey || process.env.OPENROUTER_API_KEY,
          configuration: { baseURL: DEFAULT_PROVIDER_CONFIGS.openrouter.baseUrl },
          temperature: 0.7,
        });

      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /**
   * Run a task with the agent
   */
  async runTask(
    taskDescription: string,
    options?: {
      maxSteps?: number;
      onStep?: (step: number, state: any) => void;
      onDone?: (history: any) => void;
    }
  ): Promise<AgentResult> {
    if (!this.agent || !this.session) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      // Set the task
      (this.agent as any).add_new_task(taskDescription);

      // Run the agent
      const history = await this.agent.run(options?.maxSteps || 100);

      const duration = Date.now() - startTime;

      return {
        success: true,
        finalResult: history.final_result(),
        duration,
        tokens: ((history as any).total_input_tokens && (history as any).total_input_tokens()) || 0,
        steps: history.history.length,
        history,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  /**
   * Pause the agent
   */
  pause(): void {
    if (this.agent) {
      this.agent.pause();
    }
  }

  /**
   * Resume the agent
   */
  resume(): void {
    if (this.agent) {
      this.agent.resume();
    }
  }

  /**
   * Stop the agent
   */
  stop(): void {
    if (this.agent) {
      this.agent.stop();
    }
  }

  /**
   * Get current agent status
   */
  getStatus(): 'idle' | 'running' | 'paused' | 'stopped' | 'error' {
    if (!this.agent) return 'idle';
    
    // Check agent state if available
    const state = (this.agent as any).state;
    if (state) {
      if (state.stopped) return 'stopped';
      if (state.paused) return 'paused';
    }
    
    return 'idle';
  }

  /**
   * Check if agent is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the browser session
   */
  getSession(): BrowserSession | null {
    return this.session;
  }

  /**
   * Get the agent instance
   */
  getAgent(): Agent | null {
    return this.agent;
  }

  /**
   * Get current configuration
   */
  getConfig(): BrowserAgentConfig | null {
    return this.config;
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(): Promise<string | null> {
    if (!this.session) {
      return null;
    }

    try {
      const page = await (this.session as any).getPage();
      if (page) {
        const screenshot = await page.screenshot({
          encoding: 'base64',
        });
        return screenshot;
      }
    } catch (error) {
      console.error('Failed to take screenshot:', error);
    }

    return null;
  }

  /**
   * Navigate to a URL
   */
  async navigateTo(url: string): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const page = await (this.session as any).getPage();
    if (page) {
      await page.goto(url, { waitUntil: 'networkidle' });
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
    this.agent = null;
    this.config = null;
    this.isInitialized = false;
  }
}

/**
 * Create a browser agent instance
 */
export async function createBrowserAgent(
  config: BrowserAgentConfig
): Promise<BrowserAgentService> {
  const agent = new BrowserAgentService();
  await agent.initialize(config);
  return agent;
}

/**
 * Get available LLM providers
 */
export function getAvailableProviders(): LLMProvider[] {
  return ['openai', 'anthropic', 'ollama', 'lmstudio', 'openrouter'];
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: LLMProvider): string {
  return DEFAULT_PROVIDER_CONFIGS[provider]?.defaultModel || 'gpt-4o';
}
