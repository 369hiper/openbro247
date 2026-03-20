import { Command } from "commander";
import { BrowserEngine } from "../browser/engine.js";
import { SemanticMemory } from "../memory/semanticMemory.js";
import { LLMManager } from "../ai/llmManager.js";
import { MCPServer } from "../mcp/server.js";
import { MCPClient } from "../mcp/client.js";
import { Logger } from "../utils/logger.js";

const logger = new Logger("CLI");

interface StartOptions {
  port: string;
  mcp: boolean;
}

interface BrowseOptions {
  screenshot: boolean;
  extract?: string;
}

interface MemoryStoreOptions {
  type: string;
  tags?: string[];
}

interface MemorySearchOptions {
  limit: string;
  type?: string;
}

interface ResearchOptions {
  depth: string;
  sources: string;
}

interface AnalyzeOptions {
  task: string;
  model?: string;
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("openbro247")
    .description("AI-powered browser automation system with semantic memory and MCP integration")
    .version("1.0.0");

  // Start command
  program
    .command("start")
    .description("Start the OpenBro247 server")
    .option("-p, --port <port>", "Port to run the server on", "3001")
    .option("-m, --mcp", "Start MCP server", false)
    .action(async (options: StartOptions) => {
      logger.info("Starting OpenBro247 server...");
      logger.info(`Port: ${options.port}`);
      logger.info(`MCP Server: ${options.mcp ? "enabled" : "disabled"}`);
      
      // Initialize components
      const browserEngine = new BrowserEngine();
      const memory = new SemanticMemory({
        vectorPath: "./data/vectors",
        sqlitePath: "./data/memory.db"
      });
      const llmManager = new LLMManager({
        defaultProvider: "openai",
        providers: {
          openai: {
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-4"
          }
        }
      });

      await memory.initialize();
      await browserEngine.launch();

      if (options.mcp) {
        const mcpServer = new MCPServer(browserEngine, memory, llmManager);
        await mcpServer.start();
        logger.info("MCP server started");
      }

      logger.info("OpenBro247 server started successfully");
    });

  // Browse command
  program
    .command("browse")
    .description("Browse a website")
    .argument("<url>", "URL to browse")
    .option("-s, --screenshot", "Take a screenshot", false)
    .option("-e, --extract <selector>", "Extract text from selector")
    .action(async (url: string, options: BrowseOptions) => {
      logger.info(`Browsing: ${url}`);
      
      const browserEngine = new BrowserEngine();
      await browserEngine.launch();
      await browserEngine.navigate(url);

      if (options.extract) {
        const text = await browserEngine.extractText(options.extract);
        console.log("Extracted text:", text);
      }

      if (options.screenshot) {
        const screenshot = await browserEngine.takeScreenshot();
        console.log("Screenshot taken");
      }

      await browserEngine.close();
    });

  // Memory command
  const memoryCmd = program
    .command("memory")
    .description("Manage semantic memory");

  memoryCmd
    .command("store")
    .description("Store content in memory")
    .argument("<content>", "Content to store")
    .option("-t, --type <type>", "Memory type", "general")
    .option("--tags <tags...>", "Tags for categorization")
    .action(async (content: string, options: MemoryStoreOptions) => {
      const memory = new SemanticMemory({
        vectorPath: "./data/vectors",
        sqlitePath: "./data/memory.db"
      });
      await memory.initialize();

      const id = await memory.store(content, options.type, {
        tags: options.tags || []
      });

      console.log(`Memory stored with ID: ${id}`);
      memory.close();
    });

  memoryCmd
    .command("search")
    .description("Search semantic memory")
    .argument("<query>", "Search query")
    .option("-l, --limit <limit>", "Maximum results", "10")
    .option("-t, --type <type>", "Filter by type")
    .action(async (query: string, options: MemorySearchOptions) => {
      const memory = new SemanticMemory({
        vectorPath: "./data/vectors",
        sqlitePath: "./data/memory.db"
      });
      await memory.initialize();

      const results = await memory.search(query, {
        limit: parseInt(options.limit),
        type: options.type
      });

      console.log(`Found ${results.length} results:`);
      results.forEach((result, i) => {
        console.log(`${i + 1}. ${result.content}`);
      });

      memory.close();
    });

  // MCP command
  const mcpCmd = program
    .command("mcp")
    .description("Manage MCP servers");

  mcpCmd
    .command("start")
    .description("Start MCP server")
    .action(async () => {
      const browserEngine = new BrowserEngine();
      const memory = new SemanticMemory({
        vectorPath: "./data/vectors",
        sqlitePath: "./data/memory.db"
      });
      const llmManager = new LLMManager({
        defaultProvider: "openai",
        providers: {}
      });

      await memory.initialize();
      await browserEngine.launch();

      const mcpServer = new MCPServer(browserEngine, memory, llmManager);
      await mcpServer.start();
    });

  mcpCmd
    .command("list-tools")
    .description("List available MCP tools")
    .action(async () => {
      const mcpClient = new MCPClient();
      const tools = await mcpClient.listTools();

      console.log("Available MCP tools:");
      tools.forEach((tool) => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    });

  // Research command
  program
    .command("research")
    .description("Research a topic")
    .argument("<topic>", "Topic to research")
    .option("-d, --depth <depth>", "Research depth (shallow, medium, deep)", "medium")
    .option("-s, --sources <sources>", "Number of sources", "3")
    .action(async (topic: string, options: ResearchOptions) => {
      logger.info(`Researching: ${topic}`);

      const browserEngine = new BrowserEngine();
      const memory = new SemanticMemory({
        vectorPath: "./data/vectors",
        sqlitePath: "./data/memory.db"
      });
      const llmManager = new LLMManager({
        defaultProvider: "openai",
        providers: {}
      });

      await memory.initialize();
      await browserEngine.launch();

      const mcpServer = new MCPServer(browserEngine, memory, llmManager);
      const result = await mcpServer.executeTool("research_web", {
        query: topic,
        sources: parseInt(options.sources),
        depth: options.depth
      });

      console.log("Research results:", JSON.stringify(result, null, 2));

      await browserEngine.close();
      memory.close();
    });

  // Analyze command
  program
    .command("analyze")
    .description("Analyze content using AI")
    .argument("<content>", "Content to analyze")
    .option("-t, --task <task>", "Analysis task", "summarize")
    .option("-m, --model <model>", "AI model to use")
    .action(async (content: string, options: AnalyzeOptions) => {
      logger.info("Analyzing content...");

      const llmManager = new LLMManager({
        defaultProvider: "openai",
        providers: {}
      });

      const result = await llmManager.analyze(content, options.task, {
        model: options.model
      });

      console.log("Analysis result:", result);
    });

  return program;
}

export async function runCLI(): Promise<void> {
  const program = createCLI();
  await program.parseAsync(process.argv);
}
