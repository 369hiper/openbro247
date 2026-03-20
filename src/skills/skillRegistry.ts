import { BrowserEngine } from "../browser/engine";

export interface SkillParameter {
  name: string;
  type: string; // 'string', 'number', 'boolean', 'object'
  description: string;
  required: boolean;
}

export interface SkillDefinition {
  name: string;
  description: string;
  parameters: SkillParameter[];
  handler: (params: any, context?: any) => Promise<any>;
}

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private browserEngine: BrowserEngine;

  constructor(browserEngine: BrowserEngine) {
    this.browserEngine = browserEngine;
  }

  register(skill: SkillDefinition) {
    this.skills.set(skill.name, skill);
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  // Helper to generate tool definitions for LLMs (OpenAI/Claude format)
  getToolDefinitions() {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.name,
      description: skill.description,
      input_schema: {
        type: "object",
        properties: skill.parameters.reduce((acc, param) => ({
          ...acc,
          [param.name]: {
            type: param.type,
            description: param.description
          }
        }), {}),
        required: skill.parameters.filter(p => p.required).map(p => p.name)
      }
    }));
  }
}
