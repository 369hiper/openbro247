import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '../utils/logger';

export interface LLMProvider {
  name: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  client: any;
}

export interface LLMManagerOptions {
  defaultProvider: string;
  providers: Record<string, any>;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export class LLMManager {
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string;
  private logger: Logger;

  constructor(options: LLMManagerOptions) {
    this.defaultProvider = options.defaultProvider;
    this.logger = new Logger('LLMManager');
    this.initializeProviders(options.providers);
  }

  private initializeProviders(providerConfigs: Record<string, any>): void {
    for (const [name, config] of Object.entries(providerConfigs)) {
      try {
        let client;

        switch (name) {
          case 'openai':
            client = new OpenAI({
              apiKey: config.apiKey,
              baseURL: config.baseUrl
            });
            break;

          case 'anthropic':
            client = new Anthropic({
              apiKey: config.apiKey
            });
            break;

          case 'local':
            // For local models via OpenAI-compatible API
            client = new OpenAI({
              apiKey: 'not-needed',
              baseURL: config.baseUrl
            });
            break;

          default:
            this.logger.warn(`Unknown provider: ${name}`);
            continue;
        }

        this.providers.set(name, {
          name,
          model: config.model,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          client
        });

        this.logger.info(`Initialized LLM provider: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to initialize provider ${name}`, error);
      }
    }
  }

  async generate(
    prompt: string,
    options: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemMessage?: string;
      messages?: Array<{ role: string; content: string }>;
      type?: string;
    } = {}
  ): Promise<LLMResponse> {
    const providerName = options.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    try {
      this.logger.info(`Generating with provider: ${providerName}`);

      const model = options.model || provider.model;
      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1000;

      let messages: Array<{ role: string; content: string }> = [];

      if (options.systemMessage) {
        messages.push({ role: 'system', content: options.systemMessage });
      }

      if (options.messages) {
        messages = [...messages, ...options.messages];
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      let response;

      if (providerName === 'anthropic') {
        response = await provider.client.messages.create({
          model,
          messages: messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role,
            content: msg.content
          })),
          temperature,
          max_tokens: maxTokens,
          system: options.systemMessage
        });

        return {
          content: response.content[0].text,
          usage: response.usage ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens
          } : undefined,
          finishReason: response.stop_reason
        };
      } else {
        // OpenAI and local providers
        response = await provider.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens
        });

        return {
          content: response.choices[0].message.content,
          usage: response.usage ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
          } : undefined,
          finishReason: response.choices[0].finish_reason
        };
      }
    } catch (error) {
      this.logger.error(`Error generating with provider ${providerName}`, error);
      throw error;
    }
  }

  async analyze(
    content: string,
    task: string,
    options: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const prompt = `Please ${task} for the following content:

${content}

Provide a detailed analysis.`;

    const response = await this.generate(prompt, {
      ...options,
      temperature: options.temperature || 0.3,
      maxTokens: options.maxTokens || 1000,
      systemMessage: "You are an expert analyst. Provide thorough, accurate analysis."
    });

    return response.content;
  }

  async generateStreaming(
    prompt: string,
    options: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemMessage?: string;
      onChunk?: (chunk: string) => void;
    } = {}
  ): Promise<LLMResponse> {
    const providerName = options.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    try {
      this.logger.info(`Streaming generation with provider: ${providerName}`);

      const model = options.model || provider.model;
      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1000;

      const messages: Array<{ role: string; content: string }> = [];

      if (options.systemMessage) {
        messages.push({ role: 'system', content: options.systemMessage });
      }

      messages.push({ role: 'user', content: prompt });

      let fullContent = '';
      let usage;
      let finishReason;

      if (providerName === 'anthropic') {
        const response = await provider.client.messages.create({
          model,
          messages: messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role,
            content: msg.content
          })),
          temperature,
          max_tokens: maxTokens,
          system: options.systemMessage,
          stream: true
        });

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.text) {
            fullContent += chunk.delta.text;
            options.onChunk?.(chunk.delta.text);
          }
        }

        return {
          content: fullContent,
          usage: undefined, // Anthropic streaming doesn't provide usage
          finishReason: 'stop'
        };
      } else {
        // OpenAI and local providers
        const response = await provider.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true
        });

        for await (const chunk of response) {
          if (chunk.choices[0]?.delta?.content) {
            fullContent += chunk.choices[0].delta.content;
            options.onChunk?.(chunk.choices[0].delta.content);
          }
        }

        return {
          content: fullContent,
          usage: undefined, // Streaming usage not available in simple implementation
          finishReason: 'stop'
        };
      }
    } catch (error) {
      this.logger.error(`Error streaming with provider ${providerName}`, error);
      throw error;
    }
  }

  async embed(
    texts: string[],
    options: {
      provider?: string;
      model?: string;
    } = {}
  ): Promise<number[][]> {
    const providerName = options.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    try {
      this.logger.info(`Embedding with provider: ${providerName}`);

      const model = options.model || 'text-embedding-3-small';

      if (providerName === 'openai') {
        const response = await provider.client.embeddings.create({
          model,
          input: texts
        });

        return response.data.map((item: any) => item.embedding);
      } else {
        // For other providers, we'd need to implement embedding
        throw new Error(`Embedding not implemented for provider: ${providerName}`);
      }
    } catch (error) {
      this.logger.error(`Error embedding with provider ${providerName}`, error);
      throw error;
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  setDefaultProvider(providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider not found: ${providerName}`);
    }
    this.defaultProvider = providerName;
    this.logger.info(`Set default provider to: ${providerName}`);
  }

  getDefaultProvider(): string {
    return this.defaultProvider;
  }
}