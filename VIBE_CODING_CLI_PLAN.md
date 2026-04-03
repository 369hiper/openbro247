# Vibe Coding CLI - Multi-Agent Operable Coding Assistant

## 🎯 Vision

Build a CLI-based coding assistant (like Cline) that can be **operated by AI agents** through a multi-agent system. The CLI should have MCP support and be controllable by parent agents. **The CLI runs in the background, writing and editing code autonomously, while AI agents monitor and control its direction.**

## 🔑 Key Differentiator

Unlike traditional coding assistants that wait for user input, this CLI:
1. **Runs autonomously in the background** - Continuously writes and edits code
2. **AI agents monitor progress** - Real-time observation of what the CLI is doing
3. **AI agents control direction** - Can redirect, pause, resume, or stop the CLI
4. **Multi-agent orchestration** - Multiple agents can collaborate on different tasks
5. **Open Claw style** - Like Open Claw's agent control, but for coding

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PARENT AI AGENT                           │
│              (Orchestrator / Master Agent)                   │
│         Monitors & Controls via MCP Protocol                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ MCP Protocol (stdio/SSE)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  VIBE CODING CLI                             │
│                  (MCP Server + Background Worker)            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Tools     │  │  Resources  │  │  Prompts    │         │
│  │  Registry   │  │  Registry   │  │  Registry   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   File      │  │  Terminal   │  │   Code      │         │
│  │  Operations │  │  Execution  │  │  Generation │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Git       │  │  Testing    │  │  Context    │         │
│  │  Operations │  │  Framework  │  │  Manager    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Background │  │  Monitor    │  │  Control    │         │
│  │  Worker     │  │  System     │  │  Interface  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Sub-agents
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUB-AGENTS                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Code      │  │   Test      │  │   Deploy    │         │
│  │   Writer    │  │   Runner    │  │   Agent     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Core Components

### 1. MCP Server (Main CLI)

The CLI acts as an MCP server that exposes tools, resources, and prompts to parent agents. **It also runs a background worker that continuously writes and edits code.**

```typescript
// src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export class VibeCodingMCPServer {
  private server: McpServer;
  private toolRegistry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;

  constructor() {
    this.server = new McpServer({
      name: 'vibe-coding-cli',
      version: '1.0.0',
    });
    
    this.toolRegistry = new ToolRegistry();
    this.resourceRegistry = new ResourceRegistry();
    this.promptRegistry = new PromptRegistry();
    
    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Vibe Coding CLI MCP Server started');
    
    // Start background worker
    this.backgroundWorker.start();
    console.log('Background worker started');
  }
}
```

### 2. Tool Registry

Expose coding operations as MCP tools that parent agents can call.

```typescript
// src/tools/registry.ts
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}

// src/tools/definitions.ts
export const TOOLS = {
  // File Operations
  readFile: {
    name: 'read_file',
    description: 'Read contents of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
      },
      required: ['path'],
    },
  },
  
  writeFile: {
    name: 'write_file',
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  
  editFile: {
    name: 'edit_file',
    description: 'Edit specific parts of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        oldText: { type: 'string', description: 'Text to replace' },
        newText: { type: 'string', description: 'New text' },
      },
      required: ['path', 'oldText', 'newText'],
    },
  },
  
  // Terminal Operations
  executeCommand: {
    name: 'execute_command',
    description: 'Execute a terminal command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
      },
      required: ['command'],
    },
  },
  
  // Code Generation
  generateCode: {
    name: 'generate_code',
    description: 'Generate code based on requirements',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: { type: 'string', description: 'Code requirements' },
        language: { type: 'string', description: 'Programming language' },
        context: { type: 'string', description: 'Additional context' },
      },
      required: ['requirements', 'language'],
    },
  },
  
  // Git Operations
  gitCommit: {
    name: 'git_commit',
    description: 'Commit changes to git',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files to commit' },
      },
      required: ['message'],
    },
  },
  
  // Testing
  runTests: {
    name: 'run_tests',
    description: 'Run test suite',
    inputSchema: {
      type: 'object',
      properties: {
        testPath: { type: 'string', description: 'Test path or pattern' },
        framework: { type: 'string', description: 'Test framework' },
      },
    },
  },
  
  // Context Management
  getProjectContext: {
    name: 'get_project_context',
    description: 'Get current project context and structure',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number', description: 'Directory depth' },
      },
    },
  },
  
  // Search
  searchCode: {
    name: 'search_code',
    description: 'Search code in project',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        filePattern: { type: 'string', description: 'File pattern to search' },
      },
      required: ['query'],
    },
  },
};
```

### 3. Tool Implementations

```typescript
// src/tools/implementations/fileOperations.ts
export class FileOperations {
  async readFile(path: string): Promise<string> {
    const fs = await import('fs/promises');
    return fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.writeFile(path, content, 'utf-8');
  }

  async editFile(path: string, oldText: string, newText: string): Promise<void> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    const updated = content.replace(oldText, newText);
    await fs.writeFile(path, updated, 'utf-8');
  }

  async listFiles(dir: string): Promise<string[]> {
    const fs = await import('fs/promises');
    return fs.readdir(dir, { recursive: true }) as Promise<string[]>;
  }
}

// src/tools/implementations/terminalOperations.ts
export class TerminalOperations {
  async executeCommand(command: string, cwd?: string): Promise<CommandResult> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      const { stdout, stderr } = await execAsync(command, { cwd });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { 
        success: false, 
        stdout: '', 
        stderr: error.message 
      };
    }
  }
}

// src/tools/implementations/codeGeneration.ts
export class CodeGeneration {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async generateCode(
    requirements: string,
    language: string,
    context?: string
  ): Promise<string> {
    const prompt = `Generate ${language} code for the following requirements:
${requirements}

${context ? `Context:\n${context}` : ''}

Provide only the code, no explanations.`;

    return this.llm.generate(prompt);
  }

  async refactorCode(
    code: string,
    instructions: string
  ): Promise<string> {
    const prompt = `Refactor the following code according to these instructions:
${instructions}

Code:
${code}

Provide only the refactored code.`;

    return this.llm.generate(prompt);
  }
}
```

### 4. Resource Registry

Expose project resources to parent agents.

```typescript
// src/resources/registry.ts
export class ResourceRegistry {
  private resources: Map<string, Resource> = new Map();

  register(resource: Resource) {
    this.resources.set(resource.uri, resource);
  }

  get(uri: string): Resource | undefined {
    return this.resources.get(uri);
  }

  list(): Resource[] {
    return Array.from(this.resources.values());
  }
}

// src/resources/definitions.ts
export const RESOURCES = {
  projectStructure: {
    uri: 'vibe-coding://project/structure',
    name: 'Project Structure',
    description: 'Current project directory structure',
    mimeType: 'text/plain',
  },
  
  fileList: {
    uri: 'vibe-coding://project/files',
    name: 'File List',
    description: 'List of all files in project',
    mimeType: 'application/json',
  },
  
  gitStatus: {
    uri: 'vibe-coding://git/status',
    name: 'Git Status',
    description: 'Current git status',
    mimeType: 'text/plain',
  },
  
  testResults: {
    uri: 'vibe-coding://tests/results',
    name: 'Test Results',
    description: 'Latest test results',
    mimeType: 'application/json',
  },
};
```

### 5. Prompt Registry

Expose coding prompts to parent agents.

```typescript
// src/prompts/registry.ts
export class PromptRegistry {
  private prompts: Map<string, Prompt> = new Map();

  register(prompt: Prompt) {
    this.prompts.set(prompt.name, prompt);
  }

  get(name: string): Prompt | undefined {
    return this.prompts.get(name);
  }

  list(): Prompt[] {
    return Array.from(this.prompts.values());
  }
}

// src/prompts/definitions.ts
export const PROMPTS = {
  codeReview: {
    name: 'code_review',
    description: 'Review code for issues and improvements',
    arguments: [
      { name: 'code', description: 'Code to review', required: true },
      { name: 'language', description: 'Programming language', required: true },
    ],
  },
  
  generateTests: {
    name: 'generate_tests',
    description: 'Generate tests for code',
    arguments: [
      { name: 'code', description: 'Code to test', required: true },
      { name: 'framework', description: 'Test framework', required: true },
    ],
  },
  
  explainCode: {
    name: 'explain_code',
    description: 'Explain how code works',
    arguments: [
      { name: 'code', description: 'Code to explain', required: true },
    ],
  },
  
  refactorCode: {
    name: 'refactor_code',
    description: 'Refactor code for better quality',
    arguments: [
      { name: 'code', description: 'Code to refactor', required: true },
      { name: 'goals', description: 'Refactoring goals', required: true },
    ],
  },
};
```

### 6. Context Manager

Manage project context for multi-file operations.

```typescript
// src/context/manager.ts
export class ContextManager {
  private projectRoot: string;
  private fileCache: Map<string, string> = new Map();
  private astCache: Map<string, AST> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async getProjectStructure(): Promise<ProjectStructure> {
    const files = await this.listFiles(this.projectRoot);
    return this.buildTree(files);
  }

  async getFileContext(filePath: string): Promise<FileContext> {
    const content = await this.readFile(filePath);
    const ast = await this.parseAST(filePath, content);
    
    return {
      path: filePath,
      content,
      ast,
      imports: this.extractImports(ast),
      exports: this.extractExports(ast),
      functions: this.extractFunctions(ast),
      classes: this.extractClasses(ast),
    };
  }

  async getRelevantFiles(query: string): Promise<string[]> {
    // Use embeddings to find relevant files
    const embeddings = await this.embedQuery(query);
    return this.searchSimilar(embeddings);
  }

  async getMultiFileContext(filePaths: string[]): Promise<MultiFileContext> {
    const contexts = await Promise.all(
      filePaths.map(path => this.getFileContext(path))
    );
    
    return {
      files: contexts,
      relationships: this.analyzeRelationships(contexts),
      dependencies: this.extractDependencies(contexts),
    };
  }
}
```

### 7. Sub-Agent System

Enable the CLI to spawn sub-agents for complex tasks.

```typescript
// src/agents/subAgent.ts
export class SubAgent {
  private id: string;
  private role: string;
  private llm: LLMProvider;
  private tools: ToolRegistry;

  constructor(config: SubAgentConfig) {
    this.id = config.id;
    this.role = config.role;
    this.llm = config.llm;
    this.tools = config.tools;
  }

  async execute(task: string): Promise<AgentResult> {
    const context = await this.buildContext(task);
    const plan = await this.createPlan(task, context);
    
    for (const step of plan.steps) {
      const result = await this.executeStep(step);
      if (!result.success) {
        return { success: false, error: result.error };
      }
    }
    
    return { success: true, result: plan.finalResult };
  }

  private async executeStep(step: Step): Promise<StepResult> {
    const tool = this.tools.get(step.tool);
    if (!tool) {
      return { success: false, error: `Tool ${step.tool} not found` };
    }
    
    return tool.execute(step.params);
  }
}

// src/agents/orchestrator.ts
export class AgentOrchestrator {
  private agents: Map<string, SubAgent> = new Map();
  private taskQueue: Task[] = [];

  registerAgent(agent: SubAgent) {
    this.agents.set(agent.id, agent);
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const agent = this.selectAgent(task);
    return agent.execute(task.description);
  }

  async executeParallel(tasks: Task[]): Promise<TaskResult[]> {
    return Promise.all(
      tasks.map(task => this.executeTask(task))
    );
  }

  private selectAgent(task: Task): SubAgent {
    // Select best agent based on task type
    for (const agent of this.agents.values()) {
      if (agent.canHandle(task)) {
        return agent;
      }
    }
    throw new Error(`No agent found for task: ${task.description}`);
  }
}
```

## 🚀 CLI Interface

```typescript
// src/cli/index.ts
import { Command } from 'commander';
import { VibeCodingMCPServer } from '../mcp/server.js';
import { AgentOrchestrator } from '../agents/orchestrator.js';

const program = new Command();

program
  .name('vibe-coding')
  .description('AI-powered coding CLI with MCP support')
  .version('1.0.0');

program
  .command('serve')
  .description('Start MCP server for agent control')
  .action(async () => {
    const server = new VibeCodingMCPServer();
    await server.start();
  });

program
  .command('build')
  .description('Build a feature with AI agents')
  .argument('<description>', 'Feature description')
  .option('-m, --multi-agent', 'Use multiple agents')
  .option('-p, --parallel', 'Run agents in parallel')
  .action(async (description, options) => {
    const orchestrator = new AgentOrchestrator();
    
    if (options.multiAgent) {
      await orchestrator.executeMultiAgent(description);
    } else {
      await orchestrator.executeTask({ description });
    }
  });

program
  .command('test')
  .description('Run tests with AI assistance')
  .option('-f, --fix', 'Auto-fix failing tests')
  .action(async (options) => {
    const orchestrator = new AgentOrchestrator();
    await orchestrator.runTests({ autoFix: options.fix });
  });

program
  .command('refactor')
  .description('Refactor code with AI')
  .argument('<file>', 'File to refactor')
  .option('-g, --goals <goals>', 'Refactoring goals')
  .action(async (file, options) => {
    const orchestrator = new AgentOrchestrator();
    await orchestrator.refactor(file, options.goals);
  });

program.parse();
```

## 📋 Implementation Plan

### Phase 1: Core MCP Server (Week 1)
- [ ] Set up MCP server with stdio transport
- [ ] Implement tool registry
- [ ] Implement resource registry
- [ ] Implement prompt registry
- [ ] Create basic file operations tools
- [ ] Create terminal operations tools

### Phase 2: Code Operations (Week 2)
- [ ] Implement code generation tool
- [ ] Implement code editing tool
- [ ] Implement code search tool
- [ ] Implement AST parsing
- [ ] Implement context manager

### Phase 3: Git & Testing (Week 3)
- [ ] Implement git operations tools
- [ ] Implement test runner tool
- [ ] Implement test generator
- [ ] Implement auto-fix for tests

### Phase 4: Multi-Agent System (Week 4)
- [ ] Implement sub-agent system
- [ ] Implement agent orchestrator
- [ ] Implement parallel execution
- [ ] Implement task queue

### Phase 5: Advanced Features (Week 5)
- [ ] Implement memory/learning system
- [ ] Implement project templates
- [ ] Implement dependency management
- [ ] Implement deployment tools

## 🔧 Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "commander": "^12.0.0",
    "typescript": "^5.3.0",
    "tree-sitter": "^0.21.0",
    "tree-sitter-typescript": "^0.21.0",
    "tree-sitter-python": "^0.21.0",
    "tree-sitter-javascript": "^0.21.0",
    "chromadb": "^1.8.0",
    "openai": "^4.28.0",
    "@anthropic-ai/sdk": "^0.10.0"
  }
}
```

## 🎯 Key Features

### 1. MCP Support
- Full MCP protocol implementation
- Tools, resources, and prompts exposed
- Stdio transport for agent communication
- SSE transport for remote access

### 2. Multi-Agent Operable
- Parent agent can control CLI via MCP
- Sub-agents for specialized tasks
- Parallel execution support
- Task queue management

### 3. Code Operations
- File read/write/edit
- Code generation
- Code refactoring
- AST parsing
- Semantic search

### 4. Terminal Integration
- Command execution
- Output capture
- Error handling
- Working directory management

### 5. Git Integration
- Status checking
- Commit creation
- Branch management
- Diff viewing

### 6. Testing Framework
- Test execution
- Test generation
- Auto-fix failing tests
- Coverage reporting

## 🔗 Integration with Existing System

This CLI can integrate with your existing openbro247-typescript system:

```typescript
// In your existing agent system
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Connect to Vibe Coding CLI
const transport = new StdioClientTransport({
  command: 'vibe-coding',
  args: ['serve'],
});

const client = new Client({
  name: 'openbro247-agent',
  version: '1.0.0',
});

await client.connect(transport);

// Use the CLI tools
const result = await client.callTool({
  name: 'write_file',
  arguments: {
    path: 'src/new-feature.ts',
    content: generatedCode,
  },
});
```

## 📊 Success Metrics

- [ ] MCP server responds to all tool calls
- [ ] File operations work correctly
- [ ] Terminal commands execute successfully
- [ ] Code generation produces valid code
- [ ] Multi-agent orchestration works
- [ ] Parallel execution improves performance
- [ ] Context manager maintains state
- [ ] Git operations work correctly
- [ ] Tests run and auto-fix works

---

*This plan creates a production-grade vibe coding CLI that can be operated by AI agents through MCP protocol.*
