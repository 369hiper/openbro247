import { Logger } from "../utils/logger.js";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPRequest {
  method: string;
  params?: any;
}

interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

interface MCPServerConfig {
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface HTTPServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

type MCPConfig = MCPServerConfig | HTTPServerConfig;

export class MCPClient {
  private logger: Logger;
  private servers: Map<string, MCPConfig> = new Map();
  private connections: Map<string, any> = new Map();
  private availableTools: Map<string, MCPTool[]> = new Map();

  constructor() {
    this.logger = new Logger("MCP-Client");
  }

  async registerServer(name: string, config: MCPConfig): Promise<void> {
    this.logger.info(`Registering MCP server: ${name}`);
    this.servers.set(name, config);
  }

  async connectToServer(name: string): Promise<void> {
    const config = this.servers.get(name);
    if (!config) {
      throw new Error(`Server ${name} not registered`);
    }

    this.logger.info(`Connecting to MCP server: ${name}`);

    try {
      let connection: any;
      
      // Check if it's an HTTP-based server
      if ('type' in config && config.type === 'http') {
        // HTTP-based MCP server connection
        connection = {
          name,
          config,
          connected: true,
          type: 'http',
          tools: [] as MCPTool[]
        };
      } else {
        // Stdio-based MCP server connection (existing behavior)
        connection = {
          name,
          config,
          connected: true,
          type: 'stdio',
          tools: [] as MCPTool[]
        };
      }

      this.connections.set(name, connection);

      // Discover available tools
      await this.discoverTools(name);

      this.logger.info(`Connected to MCP server: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to connect to MCP server: ${name}`, error);
      throw error;
    }
  }

  async disconnectFromServer(name: string): Promise<void> {
    this.logger.info(`Disconnecting from MCP server: ${name}`);
    this.connections.delete(name);
    this.availableTools.delete(name);
  }

  async discoverTools(serverName: string): Promise<MCPTool[]> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    this.logger.info(`Discovering tools from server: ${serverName}`);

    // Mock tool discovery - in real implementation, this would send
    // a tools/list request to the server
    const mockTools: MCPTool[] = [
      {
        name: `${serverName}_example_tool`,
        description: `Example tool from ${serverName}`,
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string", description: "Input parameter" }
          },
          required: ["input"]
        }
      }
    ];

    this.availableTools.set(serverName, mockTools);
    return mockTools;
  }

  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    this.logger.info(`Calling tool ${toolName} on server ${serverName}`, args);

    // Handle HTTP-based MCP servers
    if (connection.type === 'http') {
      const httpConfig = connection.config;
      try {
        const response = await fetch(`${httpConfig.url}/tools/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...httpConfig.headers
          },
          body: JSON.stringify({
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: args
            }
          })
        });
        
        const result = await response.json();
        return result;
      } catch (error) {
        this.logger.error(`HTTP MCP tool call failed: ${toolName}`, error);
        throw error;
      }
    }

    // Mock tool execution for stdio-based servers
    const response: MCPResponse = {
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              tool: toolName,
              server: serverName,
              args,
              timestamp: Date.now()
            })
          }
        ]
      }
    };

    return response;
  }

  async listTools(serverName?: string): Promise<MCPTool[]> {
    if (serverName) {
      return this.availableTools.get(serverName) || [];
    }

    const allTools: MCPTool[] = [];
    for (const tools of this.availableTools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  async listServers(): Promise<string[]> {
    return Array.from(this.servers.keys());
  }

  isConnected(serverName: string): boolean {
    return this.connections.has(serverName);
  }

  async disconnectAll(): Promise<void> {
    this.logger.info("Disconnecting from all MCP servers");
    this.connections.clear();
    this.availableTools.clear();
  }

  // Pre-configured server registrations
  async registerBlotatoServer(apiKey: string): Promise<void> {
    await this.registerServer('blotato', {
      type: 'http',
      url: 'https://mcp.blotato.com/mcp',
      headers: {
        'blotato-api-key': apiKey
      }
    });
    this.logger.info('Blotato MCP server registered');
  }

  async registerTavilyServer(): Promise<void> {
    await this.registerServer('tavily', {
      command: 'npx',
      args: ['-y', 'tavily-mcp@0.2.3']
    });
    this.logger.info('Tavily MCP server registered');
  }

  async registerContext7Server(): Promise<void> {
    await this.registerServer('context7', {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp']
    });
    this.logger.info('Context7 MCP server registered');
  }

  async registerMemoryServer(): Promise<void> {
    await this.registerServer('memory', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory']
    });
    this.logger.info('Memory MCP server registered');
  }

  async registerFetchServer(): Promise<void> {
    await this.registerServer('fetch', {
      command: 'python',
      args: ['-m', 'mcp_server_fetch']
    });
    this.logger.info('Fetch MCP server registered');
  }

  async registerAllDefaultServers(): Promise<void> {
    await this.registerTavilyServer();
    await this.registerContext7Server();
    await this.registerMemoryServer();
    await this.registerFetchServer();
    this.logger.info('All default MCP servers registered');
  }
}
