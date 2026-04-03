import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';

// ============================================================================
// MCP TOOL REGISTRY - Internet Data Fetching & Tool Management
// ============================================================================

/**
 * MCP Tool definition
 */
export interface MCPTool {
  id: string;
  name: string;
  description: string;
  category: 'browser' | 'search' | 'file' | 'api' | 'code' | 'integration';
  serverName: string;
  inputSchema: Record<string, any>;
  handler: (params: any) => Promise<any>;
  isActive: boolean;
  metadata: {
    source: 'built_in' | 'mcp_server' | 'auto_generated';
    serverUrl?: string;
    lastUsedAt?: Date;
    usageCount: number;
  };
}

/**
 * MCP Server connection
 */
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: string[];
  capabilities: string[];
  connectedAt?: Date;
  lastError?: string;
}

/**
 * MCP Tool Registry - manages all available tools for the agent
 */
export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private servers: Map<string, MCPServer> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('MCPToolRegistry');
    this.registerBuiltInTools();
  }

  /**
   * Register all built-in tools
   */
  private registerBuiltInTools(): void {
    // Web Search Tools
    this.registerTool({
      id: uuidv4(),
      name: 'web_search',
      description: 'Search the internet using Tavily API',
      category: 'search',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Maximum results', default: 5 },
          searchDepth: { type: 'string', enum: ['basic', 'advanced'], default: 'basic' },
        },
        required: ['query'],
      },
      handler: async params => this.handleWebSearch(params),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'web_fetch',
      description: 'Fetch and extract content from a URL',
      category: 'browser',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          format: { type: 'string', enum: ['markdown', 'text', 'html'], default: 'markdown' },
          maxLength: { type: 'number', description: 'Max content length', default: 50000 },
        },
        required: ['url'],
      },
      handler: async params => this.handleWebFetch(params),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'web_scrape',
      description: 'Scrape structured data from a webpage',
      category: 'browser',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          selectors: { type: 'object', description: 'CSS selectors to extract' },
          extractLinks: { type: 'boolean', description: 'Extract all links', default: false },
        },
        required: ['url'],
      },
      handler: async params => this.handleWebScrape(params),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    // Browser Tools
    this.registerTool({
      id: uuidv4(),
      name: 'browser_navigate',
      description: 'Navigate browser to a URL',
      category: 'browser',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
        },
        required: ['url'],
      },
      handler: async params => ({ success: true, url: params.url }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'browser_click',
      description: 'Click an element in the browser',
      category: 'browser',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          text: { type: 'string', description: 'Element text' },
        },
      },
      handler: async params => ({ success: true, selector: params.selector }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'browser_type',
      description: 'Type text in the browser',
      category: 'browser',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
          selector: { type: 'string', description: 'Input selector' },
        },
        required: ['text'],
      },
      handler: async params => ({ success: true, text: params.text }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'browser_screenshot',
      description: 'Take a screenshot of the browser',
      category: 'browser',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          fullPage: { type: 'boolean', description: 'Full page screenshot', default: false },
          format: { type: 'string', enum: ['png', 'jpeg'], default: 'png' },
        },
      },
      handler: async params => ({ success: true, format: params.format }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    // Code Tools
    this.registerTool({
      id: uuidv4(),
      name: 'code_write',
      description: 'Write a file to disk',
      category: 'file',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
      handler: async params => ({ success: true, path: params.path }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'code_edit',
      description: 'Edit a file',
      category: 'file',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          oldText: { type: 'string', description: 'Text to replace' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'oldText', 'newText'],
      },
      handler: async params => ({ success: true, path: params.path }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'code_read',
      description: 'Read a file',
      category: 'file',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
      handler: async params => ({ success: true, path: params.path }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    // Terminal Tools
    this.registerTool({
      id: uuidv4(),
      name: 'run_command',
      description: 'Execute a terminal command',
      category: 'code',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in ms', default: 60000 },
        },
        required: ['command'],
      },
      handler: async params => ({ success: true, command: params.command }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'npm_install',
      description: 'Install npm packages',
      category: 'code',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          packages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Packages to install',
          },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['packages'],
      },
      handler: async params => ({ success: true, packages: params.packages }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'run_server',
      description: 'Start a development server',
      category: 'code',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Server start command' },
          port: { type: 'number', description: 'Port number' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
      handler: async params => ({ success: true, command: params.command, port: params.port }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    // Google Docs Tools
    this.registerTool({
      id: uuidv4(),
      name: 'google_docs_create',
      description: 'Create a Google Doc',
      category: 'api',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title' },
          content: { type: 'string', description: 'Initial content' },
        },
        required: ['title'],
      },
      handler: async params => ({ success: true, title: params.title }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.registerTool({
      id: uuidv4(),
      name: 'google_docs_update',
      description: 'Update a Google Doc',
      category: 'api',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          docId: { type: 'string', description: 'Document ID' },
          content: { type: 'string', description: 'New content' },
        },
        required: ['docId', 'content'],
      },
      handler: async params => ({ success: true, docId: params.docId }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    // Notification Tools
    this.registerTool({
      id: uuidv4(),
      name: 'notify_user',
      description: 'Notify the user with a message',
      category: 'integration',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to user' },
          summary: { type: 'string', description: 'Summary of work done' },
          level: { type: 'string', enum: ['info', 'success', 'warning', 'error'], default: 'info' },
        },
        required: ['message'],
      },
      handler: async params => ({ success: true, message: params.message }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    // Self-improvement Tools
    this.registerTool({
      id: uuidv4(),
      name: 'self_improve',
      description: 'Add a new capability to the agent',
      category: 'integration',
      serverName: 'built-in',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Capability name' },
          description: { type: 'string', description: 'What it does' },
          code: { type: 'string', description: 'Implementation code' },
        },
        required: ['name', 'description', 'code'],
      },
      handler: async params => ({ success: true, capability: params.name }),
      isActive: true,
      metadata: { source: 'built_in', usageCount: 0 },
    });

    this.logger.info(`Registered ${this.tools.size} built-in tools`);
  }

  /**
   * Register a tool
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.id, tool);
    this.logger.info(`Registered tool: ${tool.name}`);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): MCPTool | undefined {
    return Array.from(this.tools.values()).find(t => t.name === name && t.isActive);
  }

  /**
   * Get all tools
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: MCPTool['category']): MCPTool[] {
    return Array.from(this.tools.values()).filter(t => t.category === category && t.isActive);
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    tool.metadata.usageCount++;
    tool.metadata.lastUsedAt = new Date();

    this.logger.info(`Executing tool: ${name}`);
    return tool.handler(params);
  }

  /**
   * Connect to an MCP server
   */
  async connectServer(server: { name: string; url: string }): Promise<MCPServer> {
    const mcpServer: MCPServer = {
      id: uuidv4(),
      name: server.name,
      url: server.url,
      status: 'connected',
      tools: [],
      capabilities: [],
      connectedAt: new Date(),
    };

    this.servers.set(mcpServer.id, mcpServer);
    this.logger.info(`Connected to MCP server: ${server.name}`);

    return mcpServer;
  }

  /**
   * Register tools from an MCP server
   */
  registerServerTools(serverId: string, tools: Omit<MCPTool, 'id' | 'metadata'>[]): void {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    for (const toolDef of tools) {
      const tool: MCPTool = {
        id: uuidv4(),
        ...toolDef,
        serverName: server.name,
        isActive: true,
        metadata: {
          source: 'mcp_server',
          serverUrl: server.url,
          usageCount: 0,
        },
      };

      this.tools.set(tool.id, tool);
      server.tools.push(tool.name);
    }

    this.logger.info(`Registered ${tools.length} tools from server: ${server.name}`);
  }

  /**
   * Get all connected servers
   */
  getServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get tool stats
   */
  getStats(): {
    totalTools: number;
    activeTools: number;
    totalUsage: number;
    byCategory: Record<string, number>;
  } {
    const tools = Array.from(this.tools.values());
    return {
      totalTools: tools.length,
      activeTools: tools.filter(t => t.isActive).length,
      totalUsage: tools.reduce((sum, t) => sum + t.metadata.usageCount, 0),
      byCategory: tools.reduce(
        (acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }

  // ============================================================================
  // TOOL HANDLERS (Implementation)
  // ============================================================================

  private async handleWebSearch(params: {
    query: string;
    maxResults?: number;
    searchDepth?: string;
  }): Promise<any> {
    this.logger.info(`Web search: ${params.query}`);

    // This would integrate with Tavily or similar
    // For now, return a placeholder structure
    return {
      success: true,
      query: params.query,
      results: [],
      message: 'Web search executed via MCP tool registry',
    };
  }

  private async handleWebFetch(params: {
    url: string;
    format?: string;
    maxLength?: number;
  }): Promise<any> {
    this.logger.info(`Web fetch: ${params.url}`);

    try {
      const response = await fetch(params.url);
      const content = await response.text();

      return {
        success: true,
        url: params.url,
        status: response.status,
        content: content.slice(0, params.maxLength || 50000),
      };
    } catch (error) {
      return {
        success: false,
        url: params.url,
        error: error instanceof Error ? error.message : 'Fetch failed',
      };
    }
  }

  private async handleWebScrape(params: {
    url: string;
    selectors?: Record<string, string>;
    extractLinks?: boolean;
  }): Promise<any> {
    this.logger.info(`Web scrape: ${params.url}`);

    return {
      success: true,
      url: params.url,
      data: {},
      links: params.extractLinks ? [] : undefined,
    };
  }
}
