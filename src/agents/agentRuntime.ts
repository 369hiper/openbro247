import { Logger } from '../utils/logger';
import { LLMManager } from '../ai/llmManager';
import { SemanticMemory } from '../memory/semanticMemory';
import { BrowserEngine } from '../browser/engine';
import { SQLiteStore } from '../memory/sqliteStore';
import { Agent } from './types';
import { ToolRegistry, ToolResult, ToolDefinition } from '../skills/toolRegistry';
import { EventEmitter } from 'events';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  thought: string;
  tool: string;
  toolInput: Record<string, any>;
  observation?: string;
  result?: ToolResult;
  status: StepStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
  createdAt: Date;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  goal: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  plan: ExecutionPlan;
  iterations: number;
  maxIterations: number;
  finalAnswer?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  tokensUsed: number;
}

export interface RuntimeOptions {
  maxIterations?: number;
  maxTokensPerStep?: number;
  enableSelfCorrection?: boolean;
  enableMemoryRetrieval?: boolean;
  enableSkillLearning?: boolean;
  verbose?: boolean;
}

// ──────────────────────────────────────────────
// The ReAct execution loop
// ──────────────────────────────────────────────

export class AgentRuntime {
  private logger: Logger;
  private llm: LLMManager;
  private memory: SemanticMemory;
  private browserEngine: BrowserEngine;
  private sqliteStore: SQLiteStore;
  private toolRegistry: ToolRegistry;
  private activeExecutions: Map<string, AgentExecution> = new Map();
  public events: EventEmitter = new EventEmitter();

  constructor(
    llm: LLMManager,
    memory: SemanticMemory,
    browserEngine: BrowserEngine,
    sqliteStore: SQLiteStore,
    toolRegistry: ToolRegistry
  ) {
    this.llm = llm;
    this.memory = memory;
    this.browserEngine = browserEngine;
    this.sqliteStore = sqliteStore;
    this.toolRegistry = toolRegistry;
    this.logger = new Logger('AgentRuntime');
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  async execute(
    agent: Agent,
    goal: string,
    options: RuntimeOptions = {}
  ): Promise<AgentExecution> {
    const opts: Required<RuntimeOptions> = {
      maxIterations: options.maxIterations ?? 10,
      maxTokensPerStep: options.maxTokensPerStep ?? 4000,
      enableSelfCorrection: options.enableSelfCorrection ?? true,
      enableMemoryRetrieval: options.enableMemoryRetrieval ?? true,
      enableSkillLearning: options.enableSkillLearning ?? true,
      verbose: options.verbose ?? false,
    };

    const executionId = `exec_${Date.now()}_${agent.id.slice(0, 8)}`;

    const execution: AgentExecution = {
      id: executionId,
      agentId: agent.id,
      goal,
      status: 'running',
      plan: { goal, steps: [], createdAt: new Date() },
      iterations: 0,
      maxIterations: opts.maxIterations,
      startedAt: new Date(),
      tokensUsed: 0,
    };

    this.activeExecutions.set(executionId, execution);
    this.logger.info(`[${agent.name}] Starting execution: "${goal}" (id=${executionId})`);

    try {
      // Mark agent as busy
      await this.sqliteStore.updateAgent(agent.id, { ...agent, status: 'busy' });

      // Run the ReAct loop
      const result = await this.reactLoop(execution, agent, opts);
      execution.finalAnswer = result;
      execution.status = 'completed';
      execution.completedAt = new Date();

      // Optionally learn from success
      if (opts.enableSkillLearning) {
        await this.learnFromExecution(execution, agent).catch((e) =>
          this.logger.warn('Skill learning failed (non-fatal)', e)
        );
      }

      this.logger.info(`[${agent.name}] Execution completed in ${execution.iterations} iterations`);
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date();
      this.logger.error(`[${agent.name}] Execution failed`, error);

      if (opts.enableSelfCorrection) {
        await this.selfCorrect(execution, agent, error as Error).catch(() => {});
      }
    } finally {
      // Mark agent back to idle
      await this.sqliteStore.updateAgent(agent.id, { ...agent, status: 'idle' }).catch(() => {});
      this.activeExecutions.delete(executionId);
    }

    return execution;
  }

  getActiveExecutions(): AgentExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  async cancelExecution(executionId: string): Promise<void> {
    const exec = this.activeExecutions.get(executionId);
    if (exec) {
      exec.status = 'cancelled';
      exec.completedAt = new Date();
      this.activeExecutions.delete(executionId);
      this.logger.info(`Cancelled execution: ${executionId}`);
    }
  }

  // ──────────────────────────────────────────────
  // Core ReAct Loop (Thought → Action → Observation)
  // ──────────────────────────────────────────────

  private async reactLoop(
    execution: AgentExecution,
    agent: Agent,
    opts: Required<RuntimeOptions>
  ): Promise<string> {
    const conversationHistory: Array<{ role: string; content: string }> = [];

    // Build system prompt with available tools
    const systemPrompt = this.buildSystemPrompt(agent);

    // Optional: retrieve relevant memories
    let memoryContext = '';
    if (opts.enableMemoryRetrieval) {
      const memories = await this.memory.recall(execution.goal, 3);
      if (memories.length > 0) {
        memoryContext =
          '\n\n## Relevant Memories\n' +
          memories.map((m: any) => `- ${m.content}`).join('\n');
      }
    }

    const initialPrompt =
      `You are to accomplish the following goal:\n\n**Goal:** ${execution.goal}${memoryContext}\n\n` +
      `Think step by step. Use the tools available to you. When you have the final answer, ` +
      `respond with: FINAL ANSWER: <your answer here>`;

    conversationHistory.push({ role: 'user', content: initialPrompt });

    this.events.emit('execution:start', { executionId: execution.id, goal: execution.goal });

    for (let i = 0; i < opts.maxIterations; i++) {
      execution.iterations = i + 1;

      // Check for cancellation
      const current = this.activeExecutions.get(execution.id);
      if (!current || current.status === 'cancelled') {
        throw new Error('Execution was cancelled');
      }

      this.logger.info(`[Iteration ${i + 1}/${opts.maxIterations}]`);

      // Ask the LLM what to do next
      const llmResponse = await this.llm.generate('', {
        systemMessage: systemPrompt,
        messages: conversationHistory as any,
        temperature: 0.3,
        maxTokens: opts.maxTokensPerStep,
      });

      const responseText = llmResponse.content;
      execution.tokensUsed += llmResponse.usage?.totalTokens ?? 0;

      // Check if agent has a final answer
      if (responseText.includes('FINAL ANSWER:')) {
        const answerMatch = responseText.match(/FINAL ANSWER:\s*([\s\S]+)/);
        const finalAnswer = answerMatch ? answerMatch[1].trim() : responseText;
        conversationHistory.push({ role: 'assistant', content: responseText });
        this.events.emit('execution:complete', { executionId: execution.id, finalAnswer });
        return finalAnswer;
      }

      // Parse tool call from response
      const parsedAction = this.parseAction(responseText);

      if (!parsedAction) {
        // No tool call found — maybe the model is just thinking. Continue.
        conversationHistory.push({ role: 'assistant', content: responseText });
        conversationHistory.push({
          role: 'user',
          content: 'Continue. Use a tool or provide your FINAL ANSWER.',
        });
        continue;
      }

      // Record step
      const step: PlanStep = {
        id: `step_${i + 1}`,
        thought: this.extractThought(responseText),
        tool: parsedAction.tool,
        toolInput: parsedAction.input,
        status: 'running',
        startedAt: new Date(),
      };
      
      this.events.emit('step:thought', { executionId: execution.id, stepId: step.id, thought: step.thought });
      this.events.emit('step:action', { executionId: execution.id, stepId: step.id, tool: step.tool, input: step.toolInput });
      execution.plan.steps.push(step);

      // Execute the tool
      this.logger.info(`Executing tool: ${parsedAction.tool}`, parsedAction.input);
      const toolResult = await this.toolRegistry.execute(parsedAction.tool, parsedAction.input);

      step.status = toolResult.success ? 'done' : 'failed';
      step.result = toolResult;
      step.observation = toolResult.success
        ? this.formatObservation(toolResult.data)
        : `Error: ${toolResult.error}`;
      step.completedAt = new Date();
      step.durationMs = step.completedAt.getTime() - step.startedAt!.getTime();

      this.events.emit('step:observation', { executionId: execution.id, stepId: step.id, observation: step.observation, success: toolResult.success });

      // Add the assistant's action and tool observation to history
      conversationHistory.push({ role: 'assistant', content: responseText });
      conversationHistory.push({
        role: 'user',
        content: `Observation: ${step.observation}\n\nContinue toward the goal.`,
      });

      // Log action to SQLite via memory
      await this.memory.storeAction(
        parsedAction.tool,
        null,
        parsedAction.input,
        step.observation ?? '',
        toolResult.success,
        step.durationMs ?? 0,
        { agentId: execution.agentId, executionId: execution.id }
      ).catch(() => {});
    }

    // Exhausted iterations — ask for best answer so far
    conversationHistory.push({
      role: 'user',
      content:
        'You have reached the maximum number of iterations. Provide your best FINAL ANSWER based on what you have gathered so far.',
    });

    const finalResponse = await this.llm.generate('', {
      systemMessage: systemPrompt,
      messages: conversationHistory as any,
      temperature: 0.3,
      maxTokens: 2000,
    });

    const answerMatch = finalResponse.content.match(/FINAL ANSWER:\s*([\s\S]+)/);
    return answerMatch ? answerMatch[1].trim() : finalResponse.content;
  }

  // ──────────────────────────────────────────────
  // System Prompt Builder
  // ──────────────────────────────────────────────

  private buildSystemPrompt(agent: Agent): string {
    const tools = this.toolRegistry.listTools();
    const toolDescriptions = tools
      .map(
        (t: { name: string; description: string; inputSchema: Record<string, any> }) =>
          `### ${t.name}\n${t.description}\nInput schema: ${JSON.stringify(t.inputSchema, null, 2)}`
      )
      .join('\n\n');

    return `You are ${agent.name}, an autonomous AI agent.
Your capabilities: ${agent.capabilities.join(', ')}.

## Available Tools

${toolDescriptions}

## How to Use Tools

To use a tool, respond in this exact format:

Thought: <your reasoning about what to do next>
Action: <tool_name>
Action Input: <json object with tool inputs>

Wait for the Observation, then decide your next step.

When you have enough information to answer the goal, respond with:
FINAL ANSWER: <your complete answer>

## Important Rules
- Always think before acting
- Use tools to gather information — don't make things up
- If a tool fails, try an alternative approach
- Be concise in your final answer`;
  }

  // ──────────────────────────────────────────────
  // Parsing
  // ──────────────────────────────────────────────

  private parseAction(text: string): { tool: string; input: Record<string, any> } | null {
    const actionMatch = text.match(/Action:\s*(\S+)/);
    const inputMatch = text.match(/Action Input:\s*(\{[\s\S]*?\})/);

    if (!actionMatch) return null;

    const tool = actionMatch[1].trim();
    let input: Record<string, any> = {};

    if (inputMatch) {
      try {
        input = JSON.parse(inputMatch[1]);
      } catch {
        // Try to extract as plain text
        const rawInput = inputMatch[1];
        input = { query: rawInput };
      }
    }

    return { tool, input };
  }

  private extractThought(text: string): string {
    const match = text.match(/Thought:\s*(.+?)(?=Action:|FINAL ANSWER:|$)/s);
    return match ? match[1].trim() : '';
  }

  private formatObservation(data: any): string {
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data, null, 2).slice(0, 2000); // truncate long output
    }
    return String(data);
  }

  // ──────────────────────────────────────────────
  // Self-Correction
  // ──────────────────────────────────────────────

  private async selfCorrect(
    execution: AgentExecution,
    agent: Agent,
    error: Error
  ): Promise<void> {
    this.logger.info(`Attempting self-correction for execution ${execution.id}`);

    const prompt = `An error occurred during task execution.
Goal: ${execution.goal}
Error: ${error.message}
Steps completed: ${execution.plan.steps.length}
Last successful step: ${execution.plan.steps.filter((s) => s.status === 'done').slice(-1)[0]?.tool ?? 'none'}

What went wrong and how can this be prevented in future? Be brief.`;

    const analysis = await this.llm.generate(prompt, {
      temperature: 0.3,
      maxTokens: 500,
    });

    // Store the error analysis as a memory for future prevention
    await this.memory.storeMemory(
      `Error Pattern: ${error.message.slice(0, 100)} | Analysis: ${analysis.content.slice(0, 200)}`,
      'error_analysis',
      { agentId: agent.id, goal: execution.goal, timestamp: new Date().toISOString() }
    );
  }

  // ──────────────────────────────────────────────
  // Skill Learning from Execution
  // ──────────────────────────────────────────────

  private async learnFromExecution(
    execution: AgentExecution,
    agent: Agent
  ): Promise<void> {
    if (execution.plan.steps.length === 0) return;

    const successfulSteps = execution.plan.steps.filter((s) => s.status === 'done');
    if (successfulSteps.length === 0) return;

    const stepSummary = successfulSteps
      .map((s) => `${s.tool}(${JSON.stringify(s.toolInput)}) → ${s.observation?.slice(0, 100)}`)
      .join('\n');

    const skillContent = `Goal: ${execution.goal}\nSteps:\n${stepSummary}\nResult: ${execution.finalAnswer?.slice(0, 200)}`;

    await this.memory.storeSkill(
      `auto_skill_${Date.now()}`,
      `Learned from: ${execution.goal.slice(0, 80)}`,
      skillContent,
      'auto_learned',
      0.7,
      {
        agentId: agent.id,
        executionId: execution.id,
        toolsUsed: [...new Set(successfulSteps.map((s) => s.tool))],
        iterations: execution.iterations,
        timestamp: new Date().toISOString(),
      }
    );

    this.logger.info(`Learned new skill from execution ${execution.id}`);
  }
}
