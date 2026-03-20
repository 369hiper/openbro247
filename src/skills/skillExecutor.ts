import { SkillRegistry, SkillDefinition } from "./skillRegistry";
import { Logger } from "../utils/logger";

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  logs?: string[];
}

export class SkillExecutor {
  private registry: SkillRegistry;
  private logger: Logger;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
    this.logger = new Logger("SkillExecutor");
  }

  async execute(skillName: string, params: any, context?: any): Promise<ExecutionResult> {
    this.logger.info(`Executing skill: ${skillName}`, params);

    const skill = this.registry.getSkill(skillName);
    if (!skill) {
      return {
        success: false,
        error: `Skill '${skillName}' not found in registry.`
      };
    }

    try {
      // Basic validation
      const missingParams = skill.parameters
        .filter(p => p.required && (params[p.name] === undefined || params[p.name] === null))
        .map(p => p.name);

      if (missingParams.length > 0) {
        return {
          success: false,
          error: `Missing required parameters: ${missingParams.join(', ')}`
        };
      }

      // Execute the handler
      const result = await skill.handler(params, context);
      
      return {
        success: true,
        result
      };

    } catch (error) {
      this.logger.error(`Error executing skill ${skillName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Helper to execute a sequence of skills (a plan)
  async executePlan(plan: Array<{ skill: string; params: any }>, context?: any): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    
    for (const step of plan) {
      const result = await this.execute(step.skill, step.params, context);
      results.push(result);
      
      // Stop on failure? Or continue? For now, we continue but mark failure.
      if (!result.success) {
        this.logger.warn(`Plan step failed: ${step.skill}`, result.error);
        // Depending on policy, we might break here.
      }
    }
    
    return results;
  }
}
