export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextLength: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface ModelRouteOptions {
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
}

export interface ModelValidationResult {
  valid: boolean;
  error?: string;
  latencyMs?: number;
}
