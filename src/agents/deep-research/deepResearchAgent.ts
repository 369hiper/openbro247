// ============================================================================
// DEEP RESEARCH AGENT - Parallel Research with State Machine
// ============================================================================
// Inspired by web-ui's DeepResearchAgent with LangGraph state machine

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { ModelRouter } from '../../models/modelRouter';
import { ModelConfig } from '../types';
import { StateGraph, GraphBuilder, CompiledGraph } from '../react/stateGraph';
import { BrowserEngine } from '../../browser/engine';

// ============================================================================
// Types
// ============================================================================

/**
 * Research task item within a category
 */
export interface ResearchTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  queries?: string[];
  resultSummary?: string;
  error?: string;
}

/**
 * Research category grouping related tasks
 */
export interface ResearchCategory {
  name: string;
  tasks: ResearchTask[];
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Search result from browser
 */
export interface SearchResult {
  query: string;
  url: string;
  title: string;
  summary: string;
  timestamp: Date;
}

/**
 * Deep research state flowing through the graph
 */
export interface DeepResearchState extends Record<string, unknown> {
  taskId: string;
  topic: string;
  researchPlan: ResearchCategory[];
  searchResults: SearchResult[];
  currentCategoryIndex: number;
  currentTaskIndex: number;
  stopRequested: boolean;
  errorMessage?: string;
  finalReport?: string;
  outputDir: string;
  maxParallelBrowsers: number;
}

/**
 * Deep research configuration
 */
export interface DeepResearchConfig {
  topic: string;
  modelConfig: ModelConfig;
  outputDir?: string;
  maxParallelBrowsers?: number;
  maxCategories?: number;
  maxTasksPerCategory?: number;
}

/**
 * Deep research result
 */
export interface DeepResearchResult {
  taskId: string;
  status: 'completed' | 'failed' | 'stopped';
  report?: string;
  reportPath?: string;
  searchCount: number;
  duration: number;
  error?: string;
}

// ============================================================================
// Deep Research Agent Implementation
// ============================================================================

/**
 * Deep research agent that performs parallel web research
 * Uses LangGraph-style state machine for orchestration
 */
export class DeepResearchAgent {
  private logger: Logger;
  private modelRouter: ModelRouter;
  private browserEngine: BrowserEngine;
  private graph: ReturnType<StateGraph<DeepResearchState>['compile']> | null = null;
  private currentTaskId: string | null = null;
  private isRunning: boolean = false;
  private stopRequested: boolean = false;

  constructor(modelRouter: ModelRouter, browserEngine: BrowserEngine) {
    this.logger = new Logger('DeepResearchAgent');
    this.modelRouter = modelRouter;
    this.browserEngine = browserEngine;
  }

  /**
   * Start a deep research task
   */
  async run(config: DeepResearchConfig): Promise<DeepResearchResult> {
    if (this.isRunning) {
      throw new Error('Research task is already running');
    }

    this.isRunning = true;
    this.stopRequested = false;
    this.currentTaskId = uuidv4();
    const startTime = Date.now();

    const outputDir = config.outputDir || path.join('./tmp/deep-research', this.currentTaskId);
    await fs.mkdir(outputDir, { recursive: true });

    this.logger.info(`Starting deep research: ${config.topic}`);
    this.logger.info(`Output directory: ${outputDir}`);

    try {
      // Build the state graph
      this.graph = this.buildGraph();

      // Initialize state
      const initialState: DeepResearchState = {
        taskId: this.currentTaskId,
        topic: config.topic,
        researchPlan: [],
        searchResults: [],
        currentCategoryIndex: 0,
        currentTaskIndex: 0,
        stopRequested: false,
        outputDir,
        maxParallelBrowsers: config.maxParallelBrowsers || 2,
      };

      // Execute the graph
      const result = await this.graph.invoke(initialState, {
        maxIterations: 100,
        timeout: 600000, // 10 minutes
        onNodeStart: (nodeId, state) => {
          this.logger.debug(`Entering node: ${nodeId}`);
        },
      });

      const duration = Date.now() - startTime;

      if (this.stopRequested) {
        return {
          taskId: this.currentTaskId,
          status: 'stopped',
          searchCount: result.finalState.searchResults.length,
          duration,
        };
      }

      if (result.status === 'failed') {
        return {
          taskId: this.currentTaskId,
          status: 'failed',
          searchCount: result.finalState.searchResults.length,
          duration,
          error: result.error,
        };
      }

      // Save final report
      const reportPath = result.finalState.finalReport
        ? await this.saveReport(result.finalState, outputDir)
        : undefined;

      return {
        taskId: this.currentTaskId,
        status: 'completed',
        report: result.finalState.finalReport,
        reportPath,
        searchCount: result.finalState.searchResults.length,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Deep research failed', error);

      return {
        taskId: this.currentTaskId,
        status: 'failed' as const,
        searchCount: 0,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the current research task
   */
  stop(): void {
    this.stopRequested = true;
    if (this.graph) {
      this.graph.stop();
    }
    this.logger.info('Stop requested');
  }

  /**
   * Build the state graph for research workflow
   */
  private buildGraph(): ReturnType<StateGraph<DeepResearchState>['compile']> {
    const builder = new GraphBuilder<DeepResearchState>('deep-research');

    // Define nodes
    builder
      .withNode('plan', async state => this.planResearch(state), 'Generate research plan')
      .withNode('execute', async state => this.executeResearch(state), 'Execute research tasks')
      .withNode(
        'synthesize',
        async state => this.synthesizeReport(state),
        'Synthesize final report'
      )
      .withNode('end', async state => state, 'End node');

    // Set entry point
    builder.withEntryPoint('plan');

    // Define edges
    builder
      .withEdge('plan', 'execute')
      .withConditionalEdges(
        'execute',
        state => {
          if (state.stopRequested || state.errorMessage) {
            return 'end';
          }
          if (state.currentCategoryIndex >= state.researchPlan.length) {
            return 'synthesize';
          }
          return 'execute';
        },
        {
          execute: 'execute',
          synthesize: 'synthesize',
          end: 'end',
        }
      )
      .withEdge('synthesize', 'end');

    return builder.build();
  }

  /**
   * Node: Plan the research
   */
  private async planResearch(state: DeepResearchState): Promise<Partial<DeepResearchState>> {
    this.logger.info('Generating research plan...');

    const prompt = `You are a meticulous research assistant. Create a hierarchical research plan to thoroughly investigate: "${state.topic}"

The plan should be structured into research categories. Each category contains specific research tasks.

Respond with a JSON array:
[
  {
    "category_name": "Category Name",
    "tasks": ["Task 1", "Task 2", "Task 3"]
  }
]

Create 3-5 categories with 2-4 tasks each. Be specific and actionable.`;

    const response = await this.modelRouter.route(
      `research-planner-${state.taskId}`,
      {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-5-sonnet',
        parameters: { temperature: 0.3, maxTokens: 2000 },
      },
      prompt,
      { systemMessage: 'You are a research planning assistant outputting JSON.' }
    );

    try {
      // Parse response (handle markdown wrapped JSON)
      let jsonStr = response;
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0];
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0];
      }

      const parsed = JSON.parse(jsonStr.trim());

      const researchPlan: ResearchCategory[] = parsed.map((cat: any) => ({
        name: cat.category_name,
        tasks: (cat.tasks || []).map((taskDesc: any) => ({
          id: uuidv4(),
          description:
            typeof taskDesc === 'string' ? taskDesc : taskDesc.task_description || String(taskDesc),
          status: 'pending' as const,
        })),
        status: 'pending' as const,
      }));

      this.logger.info(`Generated ${researchPlan.length} research categories`);

      // Save plan to file
      await this.savePlan(researchPlan, state.outputDir);

      return { researchPlan, currentCategoryIndex: 0, currentTaskIndex: 0 };
    } catch (error) {
      this.logger.error('Failed to parse research plan', error);
      return { errorMessage: 'Failed to generate research plan' };
    }
  }

  /**
   * Node: Execute research tasks
   */
  private async executeResearch(state: DeepResearchState): Promise<Partial<DeepResearchState>> {
    if (state.stopRequested) {
      return { stopRequested: true };
    }

    const plan = state.researchPlan;
    const catIdx = state.currentCategoryIndex;
    const taskIdx = state.currentTaskIndex;

    if (catIdx >= plan.length) {
      return {}; // Done, will trigger synthesize
    }

    const category = plan[catIdx];
    if (taskIdx >= category.tasks.length) {
      // Move to next category
      return {
        currentCategoryIndex: catIdx + 1,
        currentTaskIndex: 0,
      };
    }

    const task = category.tasks[taskIdx];
    if (task.status === 'completed') {
      return { currentTaskIndex: taskIdx + 1 };
    }

    this.logger.info(`Executing task: ${task.description}`);

    // Update task status
    task.status = 'in_progress';

    try {
      // Generate search queries for this task
      const queries = await this.generateSearchQueries(task.description);

      // Execute searches in parallel
      const searchResults = await this.executeParallelSearches(queries, state.maxParallelBrowsers);

      // Update task
      task.status = 'completed';
      task.queries = queries;
      task.resultSummary = searchResults.map(r => r.summary).join('\n');

      this.logger.info(`Completed task: ${task.description} (${searchResults.length} results)`);

      // Save progress
      await this.savePlan(plan, state.outputDir);
      await this.saveSearchResults([...state.searchResults, ...searchResults], state.outputDir);

      return {
        searchResults: [...state.searchResults, ...searchResults],
        currentTaskIndex: taskIdx + 1,
      };
    } catch (error) {
      this.logger.error(`Task failed: ${task.description}`, error);
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);

      return { currentTaskIndex: taskIdx + 1 };
    }
  }

  /**
   * Node: Synthesize final report
   */
  private async synthesizeReport(state: DeepResearchState): Promise<Partial<DeepResearchState>> {
    this.logger.info('Synthesizing final report...');

    const { topic, researchPlan, searchResults } = state;

    // Build context from search results
    const findingsContext = searchResults
      .map(r => `### ${r.title}\n${r.summary}\nSource: ${r.url}`)
      .join('\n\n');

    // Build plan summary
    const planSummary = researchPlan
      .map(cat => {
        const tasks = cat.tasks
          .map(t => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.description}`)
          .join('\n');
        return `## ${cat.name}\n${tasks}`;
      })
      .join('\n\n');

    const prompt = `You are a professional researcher. Write a comprehensive research report on: "${topic}"

Based on the following research findings and plan:

## Research Plan
${planSummary}

## Collected Findings
${findingsContext}

Instructions:
1. Write a well-structured report in Markdown
2. Include an introduction explaining the scope
3. Organize findings thematically (align with research categories)
4. Include proper citations with URLs
5. Provide a conclusion summarizing key insights

Generate the report now.`;

    const response = await this.modelRouter.route(
      `research-synthesizer-${state.taskId}`,
      {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-5-sonnet',
        parameters: { temperature: 0.5, maxTokens: 4000 },
      },
      prompt,
      {
        systemMessage: 'You are a professional research report writer.',
        maxTokens: 4000,
      }
    );

    return { finalReport: response };
  }

  /**
   * Generate search queries for a research task
   */
  private async generateSearchQueries(taskDescription: string): Promise<string[]> {
    const prompt = `Generate 2-3 specific search queries to research: "${taskDescription}"

Respond with a JSON array of strings:
["query 1", "query 2", "query 3"]

Keep queries focused and specific.`;

    const response = await this.modelRouter.route(
      'query-generator',
      {
        provider: 'openrouter',
        modelId: 'anthropic/claude-3-5-sonnet',
        parameters: { temperature: 0.5, maxTokens: 200 },
      },
      prompt
    );

    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [taskDescription];
    } catch {
      return [taskDescription];
    }
  }

  /**
   * Execute multiple searches in parallel
   */
  private async executeParallelSearches(
    queries: string[],
    maxParallel: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Process queries in batches
    for (let i = 0; i < queries.length; i += maxParallel) {
      const batch = queries.slice(i, i + maxParallel);
      const batchPromises = batch.map(query => this.executeSearch(query));
      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /**
   * Execute a single search
   */
  private async executeSearch(query: string): Promise<SearchResult | null> {
    try {
      // Navigate to search engine
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await this.browserEngine.navigate(searchUrl);

      // Extract content (simplified - in production use proper extraction)
      const content = await this.browserEngine.evaluate(`
        (function() {
          const results = document.querySelectorAll('.g');
          const texts = [];
          for (let i = 0; i < Math.min(3, results.length); i++) {
            const title = results[i].querySelector('h3')?.innerText || '';
            const snippet = results[i].querySelector('.VwiC3b')?.innerText || '';
            texts.push(title + ': ' + snippet);
          }
          return texts.join('\\n\\n');
        })()
      `);

      return {
        query,
        url: searchUrl,
        title: `Search results for: ${query}`,
        summary: String(content || 'No results found'),
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Search failed for query: ${query}`, error);
      return null;
    }
  }

  /**
   * Save research plan to file
   */
  private async savePlan(plan: ResearchCategory[], outputDir: string): Promise<void> {
    const lines = ['# Research Plan\n'];

    for (const category of plan) {
      lines.push(`## ${category.name}\n`);
      for (const task of category.tasks) {
        const marker =
          task.status === 'completed' ? '[x]' : task.status === 'failed' ? '[-]' : '[ ]';
        lines.push(`- ${marker} ${task.description}`);
      }
      lines.push('');
    }

    await fs.writeFile(path.join(outputDir, 'research_plan.md'), lines.join('\n'), 'utf-8');
  }

  /**
   * Save search results to file
   */
  private async saveSearchResults(results: SearchResult[], outputDir: string): Promise<void> {
    await fs.writeFile(
      path.join(outputDir, 'search_results.json'),
      JSON.stringify(results, null, 2),
      'utf-8'
    );
  }

  /**
   * Save final report to file
   */
  private async saveReport(state: DeepResearchState, outputDir: string): Promise<string> {
    const reportPath = path.join(outputDir, 'report.md');
    await fs.writeFile(reportPath, state.finalReport || '', 'utf-8');
    return reportPath;
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    taskId: string | null;
  } {
    return {
      isRunning: this.isRunning,
      taskId: this.currentTaskId,
    };
  }
}
