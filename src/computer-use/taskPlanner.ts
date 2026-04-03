import { v4 as uuidv4 } from 'uuid';
import { ModelRouter } from '../models/modelRouter';
import { Logger } from '../utils/logger';
import { ExecutionPlan, ExecutionStep } from './types';

const PLANNER_SYSTEM_PROMPT = `You are an autonomous task planner for a coding agent. Given a user goal, break it down into concrete, executable steps.

CRITICAL RULES:
1. Every step must specify an EXACT tool name and JSON parameters
2. Research steps must use 'web_search' or 'web_fetch' tools
3. Coding steps must use 'code_write' or 'code_edit' tools
4. Always include a 'test_and_verify' step after coding
5. Always include a 'notify_user' step at the end
6. If the task requires building an app, include: create_project, write_files, install_deps, run_server, test_browser

Respond ONLY with valid JSON in this exact format:
{
  "goal": "<restated goal>",
  "steps": [
    {
      "type": "research|code|test|browser|monitor|notify|self_improve",
      "description": "What this step does",
      "tool": "exact_tool_name",
      "params": { "key": "value" }
    }
  ],
  "estimatedDuration": <seconds>,
  "requiredCapabilities": ["capability1", "capability2"]
}`;

/**
 * TaskPlanner analyzes user goals and creates structured execution plans
 * that the AutonomousAgent can follow step by step.
 */
export class TaskPlanner {
  private modelRouter: ModelRouter;
  private logger: Logger;
  private plans: Map<string, ExecutionPlan> = new Map();

  constructor(modelRouter: ModelRouter) {
    this.modelRouter = modelRouter;
    this.logger = new Logger('TaskPlanner');
  }

  /**
   * Create an execution plan from a user goal
   */
  async createPlan(goal: string, context: Record<string, any> = {}): Promise<ExecutionPlan> {
    this.logger.info(`Creating plan for goal: ${goal}`);

    const prompt = this.buildPrompt(goal, context);

    try {
      const response = await this.modelRouter.route(
        'task-planner',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.2, maxTokens: 4000 },
        },
        prompt,
        { systemMessage: PLANNER_SYSTEM_PROMPT }
      );

      const parsed = this.parsePlanResponse(response);

      const plan: ExecutionPlan = {
        id: uuidv4(),
        goal,
        steps: parsed.steps.map((step: any, index: number) => ({
          id: uuidv4(),
          planId: '',
          order: index + 1,
          type: step.type,
          description: step.description,
          tool: step.tool,
          params: step.params || {},
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        })),
        estimatedDuration: parsed.estimatedDuration || 300,
        requiredCapabilities: parsed.requiredCapabilities || [],
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Set planId on each step
      plan.steps.forEach(step => {
        step.planId = plan.id;
      });

      this.plans.set(plan.id, plan);
      this.logger.info(`Plan created: ${plan.id} with ${plan.steps.length} steps`);

      return plan;
    } catch (error) {
      this.logger.error('Failed to create plan', error);
      throw error;
    }
  }

  /**
   * Revise a failed plan based on error feedback
   */
  async revisePlan(
    plan: ExecutionPlan,
    failedStepId: string,
    error: string,
    context: Record<string, any> = {}
  ): Promise<ExecutionPlan> {
    this.logger.info(`Revising plan ${plan.id} due to step ${failedStepId} failure`);

    const failedStep = plan.steps.find(s => s.id === failedStepId);
    const completedSteps = plan.steps.filter(s => s.status === 'completed');
    const remainingSteps = plan.steps.filter(s => s.status === 'pending');

    const prompt = `The execution plan failed. Revise it.

ORIGINAL GOAL: ${plan.goal}

COMPLETED STEPS:
${completedSteps.map(s => `- [OK] ${s.description}`).join('\n')}

FAILED STEP:
- [FAIL] ${failedStep?.description}
Error: ${error}

REMAINING STEPS:
${remainingSteps.map(s => `- [TODO] ${s.description}`).join('\n')}

CONTEXT: ${JSON.stringify(context, null, 2)}

Create a revised plan that:
1. Keeps completed steps as-is
2. Fixes or replaces the failed step
3. Adjusts remaining steps if needed
4. Uses tools that are more likely to succeed

Respond with the same JSON format as before.`;

    try {
      const response = await this.modelRouter.route(
        'task-planner-revision',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.3, maxTokens: 4000 },
        },
        prompt,
        { systemMessage: PLANNER_SYSTEM_PROMPT }
      );

      const parsed = this.parsePlanResponse(response);

      const revisedPlan: ExecutionPlan = {
        ...plan,
        steps: parsed.steps.map((step: any, index: number) => ({
          id: uuidv4(),
          planId: plan.id,
          order: index + 1,
          type: step.type,
          description: step.description,
          tool: step.tool,
          params: step.params || {},
          status: completedSteps.some(cs => cs.description === step.description)
            ? ('completed' as const)
            : ('pending' as const),
          retryCount: 0,
          maxRetries: 3,
        })),
        updatedAt: new Date(),
      };

      this.plans.set(revisedPlan.id, revisedPlan);
      this.logger.info(`Plan revised: ${revisedPlan.id}`);

      return revisedPlan;
    } catch (error) {
      this.logger.error('Failed to revise plan', error);
      throw error;
    }
  }

  /**
   * Get a plan by ID
   */
  getPlan(planId: string): ExecutionPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Get all plans
   */
  getAllPlans(): ExecutionPlan[] {
    return Array.from(this.plans.values());
  }

  private buildPrompt(goal: string, context: Record<string, any>): string {
    let prompt = `GOAL: ${goal}\n\n`;

    if (Object.keys(context).length > 0) {
      prompt += `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n`;
    }

    prompt += `Available tools:
- web_search: Search the web ({ "query": "..." })
- web_fetch: Fetch URL content ({ "url": "..." })
- browser_navigate: Navigate browser ({ "url": "..." })
- browser_click: Click element ({ "selector": "..." })
- browser_type: Type text ({ "text": "...", "selector": "..." })
- browser_screenshot: Take screenshot ({})
- code_write: Write file ({ "path": "...", "content": "..." })
- code_edit: Edit file ({ "path": "...", "oldText": "...", "newText": "..." })
- code_delete: Delete file ({ "path": "..." })
- run_command: Execute command ({ "command": "...", "cwd": "..." })
- npm_install: Install packages ({ "packages": ["..."], "cwd": "..." })
- run_server: Start dev server ({ "command": "...", "port": ..., "cwd": "..." })
- test_app: Test application ({ "url": "...", "tests": [...] })
- notify_user: Notify user ({ "message": "...", "summary": "..." })
- self_improve: Add capability ({ "name": "...", "description": "...", "code": "..." })

Break the goal into the MINIMUM steps needed. Be specific about tool params.`;

    return prompt;
  }

  private parsePlanResponse(response: string): any {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response.trim();

    // Remove markdown code blocks
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').replace(/```\s*$/g, '');
    }

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      // Try to find JSON object in the response
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse plan response: ${error}`);
    }
  }
}
