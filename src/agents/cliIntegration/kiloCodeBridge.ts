import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { ExecutionLogger } from '../../computer-use/executionLogger';
import { MCPToolRegistry } from '../../mcp/toolRegistry';
import { ModelRouter } from '../../models/modelRouter';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// KILOCODE/CLINE OPEN SOURCE INTEGRATION
// Full integration with OpenBro 24/7 using open source tools
// ============================================================================

/**
 * MCP Server definition for open source integrations
 */
export interface MCPServerConfig {
  id: string;
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  capabilities: string[];
  isActive: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastError?: string;
  connectedAt?: Date;
}

/**
 * Open source tool definition
 */
export interface OpenSourceTool {
  id: string;
  name: string;
  description: string;
  serverId: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
  category: 'browser' | 'code' | 'file' | 'search' | 'api' | 'database' | 'custom';
  source: 'mcp' | 'builtin' | 'generated';
  metadata: {
    usageCount: number;
    lastUsedAt?: Date;
    averageLatency?: number;
  };
}

/**
 * Code generation request
 */
export interface CodeGenerationRequest {
  id: string;
  description: string;
  language: string;
  framework?: string;
  requirements: string[];
  constraints: string[];
  status: 'pending' | 'generating' | 'completed' | 'failed';
  generatedCode?: string;
  filePath?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * KiloCode Open Source Bridge - Full integration with OpenBro 24/7
 */
export class KiloCodeOpenSourceBridge extends EventEmitter {
  private logger: Logger;
  private executionLogger: ExecutionLogger;
  private toolRegistry: MCPToolRegistry;
  private modelRouter: ModelRouter;
  private workspace: string;

  // MCP Servers
  private mcpServers: Map<string, MCPServerConfig> = new Map();
  private tools: Map<string, OpenSourceTool> = new Map();

  // Code generation
  private codeGenerations: Map<string, CodeGenerationRequest> = new Map();

  // State
  private isInitialized: boolean = false;

  constructor(
    modelRouter: ModelRouter,
    toolRegistry: MCPToolRegistry,
    executionLogger: ExecutionLogger,
    workspace: string = './workspace'
  ) {
    super();
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.executionLogger = executionLogger;
    this.workspace = workspace;
    this.logger = new Logger('KiloCodeOpenSourceBridge');
  }

  /**
   * Initialize the KiloCode open source bridge
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing KiloCode Open Source Bridge...');

    try {
      // Create workspace directories
      await fs.mkdir(this.workspace, { recursive: true });
      await fs.mkdir(path.join(this.workspace, 'generated'), { recursive: true });
      await fs.mkdir(path.join(this.workspace, 'integrations'), { recursive: true });
      await fs.mkdir(path.join(this.workspace, 'mcp-servers'), { recursive: true });

      // Register open source MCP servers
      await this.registerOpenSourceMCPServers();

      // Register built-in open source tools
      await this.registerBuiltInOpenSourceTools();

      this.isInitialized = true;
      this.executionLogger.selfImprovement('info', 'KiloCode Open Source Bridge initialized');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize KiloCode Bridge', error);
      throw error;
    }
  }

  /**
   * Register open source MCP servers
   */
  private async registerOpenSourceMCPServers(): Promise<void> {
    // Filesystem MCP Server
    this.registerMCPServer({
      id: uuidv4(),
      name: 'filesystem',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-filesystem', this.workspace],
      capabilities: ['read_file', 'write_file', 'list_directory', 'search_files'],
      isActive: true,
      status: 'disconnected',
    });

    // Git MCP Server
    this.registerMCPServer({
      id: uuidv4(),
      name: 'git',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-git'],
      capabilities: ['git_status', 'git_diff', 'git_commit', 'git_log'],
      isActive: true,
      status: 'disconnected',
    });

    // Brave Search MCP Server (open source)
    this.registerMCPServer({
      id: uuidv4(),
      name: 'brave-search',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-brave-search'],
      env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY || '' },
      capabilities: ['web_search', 'local_search'],
      isActive: true,
      status: 'disconnected',
    });

    // Fetch MCP Server
    this.registerMCPServer({
      id: uuidv4(),
      name: 'fetch',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-fetch'],
      capabilities: ['fetch_url', 'fetch_html', 'fetch_markdown'],
      isActive: true,
      status: 'disconnected',
    });

    // Puppeteer MCP Server (browser automation)
    this.registerMCPServer({
      id: uuidv4(),
      name: 'puppeteer',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-puppeteer'],
      capabilities: ['browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot'],
      isActive: true,
      status: 'disconnected',
    });

    // SQLite MCP Server
    this.registerMCPServer({
      id: uuidv4(),
      name: 'sqlite',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-sqlite', path.join(this.workspace, 'data.db')],
      capabilities: ['query', 'execute', 'create_table'],
      isActive: true,
      status: 'disconnected',
    });

    // Sequential Thinking MCP Server (for planning)
    this.registerMCPServer({
      id: uuidv4(),
      name: 'sequential-thinking',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-sequential-thinking'],
      capabilities: ['think', 'analyze', 'plan'],
      isActive: true,
      status: 'disconnected',
    });

    this.logger.info(`Registered ${this.mcpServers.size} MCP servers`);
  }

  /**
   * Register built-in open source tools
   */
  private async registerBuiltInOpenSourceTools(): Promise<void> {
    // Web search tool
    this.registerTool({
      id: uuidv4(),
      name: 'web_search',
      description: 'Search the web using open source search APIs',
      serverId: 'builtin',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', default: 5 },
        },
        required: ['query'],
      },
      category: 'search',
      source: 'builtin',
      metadata: { usageCount: 0 },
    });

    // Web fetch tool
    this.registerTool({
      id: uuidv4(),
      name: 'web_fetch',
      description: 'Fetch and extract content from URLs',
      serverId: 'builtin',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          format: { type: 'string', enum: ['markdown', 'text', 'html'], default: 'markdown' },
        },
        required: ['url'],
      },
      category: 'search',
      source: 'builtin',
      metadata: { usageCount: 0 },
    });

    // Code generation tool
    this.registerTool({
      id: uuidv4(),
      name: 'generate_code',
      description: 'Generate code using LLM',
      serverId: 'builtin',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What to generate' },
          language: { type: 'string', description: 'Programming language' },
          framework: { type: 'string', description: 'Framework to use' },
        },
        required: ['description', 'language'],
      },
      category: 'code',
      source: 'builtin',
      metadata: { usageCount: 0 },
    });

    // Run command tool
    this.registerTool({
      id: uuidv4(),
      name: 'run_command',
      description: 'Execute shell commands',
      serverId: 'builtin',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
      category: 'code',
      source: 'builtin',
      metadata: { usageCount: 0 },
    });

    this.logger.info(`Registered built-in tools`);
  }

  /**
   * Register an MCP server
   */
  registerMCPServer(config: MCPServerConfig): void {
    this.mcpServers.set(config.id, config);
    this.logger.info(`Registered MCP server: ${config.name}`);
  }

  /**
   * Register a tool
   */
  registerTool(tool: OpenSourceTool): void {
    this.tools.set(tool.id, tool);

    // Also register with the main tool registry
    this.toolRegistry.registerTool({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category as any,
      serverName: tool.serverId,
      inputSchema: tool.inputSchema,
      handler: async params => this.executeTool(tool.id, params),
      isActive: true,
      metadata: {
        source: tool.source === 'builtin' ? 'built_in' : 'mcp_server',
        usageCount: tool.metadata.usageCount,
      },
    });
  }

  /**
   * Execute a tool
   */
  async executeTool(toolId: string, params: any): Promise<any> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    tool.metadata.usageCount++;
    tool.metadata.lastUsedAt = new Date();

    this.logger.info(`Executing tool: ${tool.name}`);
    this.executionLogger.selfImprovement('info', `Tool executed: ${tool.name}`);

    // Route to appropriate handler
    switch (tool.name) {
      case 'web_search':
        return this.executeWebSearch(params);
      case 'web_fetch':
        return this.executeWebFetch(params);
      case 'generate_code':
        return this.executeCodeGeneration(params);
      case 'run_command':
        return this.executeCommand(params);
      default:
        throw new Error(`Tool handler not implemented: ${tool.name}`);
    }
  }

  // ============================================================================
  // TOOL IMPLEMENTATIONS
  // ============================================================================

  /**
   * Execute web search using open source APIs
   */
  private async executeWebSearch(params: { query: string; maxResults?: number }): Promise<any> {
    this.logger.info(`Web search: ${params.query}`);

    try {
      // Try Brave Search API first (free tier available)
      if (process.env.BRAVE_API_KEY) {
        const response = await fetch('https://api.search.brave.com/res/v1/web/search', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': process.env.BRAVE_API_KEY,
          },
          body: JSON.stringify({
            q: params.query,
            count: params.maxResults || 5,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          return {
            success: true,
            results:
              data.web?.results?.map((r: any) => ({
                title: r.title,
                url: r.url,
                description: r.description,
              })) || [],
          };
        }
      }

      // Fallback to DuckDuckGo (no API key needed)
      const ddgResponse = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(params.query)}&format=json`
      );
      const ddgData = (await ddgResponse.json()) as any;

      return {
        success: true,
        results: [
          {
            title: ddgData.Heading || params.query,
            url: ddgData.AbstractURL || '',
            description: ddgData.Abstract || 'No results',
          },
        ],
      };
    } catch (error) {
      this.logger.error('Web search failed', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Execute web fetch using open source fetch
   */
  private async executeWebFetch(params: { url: string; format?: string }): Promise<any> {
    this.logger.info(`Web fetch: ${params.url}`);

    try {
      const response = await fetch(params.url);
      const content = await response.text();

      // Basic HTML to markdown conversion
      let processedContent = content;
      if (params.format === 'markdown') {
        processedContent = this.htmlToMarkdown(content);
      }

      return {
        success: true,
        url: params.url,
        status: response.status,
        content: processedContent.slice(0, 50000),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Fetch failed' };
    }
  }

  /**
   * Execute code generation using model router
   */
  private async executeCodeGeneration(params: {
    description: string;
    language: string;
    framework?: string;
  }): Promise<any> {
    const requestId = uuidv4();
    this.logger.info(`Code generation: ${params.description}`);

    const request: CodeGenerationRequest = {
      id: requestId,
      description: params.description,
      language: params.language,
      framework: params.framework,
      requirements: [],
      constraints: ['Must be production-ready', 'Include error handling'],
      status: 'generating',
      createdAt: new Date(),
    };

    this.codeGenerations.set(requestId, request);

    try {
      const prompt = `Generate ${params.language} code for: ${params.description}
${params.framework ? `Framework: ${params.framework}` : ''}

Requirements:
- Production-ready
- Include error handling
- Follow best practices
- Include comments

Respond with ONLY the code, no explanations.`;

      const response = await this.modelRouter.route(
        'kilo-code-gen',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.3, maxTokens: 4096 },
        },
        prompt
      );

      const code = this.extractCode(response);

      // Save generated code
      const fileName = `generated_${Date.now()}.${this.getFileExtension(params.language)}`;
      const filePath = path.join(this.workspace, 'generated', fileName);
      await fs.writeFile(filePath, code, 'utf-8');

      request.status = 'completed';
      request.generatedCode = code;
      request.filePath = filePath;
      request.completedAt = new Date();

      return {
        success: true,
        code,
        filePath,
        requestId,
      };
    } catch (error) {
      request.status = 'failed';
      request.error = error instanceof Error ? error.message : 'Unknown error';

      return { success: false, error: request.error };
    }
  }

  /**
   * Execute shell command
   */
  private async executeCommand(params: { command: string; cwd?: string }): Promise<any> {
    this.logger.info(`Executing command: ${params.command}`);

    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: params.cwd || this.workspace,
        timeout: 60000,
      });

      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
      };
    }
  }

  // ============================================================================
  // CODE ANALYSIS (Inspired by Cline)
  // ============================================================================

  /**
   * Analyze code for improvements (Cline-style)
   */
  async analyzeCode(options: {
    filePath: string;
    language: string;
    focusAreas?: string[];
  }): Promise<{
    success: boolean;
    issues: Array<{ line: number; message: string; severity: 'error' | 'warning' | 'info' }>;
    suggestions: string[];
    error?: string;
  }> {
    this.logger.info(`Analyzing code: ${options.filePath}`);

    try {
      const code = await fs.readFile(options.filePath, 'utf-8');

      const prompt = `Analyze this ${options.language} code for issues and improvements:

\`\`\`${options.language}
${code}
\`\`\`

${options.focusAreas ? `Focus on: ${options.focusAreas.join(', ')}` : ''}

Respond with JSON:
{
  "issues": [{ "line": 1, "message": "...", "severity": "error|warning|info" }],
  "suggestions": ["suggestion 1", "suggestion 2"]
}`;

      const response = await this.modelRouter.route(
        'kilo-code-analyzer',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.2, maxTokens: 2000 },
        },
        prompt
      );

      const result = JSON.parse(this.extractJson(response));

      return {
        success: true,
        issues: result.issues || [],
        suggestions: result.suggestions || [],
      };
    } catch (error) {
      return {
        success: false,
        issues: [],
        suggestions: [],
        error: error instanceof Error ? error.message : 'Analysis failed',
      };
    }
  }

  /**
   * Fix code issues automatically (Cline-style)
   */
  async fixCode(options: {
    filePath: string;
    issues: Array<{ line: number; message: string }>;
  }): Promise<{ success: boolean; fixedCode?: string; changes?: string[]; error?: string }> {
    this.logger.info(`Fixing code: ${options.filePath}`);

    try {
      const code = await fs.readFile(options.filePath, 'utf-8');

      const prompt = `Fix the following issues in this code:

CODE:
\`\`\`
${code}
\`\`\`

ISSUES TO FIX:
${options.issues.map(i => `- Line ${i.line}: ${i.message}`).join('\n')}

Respond with the fixed code only.`;

      const response = await this.modelRouter.route(
        'kilo-code-fixer',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.2, maxTokens: 4096 },
        },
        prompt
      );

      const fixedCode = this.extractCode(response);

      // Save fixed code
      await fs.writeFile(options.filePath, fixedCode, 'utf-8');

      return {
        success: true,
        fixedCode,
        changes: options.issues.map(i => `Fixed line ${i.line}: ${i.message}`),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Fix failed' };
    }
  }

  // ============================================================================
  // INTEGRATION CREATION (Open Source)
  // ============================================================================

  /**
   * Create a new open source integration
   */
  async createIntegration(options: {
    name: string;
    type: string;
    description: string;
    apiEndpoints?: Array<{ method: string; path: string; description: string }>;
  }): Promise<{ success: boolean; integrationPath?: string; tools?: string[]; error?: string }> {
    this.executionLogger.selfImprovement(
      'info',
      `Creating open source integration: ${options.name}`
    );

    try {
      // Generate integration code
      const code = this.generateOpenSourceIntegration(options);

      // Save integration
      const integrationDir = path.join(this.workspace, 'integrations', options.name.toLowerCase());
      await fs.mkdir(integrationDir, { recursive: true });

      const filePath = path.join(integrationDir, 'index.ts');
      await fs.writeFile(filePath, code, 'utf-8');

      // Create MCP server config for the integration
      const mcpConfig: MCPServerConfig = {
        id: uuidv4(),
        name: options.name.toLowerCase(),
        type: 'stdio',
        command: 'node',
        args: [filePath],
        capabilities: options.apiEndpoints?.map(e => e.path) || [],
        isActive: true,
        status: 'disconnected',
      };

      this.registerMCPServer(mcpConfig);

      // Register tools
      const toolNames =
        options.apiEndpoints?.map(e => `${options.name.toLowerCase()}_${e.path}`) || [];
      for (const toolName of toolNames) {
        this.registerTool({
          id: uuidv4(),
          name: toolName,
          description: `${options.name} - ${toolName}`,
          serverId: mcpConfig.id,
          inputSchema: { type: 'object', properties: {} },
          category: 'custom',
          source: 'generated',
          metadata: { usageCount: 0 },
        });
      }

      return { success: true, integrationPath: filePath, tools: toolNames };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Integration creation failed',
      };
    }
  }

  /**
   * Generate open source integration code
   */
  private generateOpenSourceIntegration(options: {
    name: string;
    type: string;
    description: string;
  }): string {
    return `/**
 * ${options.name} - Open Source Integration
 * ${options.description}
 * 
 * Generated by KiloCode Open Source Bridge for OpenBro 24/7
 * License: MIT
 */

import { z } from 'zod';

// Configuration schema
const ConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().default('https://api.example.com'),
});

type Config = z.infer<typeof ConfigSchema>;

export class ${options.name.replace(/\s+/g, '')}Integration {
  private config: Config;
  private isInitialized: boolean = false;

  constructor(config: Partial<Config>) {
    this.config = ConfigSchema.parse(config);
  }

  async initialize(): Promise<void> {
    console.log('[${options.name}] Initializing integration...');
    this.isInitialized = true;
  }

  async healthCheck(): Promise<boolean> {
    return this.isInitialized;
  }

  async execute(action: string, params: Record<string, any>): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Integration not initialized');
    }

    const response = await fetch(\`\${this.config.baseUrl}/\${action}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { 'Authorization': \`Bearer \${this.config.apiKey}\` } : {}),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(\`API error: \${response.statusText}\`);
    }

    return response.json();
  }
}

export default ${options.name.replace(/\s+/g, '')}Integration;
`;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private extractCode(response: string): string {
    const codeMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1].trim() : response.trim();
  }

  private extractJson(response: string): string {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : response;
  }

  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
  }

  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      typescript: 'ts',
      javascript: 'js',
      python: 'py',
      rust: 'rs',
      go: 'go',
      java: 'java',
    };
    return extensions[language.toLowerCase()] || 'txt';
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get all MCP servers
   */
  getMCPServers(): MCPServerConfig[] {
    return Array.from(this.mcpServers.values());
  }

  /**
   * Get all tools
   */
  getTools(): OpenSourceTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get code generations
   */
  getCodeGenerations(): CodeGenerationRequest[] {
    return Array.from(this.codeGenerations.values());
  }

  /**
   * Get stats
   */
  getStats(): {
    mcpServers: number;
    activeTools: number;
    codeGenerations: number;
    totalToolUsage: number;
  } {
    return {
      mcpServers: this.mcpServers.size,
      activeTools: Array.from(this.tools.values()).filter(t => t.source !== 'mcp' || true).length,
      codeGenerations: this.codeGenerations.size,
      totalToolUsage: Array.from(this.tools.values()).reduce(
        (sum, t) => sum + t.metadata.usageCount,
        0
      ),
    };
  }
}

// ============================================================================
// CLINE BRIDGE (Open Source)
// ============================================================================

/**
 * Cline Open Source Bridge - Integrates Cline's capabilities
 */
export class ClineOpenSourceBridge {
  private logger: Logger;
  private modelRouter: ModelRouter;
  private workspace: string;

  constructor(modelRouter: ModelRouter, workspace: string = './workspace') {
    this.logger = new Logger('ClineOpenSourceBridge');
    this.modelRouter = modelRouter;
    this.workspace = workspace;
  }

  /**
   * Initialize Cline bridge
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Cline Open Source Bridge...');
  }

  /**
   * Cline-style code review
   */
  async codeReview(options: {
    filePath: string;
    language: string;
  }): Promise<{ success: boolean; review?: string; suggestions?: string[]; error?: string }> {
    this.logger.info(`Code review: ${options.filePath}`);

    try {
      const code = await fs.readFile(options.filePath, 'utf-8');

      const prompt = `Review this ${options.language} code and provide feedback:

\`\`\`${options.language}
${code}
\`\`\`

Provide:
1. Overall assessment
2. Specific issues found
3. Improvement suggestions
4. Security concerns (if any)

Be concise and actionable.`;

      const response = await this.modelRouter.route(
        'cline-reviewer',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.3, maxTokens: 2000 },
        },
        prompt
      );

      return {
        success: true,
        review: response,
        suggestions: this.extractSuggestions(response),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Review failed' };
    }
  }

  /**
   * Cline-style refactoring
   */
  async refactor(options: {
    filePath: string;
    language: string;
    goal: string;
  }): Promise<{ success: boolean; refactoredCode?: string; changes?: string[]; error?: string }> {
    this.logger.info(`Refactoring: ${options.filePath}`);

    try {
      const code = await fs.readFile(options.filePath, 'utf-8');

      const prompt = `Refactor this code to achieve: ${options.goal}

\`\`\`${options.language}
${code}
\`\`\`

Provide the refactored code and list the changes made.`;

      const response = await this.modelRouter.route(
        'cline-refactorer',
        {
          provider: 'openrouter',
          modelId: 'anthropic/claude-3-5-sonnet',
          parameters: { temperature: 0.2, maxTokens: 4096 },
        },
        prompt
      );

      const refactoredCode = this.extractCode(response);
      const changes = this.extractChanges(response);

      await fs.writeFile(options.filePath, refactoredCode, 'utf-8');

      return { success: true, refactoredCode, changes };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Refactor failed' };
    }
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private extractSuggestions(response: string): string[] {
    const suggestions: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      if (line.match(/^-?\s*\d+\.?\s/) || line.startsWith('-')) {
        suggestions.push(line.replace(/^-?\s*\d+\.?\s*-?\s*/, '').trim());
      }
    }

    return suggestions;
  }

  private extractChanges(response: string): string[] {
    const changes: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      if (
        line.toLowerCase().includes('change') ||
        line.toLowerCase().includes('replaced') ||
        line.toLowerCase().includes('added')
      ) {
        changes.push(line.trim());
      }
    }

    return changes;
  }
}
