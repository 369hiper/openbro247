/**
 * Type definitions for API Server runtime dependencies
 * These interfaces replace 'any' types to maintain type safety
 */

import { Agent } from '../agents/types';
import { Task, TaskConfig, TaskFilters } from '../tasks/types';
import { ChatSession, ChatMessage, ChatSessionConfig } from '../chat/types';
import { EventEmitter } from 'events';

export interface AgentRuntime {
  events: EventEmitter;
  execute(
    agent: Agent, 
    goal: string, 
    options?: {
      maxIterations?: number;
      enableMemoryRetrieval?: boolean;
      enableSkillLearning?: boolean;
      enableSelfCorrection?: boolean;
    }
  ): Promise<AgentExecutionResult>;
  
  getActiveExecutions(): AgentExecution[];
}

export interface AgentExecutionResult {
  id: string;
  agentId: string;
  goal: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  finalAnswer?: string;
  error?: string;
  iterations: number;
  tokensUsed: number;
  plan: {
    steps: AgentExecutionStep[];
  };
  startedAt: Date;
  completedAt?: Date;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  goal: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  finalAnswer?: string;
  error?: string;
  iterations: number;
  tokensUsed: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface AgentExecutionStep {
  id: string;
  tool: string;
  thought: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  observation?: string;
  durationMs?: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  agentId?: string;
  description?: string;
  status: 'active' | 'paused';
  createdAt: Date;
}

export interface CronJobCreateInput {
  name: string;
  schedule: string;
  command: string;
  agentId?: string;
  description?: string;
}

export interface CronJobRun {
  id: string;
  jobId: string;
  startedAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}

export interface CronScheduler {
  createJob(job: CronJobCreateInput): Promise<CronJob>;
  listJobs(): Promise<CronJob[]>;
  pauseJob(jobId: string): Promise<void>;
  resumeJob(jobId: string): Promise<void>;
  triggerJob(jobId: string): Promise<CronJobRun>;
  deleteJob(jobId: string): Promise<void>;
  getHistory(jobId: string, limit: number): CronJobRun[];
}

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
  byAgent: Record<string, { requests: number; tokens: number; cost: number }>;
  byDay: Record<string, { requests: number; tokens: number; cost: number }>;
}

export interface UsageEntry {
  id: string;
  timestamp: Date;
  agentId?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface UsageTracker {
  getSummary(options?: { days?: number; agentId?: string }): UsageSummary;
  getRecentEntries(limit: number): UsageEntry[];
}

/**
 * Type for Phase 1 runtime systems
 */
export interface RuntimeSystems {
  agentRuntime: AgentRuntime;
  cronScheduler: CronScheduler;
  usageTracker: UsageTracker;
}
