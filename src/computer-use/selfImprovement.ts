import { v4 as uuidv4 } from 'uuid';
import { ModelRouter } from '../models/modelRouter';
import { ExecutionLogger } from './executionLogger';
import { Capability, AutonomousAgentConfig } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

const IMPROVEMENT_SYSTEM_PROMPT = `You are a self-improving AI agent. When you encounter a task you cannot complete with existing tools, you can CREATE new capabilities.

Given a task description and the available capabilities, determine if a new capability is needed.

If YES, respond with JSON:
{
  "needsImprovement": true,
  "capability": {
    "name": "snake_case_name",
    "description": "What this capability does",
    "category": "browser|code|api|integration|analysis",
    "code": "// TypeScript implementation code. MUST export an async function named 'execute'.",
    "dependencies": ["dependency1"]
  },
  "reasoning": "Why this capability is needed"
}

If NO, respond with JSON:
{
  "needsImprovement": false,
  "reasoning": "Existing capabilities are sufficient"
}`;

/**
 * SelfImprovement enables the agent to extend its own capabilities
 * by generating new tools and integrations on the fly.
 */
export class SelfImprovement {
  private modelRouter: ModelRouter;
  private logger: ExecutionLogger;
  private config: AutonomousAgentConfig;
  private capabilities: Map<string, Capability> = new Map();
  private capabilitiesDir: string;

  constructor(modelRouter: ModelRouter, logger: ExecutionLogger, config: AutonomousAgentConfig) {
    this.modelRouter = modelRouter;
    this.logger = logger;
    this.config = config;
    this.capabilitiesDir = path.join(config.workspace, 'capabilities');
  }

  /**
   * Initialize the self-improvement module
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.capabilitiesDir, { recursive: true });
      await this.loadCapabilities();
      this.logger.selfImprovement('info', 'Self-improvement module initialized', {
        capabilitiesCount: this.capabilities.size,
      });
    } catch (error) {
      this.logger.selfImprovement('error', 'Failed to initialize self-improvement', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Analyze a failed task and determine if a new capability is needed
   */
  async analyzeAndImprove(
    taskDescription: string,
    error: string,
    context: Record<string, any> = {}
  ): Promise<{ improved: boolean; capability?: Capability; reasoning: string }> {
    this.logger.selfImprovement('info', 'Analyzing task for improvement opportunity', {
      task: taskDescription,
      error,
    });

    const prompt = `TASK: ${taskDescription}
ERROR: ${error}
CONTEXT: ${JSON.stringify(context, null, 2)}

AVAILABLE CAPABILITIES:
${Array.from(this.capabilities.values())
  .map(c => `- ${c.name}: ${c.description}`)
  .join('\n')}

Determine if a new capability is needed to complete this task.`;

    try {
      const response = await this.modelRouter.route(
        'self-improvement',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.3, maxTokens: 2000 },
        },
        prompt,
        { systemMessage: IMPROVEMENT_SYSTEM_PROMPT }
      );

      const parsed = this.parseResponse(response);

      if (parsed.needsImprovement && parsed.capability) {
        const capability = await this.createCapability(parsed.capability);
        return {
          improved: true,
          capability,
          reasoning: parsed.reasoning,
        };
      }

      return { improved: false, reasoning: parsed.reasoning };
    } catch (error) {
      this.logger.selfImprovement('error', 'Failed to analyze for improvement', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return { improved: false, reasoning: 'Analysis failed' };
    }
  }

  /**
   * Create and register a new capability
   */
  async createCapability(capabilityData: {
    name: string;
    description: string;
    category: Capability['category'];
    code: string;
    dependencies?: string[];
  }): Promise<Capability> {
    const capability: Capability = {
      id: uuidv4(),
      name: capabilityData.name,
      description: capabilityData.description,
      category: capabilityData.category,
      code: capabilityData.code,
      source: 'auto_generated',
      version: '1.0.0',
      isActive: true,
      dependencies: capabilityData.dependencies || [],
      createdAt: new Date(),
    };

    // Save capability to file
    const filePath = path.join(this.capabilitiesDir, `${capability.name}.ts`);

    // Add wrapper code for the capability
    const wrappedCode = this.wrapCapabilityCode(capabilityData);
    await fs.writeFile(filePath, wrappedCode, 'utf-8');

    // Try to compile the TypeScript to JavaScript
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Compile TypeScript to JavaScript
      const tscCommand = `npx tsc "${filePath}" --outDir "${this.capabilitiesDir}" --module commonjs --target ES2020 --esModuleInterop --skipLibCheck`;
      await execAsync(tscCommand);

      this.logger.selfImprovement('info', `Compiled capability: ${capability.name}`);
    } catch (compileError) {
      this.logger.selfImprovement(
        'warn',
        `Could not compile capability ${capability.name}: ${compileError}`
      );
      // Continue anyway - capability is still registered
    }

    // Try to dynamically load the capability
    try {
      await this.loadCapability(capability);
    } catch (loadError) {
      this.logger.selfImprovement('warn', `Could not dynamically load capability: ${loadError}`);
    }

    // Register capability
    this.capabilities.set(capability.id, capability);

    this.logger.selfImprovement('info', `Created new capability: ${capability.name}`, {
      category: capability.category,
      filePath,
    });

    // Save metadata
    await this.saveCapabilitiesMetadata();

    return capability;
  }

  /**
   * Wrap capability code with proper exports and metadata
   */
  private wrapCapabilityCode(data: {
    name: string;
    description: string;
    category: Capability['category'];
    code: string;
    dependencies?: string[];
  }): string {
    return `/**
 * Auto-generated capability: ${data.name}
 * Category: ${data.category}
 * Description: ${data.description}
 * Generated at: ${new Date().toISOString()}
 */

${data.code}

/**
 * Capability metadata
 */
export const capabilityMetadata = {
  name: "${data.name}",
  description: "${data.description}",
  category: "${data.category}",
  version: "1.0.0",
  dependencies: ${JSON.stringify(data.dependencies || [])},
  createdAt: "${new Date().toISOString()}"
};

// If the LLM did not provide an execute function, we log a warning but keep the file valid.
// The capability will fail to load if it lacks an exported execute function.
`;
  }

  /**
   * Dynamically load a capability module
   */
  private async loadCapability(capability: Capability): Promise<void> {
    try {
      const jsPath = path.join(this.capabilitiesDir, `${capability.name}.js`);

      // Check if compiled JS exists
      const fsSync = await import('fs');
      if (!fsSync.existsSync(jsPath)) {
        throw new Error('Compiled JS not found');
      }

      // Dynamically require the module
      const loadedModule = await import(jsPath);

      // Store the execute function if available
      if (loadedModule.execute && typeof loadedModule.execute === 'function') {
        capability.isActive = true;
        this.logger.selfImprovement('info', `Loaded capability: ${capability.name}`);
      }
    } catch (error) {
      this.logger.selfImprovement('warn', `Failed to load capability ${capability.name}: ${error}`);
    }
  }

  /**
   * Execute a capability by name
   */
  async executeCapability(
    name: string,
    params: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const capability = Array.from(this.capabilities.values()).find(
      c => c.name === name && c.isActive
    );

    if (!capability) {
      return { success: false, error: `Capability '${name}' not found or inactive` };
    }

    try {
      const jsPath = path.join(this.capabilitiesDir, `${capability.name}.js`);
      const loadedModule = await import(jsPath);

      if (loadedModule.execute && typeof loadedModule.execute === 'function') {
        const result = await loadedModule.execute(params);
        capability.lastUsedAt = new Date();
        return { success: true, result };
      }

      return { success: false, error: 'Capability has no execute function' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Execution failed' };
    }
  }

  /**
   * List all capabilities
   */
  getCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get a capability by name
   */
  getCapability(name: string): Capability | undefined {
    return Array.from(this.capabilities.values()).find(c => c.name === name);
  }

  /**
   * Deactivate a capability
   */
  async deactivateCapability(capabilityId: string): Promise<void> {
    const capability = this.capabilities.get(capabilityId);
    if (capability) {
      capability.isActive = false;
      await this.saveCapabilitiesMetadata();
      this.logger.selfImprovement('info', `Deactivated capability: ${capability.name}`);
    }
  }

  /**
   * Delete a capability
   */
  async deleteCapability(capabilityId: string): Promise<void> {
    const capability = this.capabilities.get(capabilityId);
    if (capability) {
      const filePath = path.join(this.capabilitiesDir, `${capability.name}.ts`);
      try {
        await fs.unlink(filePath);
      } catch {
        // File might not exist
      }
      this.capabilities.delete(capabilityId);
      await this.saveCapabilitiesMetadata();
      this.logger.selfImprovement('info', `Deleted capability: ${capability.name}`);
    }
  }

  /**
   * Check if a required capability exists
   */
  hasCapability(name: string): boolean {
    return Array.from(this.capabilities.values()).some(c => c.name === name && c.isActive);
  }

  /**
   * Get active capabilities count
   */
  getActiveCount(): number {
    return Array.from(this.capabilities.values()).filter(c => c.isActive).length;
  }

  private async loadCapabilities(): Promise<void> {
    try {
      const metaPath = path.join(this.capabilitiesDir, 'metadata.json');
      const content = await fs.readFile(metaPath, 'utf-8');
      const metadata = JSON.parse(content);

      for (const cap of metadata.capabilities || []) {
        this.capabilities.set(cap.id, {
          ...cap,
          createdAt: new Date(cap.createdAt),
          lastUsedAt: cap.lastUsedAt ? new Date(cap.lastUsedAt) : undefined,
        });
      }

      this.logger.selfImprovement('info', `Loaded ${this.capabilities.size} capabilities`);
    } catch {
      this.logger.selfImprovement('info', 'No existing capabilities found');
    }
  }

  private async saveCapabilitiesMetadata(): Promise<void> {
    const metaPath = path.join(this.capabilitiesDir, 'metadata.json');
    const metadata = {
      capabilities: Array.from(this.capabilities.values()),
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  private parseResponse(response: string): any {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').replace(/```\s*$/g, '');
    }
    try {
      return JSON.parse(jsonStr);
    } catch {
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Failed to parse improvement response');
    }
  }
}
