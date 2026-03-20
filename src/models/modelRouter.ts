import OpenAI from 'openai';
import { Logger } from '../utils/logger';
import { ModelConfig } from '../agents/types';
import { ModelInfo, ModelRouteOptions, ModelValidationResult } from './types';

export class ModelRouter {
  private openrouterClient: OpenAI | null = null;
  private logger: Logger;
  private modelCache: Map<string, ModelInfo> = new Map();

  constructor() {
    this.logger = new Logger('ModelRouter');
  }

  async initialize(): Promise<void> {
    try {
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      if (openrouterApiKey) {
        this.openrouterClient = new OpenAI({
          apiKey: openrouterApiKey,
          baseURL: 'https://openrouter.ai/api/v1'
        });
        this.logger.info('OpenRouter client initialized - Primary LLM Provider');

        // Test connection and log available models
        const models = await this.listAvailableModels();
        this.logger.info(`OpenRouter connected with ${models.length} available models`);
      } else {
        this.logger.error('OpenRouter API key not configured - OpenRouter is required for autonomous digital operators');
        throw new Error('OPENROUTER_API_KEY environment variable is required');
      }
    } catch (error) {
      this.logger.error('Failed to initialize ModelRouter', error);
      throw error;
    }
  }

  async route(agentId: string, modelConfig: ModelConfig, prompt: string, options: ModelRouteOptions = {}): Promise<string> {
    try {
      this.logger.info(`Routing request for agent ${agentId} to ${modelConfig.provider}/${modelConfig.modelId}`);

      const client = this.getClient(modelConfig);
      const messages = this.buildMessages(prompt, options.systemMessage);

      const response = await client.chat.completions.create({
        model: modelConfig.modelId,
        messages,
        temperature: options.temperature ?? modelConfig.parameters.temperature,
        max_tokens: options.maxTokens ?? modelConfig.parameters.maxTokens
      });

      const content = response.choices[0].message.content || '';
      this.logger.info(`Generated response for agent ${agentId}`);
      return content;
    } catch (error) {
      this.logger.error(`Error routing request for agent ${agentId}`, error);
      throw error;
    }
  }

  async streamRoute(agentId: string, modelConfig: ModelConfig, prompt: string, options: ModelRouteOptions = {}): Promise<string> {
    try {
      this.logger.info(`Streaming request for agent ${agentId} to ${modelConfig.provider}/${modelConfig.modelId}`);

      const client = this.getClient(modelConfig);
      const messages = this.buildMessages(prompt, options.systemMessage);

      const stream = await client.chat.completions.create({
        model: modelConfig.modelId,
        messages,
        temperature: options.temperature ?? modelConfig.parameters.temperature,
        max_tokens: options.maxTokens ?? modelConfig.parameters.maxTokens,
        stream: true
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          options.onChunk?.(content);
        }
      }

      this.logger.info(`Streamed response for agent ${agentId}`);
      return fullContent;
    } catch (error) {
      this.logger.error(`Error streaming request for agent ${agentId}`, error);
      throw error;
    }
  }

  async listAvailableModels(): Promise<ModelInfo[]> {
    try {
      if (!this.openrouterClient) {
        return this.getFallbackModels();
      }

      const response = await fetch('https://openrouter.ai/api/v1/models');
      const data = await response.json() as { data: any[] };

      const models: ModelInfo[] = data.data.map((model: any) => ({
        id: model.id,
        name: model.name,
        provider: 'openrouter',
        description: model.description || '',
        contextLength: model.context_length || 4096,
        pricing: {
          prompt: model.pricing?.prompt || '0',
          completion: model.pricing?.completion || '0'
        }
      }));

      for (const model of models) {
        this.modelCache.set(model.id, model);
      }

      this.logger.info(`Loaded ${models.length} models from OpenRouter`);
      return models;
    } catch (error) {
      this.logger.error('Error fetching models from OpenRouter', error);
      return this.getFallbackModels();
    }
  }

  async validateModel(modelConfig: ModelConfig): Promise<ModelValidationResult> {
    const startTime = Date.now();

    try {
      const testPrompt = 'Hello, this is a test.';
      await this.route('validation', modelConfig, testPrompt, {
        maxTokens: 10
      });

      const latencyMs = Date.now() - startTime;

      return {
        valid: true,
        latencyMs
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs
      };
    }
  }

  private getClient(modelConfig: ModelConfig): OpenAI {
    switch (modelConfig.provider) {
      case 'openrouter':
        if (!this.openrouterClient) {
          throw new Error('OpenRouter client not initialized');
        }
        return this.openrouterClient;

      case 'openai':
        return new OpenAI({
          apiKey: modelConfig.apiKey || process.env.OPENAI_API_KEY
        });

      case 'local':
        return new OpenAI({
          apiKey: 'not-needed',
          baseURL: modelConfig.baseUrl || 'http://localhost:11434/v1'
        });

      default:
        throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }
  }

  private buildMessages(prompt: string, systemMessage?: string): Array<{ role: 'system' | 'user'; content: string }> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }

    messages.push({ role: 'user', content: prompt });

    return messages;
  }

  private getFallbackModels(): ModelInfo[] {
    return [
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        description: 'Most capable GPT-4 model',
        contextLength: 8192,
        pricing: { prompt: '0.03', completion: '0.06' }
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        description: 'Fast and efficient model',
        contextLength: 4096,
        pricing: { prompt: '0.0015', completion: '0.002' }
      },
      {
        id: 'anthropic/claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextLength: 200000,
        pricing: { prompt: '0.003', completion: '0.015' }
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        provider: 'anthropic',
        description: 'Fast and cost-effective',
        contextLength: 200000,
        pricing: { prompt: '0.00025', completion: '0.00125' }
      }
    ];
  }
}
