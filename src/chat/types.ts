import { ChatRole } from '../models/types';

export interface ChatMessageMetadata {
  tokens?: number;
  model?: string;
  finishReason?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  timestamp: Date;
  metadata?: ChatMessageMetadata;
}

export interface ChatSessionMetadata {
  title?: string;
  summary?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface ChatSession {
  id: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: ChatSessionMetadata;
}

export interface ChatSessionConfig {
  agentId: string;
  metadata?: ChatSessionMetadata;
}
