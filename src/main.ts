import 'dotenv/config';
import { APIServer } from './api/server';
import { LLMManager } from './ai/llmManager';
import { SemanticMemory } from './memory/semanticMemory';
import { BrowserEngine } from './browser/engine';
import { AgentManager } from './agents/agentManager';
import { ModelRouter } from './models/modelRouter';
import { TaskOrchestrator } from './tasks/taskOrchestrator';
import { ChatManager } from './chat/chatManager';
import { ComputerUseOrchestrator } from './computer-use/orchestrator';
import { AutonomousDigitalOperator, OPERATOR_CONFIGS } from './computer-use/digitalOperator';
import { Logger } from './utils/logger';
import { SQLiteStore } from './memory/sqliteStore';
// ── NEW: Phase 1 Systems ──────────────────────────────────────────────────────
import { AgentRuntime } from './agents/agentRuntime';
import { createDefaultToolRegistry } from './skills/toolRegistry';
import { HeartbeatSystem } from './agents/heartbeat';
import { CronScheduler } from './tasks/cronScheduler';
import { UsageTracker } from './utils/usageTracker';
import { initMarketingPlugin } from './plugins/marketing';

interface AppConfig {
  server: {
    host: string;
    port: number;
    corsOrigins: string[];
  };
  memory: {
    vectorPath: string;
    sqlitePath: string;
  };
  llm: {
    defaultProvider: string;
    providers: Record<string, any>;
  };
  browser: {
    headless: boolean;
    defaultBrowser: 'chromium' | 'firefox' | 'webkit';
    viewport: { width: number; height: number };
    humanLike: boolean;
    speedMultiplier: number;
    timeout: number;
    slowMo: number;
  };
}

function validateConfig(config: AppConfig): void {
  if (!config.server.host) throw new Error('HOST is required');
  if (isNaN(config.server.port) || config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be a valid number between 1 and 65535');
  }
  if (!config.memory.vectorPath) throw new Error('VECTOR_PATH is required');
  if (!config.memory.sqlitePath) throw new Error('SQLITE_PATH is required');

  const validProviders = ['openai', 'anthropic', 'local'];
  if (!validProviders.includes(config.llm.defaultProvider)) {
    throw new Error(`DEFAULT_LLM_PROVIDER must be one of: ${validProviders.join(', ')}`);
  }

  const validBrowsers = ['chromium', 'firefox', 'webkit'];
  if (!validBrowsers.includes(config.browser.defaultBrowser)) {
    throw new Error(`BROWSER_TYPE must be one of: ${validBrowsers.join(', ')}`);
  }

  if (config.browser.viewport.width < 800 || config.browser.viewport.height < 600) {
    throw new Error('Browser viewport dimensions too small (min 800x600)');
  }

  if (config.browser.speedMultiplier <= 0) {
    throw new Error('BROWSER_SPEED_MULTIPLIER must be positive');
  }

  if (config.browser.timeout < 1000) {
    throw new Error('BROWSER_TIMEOUT must be at least 1000ms');
  }
}

function loadConfig(): AppConfig {
  const config: AppConfig = {
    server: {
      host: process.env.HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8000'),
      corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:8000').split(',')
    },
    memory: {
      vectorPath: process.env.VECTOR_PATH || './data/memory/vectors',
      sqlitePath: process.env.SQLITE_PATH || './data/memory/structured.db'
    },
    llm: {
      defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 'openai',
      providers: {
        openai: {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-4'
        },
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
        },
        local: {
          baseUrl: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434',
          model: process.env.LOCAL_LLM_MODEL || 'llama2'
        }
      }
    },
    browser: {
      headless: process.env.BROWSER_HEADLESS === 'true',
      defaultBrowser: (process.env.BROWSER_TYPE as 'chromium' | 'firefox' | 'webkit') || 'chromium',
      viewport: {
        width: parseInt(process.env.BROWSER_WIDTH || '1920'),
        height: parseInt(process.env.BROWSER_HEIGHT || '1080')
      },
      humanLike: process.env.BROWSER_HUMAN_LIKE !== 'false',
      speedMultiplier: parseFloat(process.env.BROWSER_SPEED_MULTIPLIER || '1.0'),
      timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000'),
      slowMo: parseInt(process.env.BROWSER_SLOW_MO || '50')
    }
  };

  validateConfig(config);
  return config;
}

async function main() {
  const logger = new Logger('Main');

  try {
    const config = loadConfig();
    logger.info('Starting OpenBro247...');

    // Initialize components with error handling
    let llmManager: LLMManager;
    let memory: SemanticMemory;
    let browserEngine: BrowserEngine;
    let sqliteStore: SQLiteStore;
    let agentManager: AgentManager;
    let modelRouter: ModelRouter;
    let taskOrchestrator: TaskOrchestrator;
    let chatManager: ChatManager;
    let computerOrchestrator: ComputerUseOrchestrator;
    let digitalOperators: Map<string, AutonomousDigitalOperator>;
    let apiServer: APIServer;

    try {
      llmManager = new LLMManager({
        defaultProvider: config.llm.defaultProvider,
        providers: config.llm.providers
      });
      logger.info('LLM Manager initialized');
    } catch (error) {
      throw new Error(`Failed to initialize LLM Manager: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      memory = new SemanticMemory({
        vectorPath: config.memory.vectorPath,
        sqlitePath: config.memory.sqlitePath
      });
      await memory.initialize();
      logger.info('Memory system initialized');
    } catch (error) {
      throw new Error(`Failed to initialize memory system: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      browserEngine = new BrowserEngine({
        headless: config.browser.headless,
        defaultBrowser: config.browser.defaultBrowser,
        viewport: config.browser.viewport,
        humanLike: config.browser.humanLike,
        speedMultiplier: config.browser.speedMultiplier,
        timeout: config.browser.timeout,
        slowMo: config.browser.slowMo
      });
      logger.info('Browser engine initialized');
    } catch (error) {
      throw new Error(`Failed to initialize browser engine: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Get SQLiteStore from semantic memory for other components
    sqliteStore = memory.getSqliteStore();

    try {
      agentManager = new AgentManager(sqliteStore);
      await agentManager.initialize();
      logger.info('Agent manager initialized');
    } catch (error) {
      throw new Error(`Failed to initialize agent manager: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      modelRouter = new ModelRouter();
      logger.info('Model router initialized');
    } catch (error) {
      throw new Error(`Failed to initialize model router: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      taskOrchestrator = new TaskOrchestrator(sqliteStore);
      logger.info('Task orchestrator initialized');
    } catch (error) {
      throw new Error(`Failed to initialize task orchestrator: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      chatManager = new ChatManager(sqliteStore, modelRouter, agentManager);
      await chatManager.initialize();
      logger.info('Chat manager initialized');
    } catch (error) {
      throw new Error(`Failed to initialize chat manager: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      computerOrchestrator = new ComputerUseOrchestrator(browserEngine, modelRouter);
      await computerOrchestrator.initialize();
      logger.info('Computer use orchestrator initialized');
    } catch (error) {
      throw new Error(`Failed to initialize computer use orchestrator: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Initialize autonomous digital operators
    digitalOperators = new Map<string, AutonomousDigitalOperator>();
    for (const [key, operatorConfig] of Object.entries(OPERATOR_CONFIGS)) {
      try {
        const operator = new AutonomousDigitalOperator(operatorConfig, modelRouter, browserEngine);
        await operator.initialize();
        await operator.start();
        digitalOperators.set(key, operator);
        logger.info(`Initialized digital operator: ${operatorConfig.name} (${operatorConfig.role})`);
      } catch (error) {
        logger.error(`Failed to initialize digital operator ${key}`, error);
        // Continue with other operators
      }
    }

    try {
      apiServer = new APIServer(
        config.server,
        llmManager,
        memory,
        browserEngine,
        agentManager,
        modelRouter,
        taskOrchestrator,
        chatManager,
        computerOrchestrator,
        digitalOperators
      );
      logger.info('API server initialized');
    } catch (error) {
      throw new Error(`Failed to initialize API server: ${error instanceof Error ? error.message : String(error)}`);
    }

    // ── Phase 1: Initialize Agent Runtime (ReAct loop) ────────────────────────
    let agentRuntime: AgentRuntime;
    let heartbeatSystem: HeartbeatSystem;
    let cronScheduler: CronScheduler;
    let usageTracker: UsageTracker;

    try {
      // Tool registry with all built-in tools
      const toolRegistry = createDefaultToolRegistry(browserEngine);
      logger.info(`Tool registry initialized with ${toolRegistry.listTools().length} tools`);

      // Agent runtime — the ReAct execution loop
      agentRuntime = new AgentRuntime(
        llmManager,
        memory,
        browserEngine,
        sqliteStore,
        toolRegistry
      );
      logger.info('Agent runtime initialized');

      // Usage tracker — tracks all LLM token usage
      usageTracker = new UsageTracker(sqliteStore);
      logger.info('Usage tracker initialized');

      // Cron scheduler with agent runtime as the job runner
      cronScheduler = new CronScheduler(sqliteStore);
      cronScheduler.setJobRunner(async (job) => {
        const mainAgent = await agentManager.getMainAgent();
        if (!mainAgent) return `No main agent found for job: ${job.name}`;
        const result = await agentRuntime.execute(mainAgent, job.command, { maxIterations: 8 });
        return result.finalAnswer ?? result.status;
      });
      await cronScheduler.initialize();
      logger.info('Cron scheduler initialized');

      // Heartbeat system — 24/7 continuous learning
      heartbeatSystem = new HeartbeatSystem(
        memory,
        agentManager,
        agentRuntime,
        llmManager,
        {
          heartbeatInterval: 60,       // 1 min pings
          learningInterval: 300,       // 5 min learning cycles
          browsingInterval: 900,       // 15 min browsing
          enableAutoBrowsing: false,   // disabled by default, enable via env
        }
      );
      heartbeatSystem.start();
      logger.info('Heartbeat system started (learning cycle every 5 min)');

      // ── Marketing Plugin ────────────────────────────────────────────────────
      try {
        await initMarketingPlugin({
          fastify: apiServer.getApp(),
          llm: llmManager,
          memory,
          cronScheduler,
        });
      } catch (marketingError) {
        logger.warn(`Marketing plugin failed to init: ${marketingError instanceof Error ? marketingError.message : String(marketingError)}`);
      }

    } catch (error) {
      logger.warn(`Phase 1 systems partially failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn('Agent runtime, heartbeat, and cron will be unavailable');
    }

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        if (apiServer) await apiServer.stop();
        if (memory) memory.close();
        if (browserEngine) await browserEngine.close();

        // Stop digital operators
        for (const operator of digitalOperators.values()) {
          try {
            await operator.stop();
          } catch (error) {
            logger.error('Error stopping digital operator', error);
          }
        }

        logger.info('Shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      shutdown('unhandledRejection');
    });

    // Start the server
    await apiServer.start();
    logger.info(`OpenBro247 started successfully on ${config.server.host}:${config.server.port}`);

  } catch (error) {
    console.error('Failed to start OpenBro247:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main, loadConfig };