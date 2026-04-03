// ============================================================================
// TOOL PARSER - Cline-Style XML Tool Call Parsing
// ============================================================================
// Inspired by Cline's parseAssistantMessageV2 for parsing XML-based tool calls

import { Logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Tool parameter definition
 */
export interface ToolParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
}

/**
 * Tool definition for parsing
 */
export interface ToolDefinition {
  name: string;
  description: string;
  params: ToolParamDef[];
}

/**
 * Parsed tool use from assistant message
 */
export interface ToolUse {
  id: string;
  name: string;
  params: Record<string, string>;
  partial: boolean;
}

/**
 * Text content from assistant message
 */
export interface TextContent {
  type: 'text';
  text: string;
  partial: boolean;
}

/**
 * Content block from parsed message
 */
export type AssistantMessageContent = TextContent | (ToolUse & { type: 'tool_use' });

/**
 * Parsing options
 */
export interface ParseOptions {
  strictMode?: boolean;
  allowPartial?: boolean;
}

// ============================================================================
// Default Tool Definitions (Cline-style)
// ============================================================================

/**
 * Built-in tool definitions matching common agentic AI tools
 */
export const DEFAULT_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    params: [
      { name: 'path', type: 'string', required: true, description: 'The file path to read' },
    ],
  },
  {
    name: 'write_to_file',
    description: "Write content to a file, creating it if it doesn't exist",
    params: [
      { name: 'path', type: 'string', required: true, description: 'The file path to write to' },
      { name: 'content', type: 'string', required: true, description: 'The content to write' },
    ],
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing old text with new text',
    params: [
      { name: 'path', type: 'string', required: true, description: 'The file path to edit' },
      { name: 'oldText', type: 'string', required: true, description: 'The text to replace' },
      { name: 'newText', type: 'string', required: true, description: 'The replacement text' },
    ],
  },
  {
    name: 'execute_command',
    description: 'Execute a terminal/shell command',
    params: [
      { name: 'command', type: 'string', required: true, description: 'The command to execute' },
      { name: 'cwd', type: 'string', required: false, description: 'Working directory' },
    ],
  },
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the browser',
    params: [
      { name: 'url', type: 'string', required: true, description: 'The URL to navigate to' },
    ],
  },
  {
    name: 'browser_click',
    description: 'Click on an element in the browser',
    params: [
      {
        name: 'selector',
        type: 'string',
        required: true,
        description: 'CSS selector of the element',
      },
    ],
  },
  {
    name: 'browser_type',
    description: 'Type text into an input element',
    params: [
      {
        name: 'selector',
        type: 'string',
        required: true,
        description: 'CSS selector of the input',
      },
      { name: 'text', type: 'string', required: true, description: 'Text to type' },
    ],
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current browser page',
    params: [],
  },
  {
    name: 'ask_followup_question',
    description: 'Ask the user a follow-up question',
    params: [
      { name: 'question', type: 'string', required: true, description: 'The question to ask' },
    ],
  },
  {
    name: 'attempt_completion',
    description: 'Signal that the task is complete',
    params: [{ name: 'result', type: 'string', required: true, description: 'The final result' }],
  },
];

/**
 * Get tool names from definitions
 */
export function getToolNames(tools: ToolDefinition[] = DEFAULT_TOOLS): string[] {
  return tools.map(t => t.name);
}

/**
 * Get opening tag for a tool
 */
export function getToolOpenTag(toolName: string): string {
  return `<${toolName}>`;
}

/**
 * Get closing tag for a tool
 */
export function getToolCloseTag(toolName: string): string {
  return `</${toolName}>`;
}

/**
 * Get parameter opening tag
 */
export function getParamOpenTag(paramName: string): string {
  return `<${paramName}>`;
}

/**
 * Get parameter closing tag
 */
export function getParamCloseTag(paramName: string): string {
  return `</${paramName}>`;
}

// ============================================================================
// Tool Parser - Main Implementation
// ============================================================================

/**
 * Parses assistant messages containing XML-style tool calls
 * Inspired by Cline's parseAssistantMessageV2
 */
export class ToolParser {
  private logger: Logger;
  private tools: Map<string, ToolDefinition>;
  private toolOpenTags: Map<string, string>;
  private paramOpenTags: Map<string, string>;

  constructor(tools: ToolDefinition[] = DEFAULT_TOOLS) {
    this.logger = new Logger('ToolParser');
    this.tools = new Map(tools.map(t => [t.name, t]));

    // Precompute tags for faster lookups
    this.toolOpenTags = new Map();
    this.paramOpenTags = new Map();

    for (const tool of tools) {
      this.toolOpenTags.set(`<${tool.name}>`, tool.name);
      for (const param of tool.params) {
        this.paramOpenTags.set(`<${param.name}>`, param.name);
      }
    }
  }

  /**
   * Parse an assistant message potentially containing mixed text and tool use blocks
   */
  parse(message: string, options: ParseOptions = {}): AssistantMessageContent[] {
    const blocks: AssistantMessageContent[] = [];
    let currentTextStart = 0;
    let currentToolUse: ToolUse | undefined;
    let currentParamName: string | undefined;
    let currentParamStart = 0;

    const len = message.length;

    for (let i = 0; i < len; i++) {
      // === State: Parsing a Tool Parameter ===
      if (currentToolUse && currentParamName) {
        const closeTag = `</${currentParamName}>`;

        // Check if the string ending at index i matches the closing tag
        if (i >= closeTag.length - 1) {
          const potentialClose = message.slice(i - closeTag.length + 1, i + 1);
          if (potentialClose === closeTag) {
            // Found closing tag for parameter
            const value = message.slice(currentParamStart, i - closeTag.length + 1).trim();
            currentToolUse.params[currentParamName] = value;
            currentParamName = undefined;
            continue;
          }
        }
        continue;
      }

      // === State: Parsing a Tool Use (but not specific parameter) ===
      if (currentToolUse && !currentParamName) {
        // Check for parameter opening tags
        for (const [tag, paramName] of this.paramOpenTags) {
          if (i >= tag.length - 1) {
            const potentialTag = message.slice(i - tag.length + 1, i + 1);
            if (potentialTag === tag) {
              currentParamName = paramName;
              currentParamStart = i + 1;
              break;
            }
          }
        }

        // Check for tool closing tag
        if (!currentParamName) {
          const closeTag = `</${currentToolUse.name}>`;
          if (i >= closeTag.length - 1) {
            const potentialClose = message.slice(i - closeTag.length + 1, i + 1);
            if (potentialClose === closeTag) {
              // Tool use complete
              blocks.push({
                type: 'tool_use',
                ...currentToolUse,
                partial: false,
              });
              currentToolUse = undefined;
              currentTextStart = i + 1;
              continue;
            }
          }
        }
        continue;
      }

      // === State: Parsing Text (not in tool use) ===
      // Check for tool opening tags
      for (const [tag, toolName] of this.toolOpenTags) {
        if (i >= tag.length - 1) {
          const potentialTag = message.slice(i - tag.length + 1, i + 1);
          if (potentialTag === tag) {
            // Flush any accumulated text
            if (i - tag.length + 1 > currentTextStart) {
              const text = message.slice(currentTextStart, i - tag.length + 1);
              if (text.trim()) {
                blocks.push({
                  type: 'text',
                  text: text,
                  partial: false,
                });
              }
            }

            // Start new tool use
            currentToolUse = {
              id: this.generateId(),
              name: toolName,
              params: {},
              partial: true,
            };
            currentTextStart = i + 1;
            break;
          }
        }
      }
    }

    // Handle remaining content
    if (currentToolUse) {
      // Tool use was started but not closed - mark as partial
      blocks.push({
        type: 'tool_use',
        ...currentToolUse,
        partial: true,
      });
    } else if (currentTextStart < len) {
      const text = message.slice(currentTextStart);
      if (text.trim()) {
        blocks.push({
          type: 'text',
          text: text,
          partial: options.allowPartial ?? true,
        });
      }
    }

    return blocks;
  }

  /**
   * Check if message contains any tool calls
   */
  hasToolCalls(message: string): boolean {
    for (const [tag] of this.toolOpenTags) {
      if (message.includes(tag)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract all tool uses from message (ignoring text)
   */
  extractToolUses(message: string): ToolUse[] {
    const blocks = this.parse(message);
    return blocks.filter((b): b is ToolUse & { type: 'tool_use' } => b.type === 'tool_use');
  }

  /**
   * Extract text content from message (ignoring tool calls)
   */
  extractText(message: string): string {
    const blocks = this.parse(message);
    return blocks
      .filter((b): b is TextContent => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }

  /**
   * Validate a tool use against its definition
   */
  validateToolUse(toolUse: ToolUse): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const toolDef = this.tools.get(toolUse.name);

    if (!toolDef) {
      errors.push(`Unknown tool: ${toolUse.name}`);
      return { valid: false, errors };
    }

    // Check required parameters
    for (const param of toolDef.params) {
      if (param.required && !(param.name in toolUse.params)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
    }

    // Check for unknown parameters
    const knownParams = new Set(toolDef.params.map(p => p.name));
    for (const paramName of Object.keys(toolUse.params)) {
      if (!knownParams.has(paramName)) {
        errors.push(`Unknown parameter: ${paramName}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Build a tool call XML string
   */
  buildToolCall(toolName: string, params: Record<string, string>): string {
    const parts: string[] = [];
    parts.push(`<${toolName}>`);

    for (const [key, value] of Object.entries(params)) {
      parts.push(`<${key}>${value}</${key}>`);
    }

    parts.push(`</${toolName}>`);
    return parts.join('\n');
  }

  /**
   * Generate unique ID for tool use
   */
  private generateId(): string {
    return `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ============================================================================
// Builder - Fluent API for building tool call messages
// ============================================================================

/**
 * Builder for creating assistant messages with tool calls
 */
export class ToolCallBuilder {
  private parts: string[] = [];

  /**
   * Add text content
   */
  addText(text: string): this {
    this.parts.push(text);
    return this;
  }

  /**
   * Add a tool call
   */
  addToolCall(toolName: string, params: Record<string, string>): this {
    const parser = new ToolParser();
    this.parts.push(parser.buildToolCall(toolName, params));
    return this;
  }

  /**
   * Build the complete message
   */
  build(): string {
    return this.parts.join('\n\n');
  }
}

// ============================================================================
// Response Formatter - Format responses with tool calls
// ============================================================================

/**
 * Formatter for creating responses with proper XML structure
 */
export class ResponseFormatter {
  /**
   * Format a file read response
   */
  static fileRead(path: string, content: string): string {
    return `I'll read the file for you.

<read_file>
<path>${path}</path>
</read_file>

Here's the content of \`${path}\`:

\`\`\`
${content}
\`\`\``;
  }

  /**
   * Format a file write request
   */
  static fileWrite(path: string, content: string): string {
    return `I'll write the file for you.

<write_to_file>
<path>${path}</path>
<content>${content}</content>
</write_to_file>

I've written the content to \`${path}\`.`;
  }

  /**
   * Format a command execution
   */
  static commandExecution(command: string, cwd?: string): string {
    const cwdTag = cwd ? `\n<cwd>${cwd}</cwd>` : '';
    return `I'll execute the command.

<execute_command>
<command>${command}</command>${cwdTag}
</execute_command>`;
  }

  /**
   * Format task completion
   */
  static completion(result: string): string {
    return `Task completed!

<attempt_completion>
<result>${result}</result>
</attempt_completion>`;
  }

  /**
   * Format a follow-up question
   */
  static followUpQuestion(question: string): string {
    return `I have a question.

<ask_followup_question>
<question>${question}</question>
</ask_followup_question>`;
  }

  /**
   * Format browser navigation
   */
  static browserNavigate(url: string): string {
    return `I'll navigate to the URL.

<browser_navigate>
<url>${url}</url>
</browser_navigate>`;
  }

  /**
   * Format browser screenshot
   */
  static browserScreenshot(): string {
    return `I'll take a screenshot.

<browser_screenshot>
</browser_screenshot>`;
  }
}
