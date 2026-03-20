import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { Logger } from '../utils/logger';
import { LLMManager } from '../ai/llmManager';
import { SemanticMemory } from '../memory/semanticMemory';
import { BrowserEngine } from '../browser/engine';
import { AgentManager } from '../agents/agentManager';
import { ModelRouter } from '../models/modelRouter';
import { TaskOrchestrator } from '../tasks/taskOrchestrator';
import { ChatManager } from '../chat/chatManager';
import { ComputerUseOrchestrator } from '../computer-use/orchestrator';
import { AutonomousDigitalOperator } from '../computer-use/digitalOperator';
import { WebSocketEventManager } from './websocket/events';
import { desktopRoutes } from './routes/desktop';
import { identityRoutes } from './routes/identity';
import { SkillRegistry } from '../skills/skillRegistry';
import { SkillExecutor } from '../skills/skillExecutor';

interface ServerConfig {
  host: string;
  port: number;
  corsOrigins: string[];
}

export class APIServer {
  private fastify: FastifyInstance;
  private config: ServerConfig;
  private logger: Logger;
  private llmManager: LLMManager;
  private memory: SemanticMemory;
  private browserEngine: BrowserEngine;
  private agentManager: AgentManager;
  private modelRouter: ModelRouter;
  private taskOrchestrator: TaskOrchestrator;
  private chatManager: ChatManager;
  private computerOrchestrator: ComputerUseOrchestrator;
  private digitalOperators: Map<string, AutonomousDigitalOperator>;
  private wsEventManager: WebSocketEventManager;
  private skillRegistry: SkillRegistry;
  private skillExecutor: SkillExecutor;
  // Phase 1 systems (optional, injected after construction)
  private agentRuntime?: any; // AgentRuntime — avoiding circular import
  private cronScheduler?: any; // CronScheduler
  private usageTracker?: any;  // UsageTracker

  constructor(
    config: ServerConfig,
    llmManager: LLMManager,
    memory: SemanticMemory,
    browserEngine: BrowserEngine,
    agentManager: AgentManager,
    modelRouter: ModelRouter,
    taskOrchestrator: TaskOrchestrator,
    chatManager: ChatManager,
    computerOrchestrator: ComputerUseOrchestrator,
    digitalOperators: Map<string, AutonomousDigitalOperator>
  ) {
    this.config = config;
    this.logger = new Logger('APIServer');
    this.llmManager = llmManager;
    this.memory = memory;
    this.browserEngine = browserEngine;
    this.agentManager = agentManager;
    this.modelRouter = modelRouter;
    this.taskOrchestrator = taskOrchestrator;
    this.chatManager = chatManager;
    this.computerOrchestrator = computerOrchestrator;
    this.digitalOperators = digitalOperators;

    // Initialize Skill Engine
    this.skillRegistry = new SkillRegistry(this.browserEngine);
    this.skillExecutor = new SkillExecutor(this.skillRegistry);
    this.registerDefaultSkills();

    this.fastify = Fastify({
      logger: false // We'll use our own logger
    });

    this.wsEventManager = new WebSocketEventManager(this.fastify);

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Inject Phase 1 systems after construction to avoid circular dependencies
   */
  setRuntime(runtime: any, cronScheduler: any, usageTracker: any): void {
    this.agentRuntime = runtime;
    this.cronScheduler = cronScheduler;
    this.usageTracker = usageTracker;
    this.logger.info('Phase 1 runtime systems injected into API server');
  }

  /** Exposes the Fastify instance so plugins can register routes before server start. */
  getApp(): FastifyInstance {
    return this.fastify;
  }

  private setupMiddleware(): void {
    // CORS
    this.fastify.register(fastifyCors, {
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    });

    // WebSocket support
    this.fastify.register(fastifyWebsocket);
  }

  private setupRoutes(): void {
    // Command processing
    this.fastify.post('/api/command', this.handleCommand.bind(this));

    // Browser operations
    this.fastify.post('/api/browse', this.handleBrowse.bind(this));

    // Browser relay operations (for Mission Control integration)
    this.fastify.get('/api/browser/relay', this.handleBrowserRelayGet.bind(this));
    this.fastify.post('/api/browser/relay', this.handleBrowserRelayPost.bind(this));
    this.fastify.get('/api/browser/sessions', this.handleBrowserSessions.bind(this));

    // Additional browser endpoints expected by Mission Control
    this.fastify.get('/browser/status', this.handleBrowserStatus.bind(this));
    this.fastify.get('/browser/profiles', this.handleBrowserProfiles.bind(this));
    this.fastify.get('/browser/tabs', this.handleBrowserTabs.bind(this));
    this.fastify.post('/browser/start', this.handleBrowserStart.bind(this));
    this.fastify.post('/browser/stop', this.handleBrowserStop.bind(this));
    this.fastify.get('/browser/snapshot', this.handleBrowserSnapshot.bind(this));
    this.fastify.post('/screenshot', this.handleBrowserScreenshot.bind(this));

    // Research operations
    this.fastify.post('/api/research', this.handleResearch.bind(this));

    // Memory operations
    this.fastify.post('/api/memory/store', this.handleStoreMemory.bind(this));
    this.fastify.get('/api/memory/search', this.handleSearchMemories.bind(this));
    this.fastify.get('/api/memory/stats', this.handleMemoryStats.bind(this));

    // Skills operations
    this.fastify.post('/api/skills/store', this.handleStoreSkill.bind(this));
    this.fastify.get('/api/skills/search', this.handleSearchSkills.bind(this));
    this.fastify.post('/api/skills/execute', this.handleExecuteSkill.bind(this));

    // Agent operations
    this.fastify.post('/api/agents/spawn', this.handleSpawnAgent.bind(this));
    this.fastify.post('/api/agents/spawn-multiple', this.handleSpawnMultipleAgents.bind(this));
    this.fastify.get('/api/agents/status', this.handleAgentStatus.bind(this));

    // New agent management endpoints
    this.fastify.post('/api/agents', this.handleCreateAgent.bind(this));
    this.fastify.get('/api/agents', this.handleListAgents.bind(this));
    this.fastify.get('/api/agents/executions', this.handleListExecutions.bind(this));
    this.fastify.get('/api/agents/:id', this.handleGetAgent.bind(this));
    this.fastify.put('/api/agents/:id', this.handleUpdateAgent.bind(this));
    this.fastify.delete('/api/agents/:id', this.handleDeleteAgent.bind(this));
    this.fastify.put('/api/agents/:id/model', this.handleSetAgentModel.bind(this));
    // ★ THE KEY NEW ENDPOINT: actually run an agent
    this.fastify.post('/api/agents/:id/execute', this.handleExecuteAgent.bind(this));

    // Cron job endpoints
    this.fastify.post('/api/cron', this.handleCreateCronJob.bind(this));
    this.fastify.get('/api/cron', this.handleListCronJobs.bind(this));
    this.fastify.post('/api/cron/:id/pause', this.handlePauseCronJob.bind(this));
    this.fastify.post('/api/cron/:id/resume', this.handleResumeCronJob.bind(this));
    this.fastify.post('/api/cron/:id/trigger', this.handleTriggerCronJob.bind(this));
    this.fastify.delete('/api/cron/:id', this.handleDeleteCronJob.bind(this));
    this.fastify.get('/api/cron/:id/history', this.handleCronJobHistory.bind(this));

    // Usage & cost tracking
    this.fastify.get('/api/usage', this.handleGetUsage.bind(this));
    this.fastify.get('/api/usage/entries', this.handleGetUsageEntries.bind(this));

    // Health check
    this.fastify.get('/health', this.handleHealthCheck.bind(this));

    // Task management endpoints
    this.fastify.post('/api/tasks', this.handleCreateTask.bind(this));
    this.fastify.get('/api/tasks', this.handleListTasks.bind(this));
    this.fastify.get('/api/tasks/:id', this.handleGetTask.bind(this));
    this.fastify.put('/api/tasks/:id', this.handleUpdateTask.bind(this));
    this.fastify.delete('/api/tasks/:id', this.handleDeleteTask.bind(this));
    this.fastify.post('/api/tasks/:id/assign', this.handleAssignTask.bind(this));

    // Model endpoints
    this.fastify.get('/api/models', this.handleListModels.bind(this));
    this.fastify.post('/api/models/validate', this.handleValidateModel.bind(this));

    // Chat endpoints
    this.fastify.post('/api/chat/sessions', this.handleCreateChatSession.bind(this));
    this.fastify.get('/api/chat/sessions', this.handleListChatSessions.bind(this));
    this.fastify.get('/api/chat/sessions/:id', this.handleGetChatSession.bind(this));
    this.fastify.post('/api/chat/sessions/:id/messages', this.handleSendChatMessage.bind(this));
    this.fastify.delete('/api/chat/sessions/:id', this.handleDeleteChatSession.bind(this));

    // Computer use endpoints
    this.fastify.get('/api/computer/context', this.handleGetComputerContext.bind(this));
    this.fastify.post('/api/computer/operation', this.handleExecuteOperation.bind(this));
    this.fastify.post('/api/computer/task', this.handleExecuteComputerTask.bind(this));
    this.fastify.post('/api/computer/command', this.handleProcessNaturalCommand.bind(this));
    this.fastify.get('/api/computer/operators', this.handleListDigitalOperators.bind(this));
    this.fastify.get('/api/computer/operators/:name/status', this.handleGetOperatorStatus.bind(this));
    this.fastify.get('/api/computer/screenshot', this.handleGetScreenshot.bind(this));

    // Heartbeat operations
    this.fastify.get('/api/heartbeat/status', this.handleHeartbeatStatus.bind(this));
    this.fastify.post('/api/heartbeat/trigger-learning', this.handleTriggerLearning.bind(this));
    this.fastify.post('/api/heartbeat/trigger-browsing', this.handleTriggerBrowsing.bind(this));

    // Desktop automation routes (Windows control, VS Code, screen capture, vision)
    this.fastify.register(desktopRoutes);

    // Identity routes (device identity, tokens, pairing)
    this.fastify.register(identityRoutes);

    // WebSocket for real-time communication
    this.fastify.register(async (fastify) => {
      fastify.get('/ws', { websocket: true }, this.handleWebSocket.bind(this));
    });
  }

  private async handleCommand(
    request: FastifyRequest<{ Body: { command: string; context?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { command, context } = request.body;

      this.logger.info(`Processing command: ${command}`);

      // Generate action plan using LLM
      const systemMessage = `You are an AI agent that can browse the web, search for information, and execute tasks.
You have access to browser automation, memory storage, and various tools.
Analyze the user's command and break it down into actionable steps.`;

      const response = await this.llmManager.generate(command, {
        systemMessage,
        temperature: 0.3,
        maxTokens: 1000
      });

      // Store command in memory
      await this.memory.storeMemory(
        `Command: ${command}`,
        'command',
        { response: response.content, context }
      );

      reply.send({
        success: true,
        command,
        response: response.content,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error processing command', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowse(
    request: FastifyRequest<{ Body: { url: string; action?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { url, action } = request.body;

      this.logger.info(`Browsing to: ${url}`);

      // Launch browser if not already launched
      if (!this.browserEngine.isLaunched()) {
        await this.browserEngine.launch();
      }

      await this.browserEngine.navigate(url);

      const title = await this.browserEngine.getTitle();
      const currentUrl = await this.browserEngine.getCurrentUrl();

      // Store browsing action in memory
      await this.memory.storeMemory(
        `Browsed to ${url}`,
        'browsing',
        { title, finalUrl: currentUrl }
      );

      reply.send({
        success: true,
        url: currentUrl,
        title,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error browsing', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleResearch(
    request: FastifyRequest<{ Body: { topic: string; depth?: number } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { topic, depth = 3 } = request.body;

      this.logger.info(`Researching topic: ${topic}`);

      // Generate research plan
      const researchPrompt = `Research the topic: ${topic}
Provide a comprehensive analysis with key facts, sources, and insights.
Structure your response with clear sections and citations.`;

      const response = await this.llmManager.generate(researchPrompt, {
        temperature: 0.2,
        maxTokens: 2000
      });

      // Store research report
      const reportId = await this.memory.storeResearchReport(
        topic,
        response.content,
        [`Generated research on ${topic}`],
        { depth, generated: true }
      );

      reply.send({
        success: true,
        topic,
        content: response.content,
        reportId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error researching topic', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleStoreMemory(
    request: FastifyRequest<{ Body: { content: string; type: string; metadata?: any; importance?: number } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { content, type, metadata, importance = 0.5 } = request.body;

      const memoryId = await this.memory.storeMemory(content, type, metadata, importance);

      reply.send({
        success: true,
        memoryId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error storing memory', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleSearchMemories(
    request: FastifyRequest<{ Querystring: { q: string; limit?: string; type?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { q, limit = '5', type } = request.query;

      const memories = await this.memory.recall(q, parseInt(limit), type);

      reply.send({
        success: true,
        query: q,
        results: memories,
        count: memories.length
      });
    } catch (error) {
      this.logger.error('Error searching memories', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleMemoryStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const stats = await this.memory.getStats();

      reply.send({
        success: true,
        stats
      });
    } catch (error) {
      this.logger.error('Error getting memory stats', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleStoreSkill(
    request: FastifyRequest<{ Body: { name: string; description: string; content: string; type: string; confidence?: number; metadata?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { name, description, content, type, confidence = 0.5, metadata } = request.body;

      const skillId = await this.memory.storeSkill(name, description, content, type, confidence, metadata);

      reply.send({
        success: true,
        skillId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error storing skill', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleSearchSkills(
    request: FastifyRequest<{ Querystring: { q: string; limit?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { q, limit = '5' } = request.query;

      const skills = await this.memory.searchSkills(q, parseInt(limit));

      reply.send({
        success: true,
        query: q,
        results: skills,
        count: skills.length
      });
    } catch (error) {
      this.logger.error('Error searching skills', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleSpawnAgent(
    request: FastifyRequest<{ Body: { type: string; task: string; config?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { type, task, config } = request.body;

      this.logger.info(`Spawning agent: ${type} for task: ${task}`);

      // For now, just store the agent task
      const taskId = await this.memory.storeAgentTask(
        type,
        task,
        'pending',
        undefined,
        undefined,
        config
      );

      reply.send({
        success: true,
        agentType: type,
        task,
        taskId,
        status: 'pending',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error spawning agent', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleSpawnMultipleAgents(
    request: FastifyRequest<{ Body: { agents: Array<{ type: string; task: string; config?: any }> } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { agents } = request.body;

      this.logger.info(`Spawning ${agents.length} agents`);

      const results = [];
      for (const agent of agents) {
        const taskId = await this.memory.storeAgentTask(
          agent.type,
          agent.task,
          'pending',
          undefined,
          undefined,
          agent.config
        );

        results.push({
          agentType: agent.type,
          task: agent.task,
          taskId,
          status: 'pending'
        });
      }

      reply.send({
        success: true,
        agents: results,
        count: results.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error spawning multiple agents', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleAgentStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // For now, return mock status - in full implementation this would track actual agent status
      reply.send({
        success: true,
        agents: [],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting agent status', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleHeartbeatStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // For now, return mock heartbeat status
      reply.send({
        success: true,
        status: 'active',
        lastActivity: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting heartbeat status', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleTriggerLearning(
    request: FastifyRequest<{ Body: { topic?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { topic } = request.body;

      this.logger.info(`Triggering learning${topic ? ` for topic: ${topic}` : ''}`);

      // Store learning trigger
      await this.memory.storeHeartbeat(
        'learning_trigger',
        'triggered',
        { topic, timestamp: new Date().toISOString() }
      );

      reply.send({
        success: true,
        action: 'learning_triggered',
        topic,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error triggering learning', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleTriggerBrowsing(
    request: FastifyRequest<{ Body: { url?: string; strategy?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { url, strategy = 'random' } = request.body;

      this.logger.info(`Triggering browsing${url ? ` to: ${url}` : ' (random)'}`);

      // Store browsing trigger
      await this.memory.storeHeartbeat(
        'browsing_trigger',
        'triggered',
        { url, strategy, timestamp: new Date().toISOString() }
      );

      reply.send({
        success: true,
        action: 'browsing_triggered',
        url,
        strategy,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error triggering browsing', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Agent management handlers
  private async handleCreateAgent(
    request: FastifyRequest<{ Body: { name: string; type: string; modelConfig: any; capabilities: string[]; parentAgentId?: string; metadata?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { name, type, modelConfig, capabilities, parentAgentId, metadata } = request.body;

      this.logger.info(`Creating agent: ${name}`);

      const agent = await this.agentManager.createAgent({
        name,
        type: type as any,
        modelConfig,
        capabilities,
        parentAgentId,
        metadata
      });

      this.wsEventManager.broadcast({
        type: 'agent:created',
        data: agent,
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        agent,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error creating agent', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleListAgents(
    request: FastifyRequest<{ Querystring: { type?: string; status?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { type, status } = request.query;

      const agents = await this.agentManager.listAgents({
        type: type as any,
        status: status as any
      });

      reply.send({
        success: true,
        agents,
        count: agents.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error listing agents', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleGetAgent(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;

      const agent = await this.agentManager.getAgent(id);

      if (!agent) {
        reply.code(404).send({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      reply.send({
        success: true,
        agent,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting agent', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleUpdateAgent(
    request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; status?: string; capabilities?: string[]; metadata?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const updates = request.body;

      const agent = await this.agentManager.updateAgent(id, updates as any);

      this.wsEventManager.broadcast({
        type: 'agent:updated',
        data: agent,
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        agent,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error updating agent', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleDeleteAgent(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;

      await this.agentManager.deleteAgent(id);

      this.wsEventManager.broadcast({
        type: 'agent:deleted',
        data: { id },
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error deleting agent', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleSetAgentModel(
    request: FastifyRequest<{ Params: { id: string }; Body: { provider: string; modelId: string; parameters: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const modelConfig = request.body;

      const agent = await this.agentManager.setAgentModel(id, modelConfig);

      this.wsEventManager.broadcast({
        type: 'agent:updated',
        data: agent,
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        agent,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error setting agent model', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Task management handlers
  private async handleCreateTask(
    request: FastifyRequest<{ Body: { agentId: string; description: string; priority?: string; metadata?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { agentId, description, priority, metadata } = request.body;

      const task = await this.taskOrchestrator.createTask({
        agentId,
        description,
        priority: priority as any,
        metadata
      });

      this.wsEventManager.broadcast({
        type: 'task:created',
        data: task,
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error creating task', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleListTasks(
    request: FastifyRequest<{ Querystring: { agentId?: string; status?: string; priority?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { agentId, status, priority } = request.query;

      const tasks = await this.taskOrchestrator.listTasks({
        agentId,
        status: status as any,
        priority: priority as any
      });

      reply.send({
        success: true,
        tasks,
        count: tasks.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error listing tasks', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleGetTask(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;

      const task = await this.taskOrchestrator.getTask(id);

      if (!task) {
        reply.code(404).send({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      reply.send({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting task', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleUpdateTask(
    request: FastifyRequest<{ Params: { id: string }; Body: { status?: string; result?: any; error?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const { status, result, error } = request.body;

      const task = await this.taskOrchestrator.updateTaskStatus(id, status as any, result, error);

      this.wsEventManager.broadcast({
        type: 'task:updated',
        data: task,
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error updating task', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleDeleteTask(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;

      await this.taskOrchestrator.deleteTask(id);

      this.wsEventManager.broadcast({
        type: 'task:deleted',
        data: { id },
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error deleting task', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleAssignTask(
    request: FastifyRequest<{ Params: { id: string }; Body: { agentId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const { agentId } = request.body;

      const task = await this.taskOrchestrator.assignTaskToAgent(id, agentId);

      this.wsEventManager.broadcast({
        type: 'task:updated',
        data: task,
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error assigning task', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Model handlers
  private async handleListModels(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const models = await this.modelRouter.listAvailableModels();

      reply.send({
        success: true,
        models,
        count: models.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error listing models', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleValidateModel(
    request: FastifyRequest<{ Body: { provider: string; modelId: string; parameters: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const modelConfig = request.body;

      const result = await this.modelRouter.validateModel(modelConfig);

      reply.send({
        success: true,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error validating model', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Chat handlers
  private async handleCreateChatSession(
    request: FastifyRequest<{ Body: { agentId: string; metadata?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { agentId, metadata } = request.body;

      const session = await this.chatManager.createSession({ agentId, metadata });

      reply.send({
        success: true,
        session,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error creating chat session', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleListChatSessions(
    request: FastifyRequest<{ Querystring: { agentId?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { agentId } = request.query;

      const sessions = await this.chatManager.listSessions(agentId);

      reply.send({
        success: true,
        sessions,
        count: sessions.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error listing chat sessions', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleGetChatSession(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;

      const session = await this.chatManager.getSession(id);

      if (!session) {
        reply.code(404).send({
          success: false,
          error: 'Session not found'
        });
        return;
      }

      reply.send({
        success: true,
        session,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting chat session', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleSendChatMessage(
    request: FastifyRequest<{ Params: { id: string }; Body: { content: string; metadata?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const { content, metadata } = request.body;

      const message = await this.chatManager.sendMessage(id, content, metadata);

      this.wsEventManager.broadcast({
        type: 'chat:message',
        data: message,
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error sending chat message', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleDeleteChatSession(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;

      await this.chatManager.deleteSession(id);

      reply.send({
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error deleting chat session', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Browser relay handlers (for Mission Control integration)
  private async handleBrowserRelayGet(
    request: FastifyRequest<{ Querystring: { profile?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { profile } = request.query;

      this.logger.info(`Getting browser relay status for profile: ${profile || 'default'}`);

      // Get browser relay snapshot
      const snapshot = await this.getBrowserRelaySnapshot(profile);

      reply.send({
        ok: true,
        profile: profile || snapshot.status?.profile || null,
        snapshot,
        docsUrl: 'https://docs.openclaw.ai/tools/browser'
      });
    } catch (error) {
      this.logger.error('Error getting browser relay status', error);
      reply.code(500).send({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowserRelayPost(
    request: FastifyRequest<{ Body: { action: string; profile?: string; [key: string]: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { action, profile, ...payload } = request.body;

      this.logger.info(`Browser relay action: ${action} for profile: ${profile || 'default'}`);

      const result = await this.performBrowserRelayAction(action, profile, payload);

      // Get updated snapshot
      const snapshot = await this.getBrowserRelaySnapshot(profile);

      reply.send({
        ok: true,
        action,
        result,
        snapshot
      });
    } catch (error) {
      this.logger.error(`Error performing browser relay action: ${request.body.action}`, error);
      reply.code(500).send({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getBrowserRelaySnapshot(profile?: string): Promise<any> {
    try {
      // Check if browser is launched and get status
      const isLaunched = this.browserEngine.isLaunched();
      const currentUrl = isLaunched ? await this.browserEngine.getCurrentUrl() : null;
      const title = isLaunched ? await this.browserEngine.getTitle() : null;

      // Get default profiles
      const profiles = [
        {
          name: 'chrome',
          cdpPort: null,
          cdpUrl: null,
          color: '#4285f4',
          running: isLaunched,
          tabCount: isLaunched ? 1 : 0,
          isDefault: true,
          isRemote: false
        }
      ];

      // Get tabs info
      const tabs = isLaunched ? [{
        targetId: 'page-1',
        title: title || 'Browser Page',
        url: currentUrl || '',
        id: 'page-1'
      }] : [];

      // Extension status (not applicable for our implementation)
      const extension = {
        path: null,
        resolvedPath: null,
        manifestPath: null,
        installed: false,
        manifestName: null,
        manifestVersion: null,
        error: 'Extension mode not supported in OpenBro247'
      };

      // Health status
      const health = {
        installed: false, // extension not installed
        running: isLaunched,
        cdpReady: isLaunched,
        tabConnected: isLaunched,
        relayReady: isLaunched
      };

      return {
        status: {
          enabled: true,
          profile: profile || 'chrome',
          running: isLaunched,
          cdpReady: isLaunched,
          cdpHttp: false,
          cdpPort: null,
          cdpUrl: null,
          detectedBrowser: isLaunched ? 'chromium' : null,
          detectedExecutablePath: null,
          chosenBrowser: 'chromium',
          userDataDir: null,
          detectError: null,
          attachOnly: false,
          headless: false,
          color: '#4285f4'
        },
        profiles,
        tabs,
        extension,
        health,
        errors: {
          status: null,
          profiles: null,
          tabs: null
        }
      };
    } catch (error) {
      this.logger.error('Error getting browser relay snapshot', error);
      return {
        status: null,
        profiles: [],
        tabs: [],
        extension: {
          path: null,
          resolvedPath: null,
          manifestPath: null,
          installed: false,
          manifestName: null,
          manifestVersion: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        health: {
          installed: false,
          running: false,
          cdpReady: false,
          tabConnected: false,
          relayReady: false
        },
        errors: {
          status: error instanceof Error ? error.message : 'Unknown error',
          profiles: null,
          tabs: null
        }
      };
    }
  }

  private async performBrowserRelayAction(action: string, profile?: string, payload: any = {}): Promise<any> {
    switch (action) {
      case 'install-extension':
        return { message: 'Extension installation not supported in OpenBro247. Use managed browser mode.' };

      case 'start':
        if (!this.browserEngine.isLaunched()) {
          await this.browserEngine.launch();
        }
        return { message: 'Browser started successfully' };

      case 'stop':
        if (this.browserEngine.isLaunched()) {
          await this.browserEngine.close();
        }
        return { message: 'Browser stopped successfully' };

      case 'restart':
        if (this.browserEngine.isLaunched()) {
          await this.browserEngine.close();
        }
        await this.browserEngine.launch();
        return { message: 'Browser restarted successfully' };

      case 'open-test-tab':
        if (!this.browserEngine.isLaunched()) {
          await this.browserEngine.launch();
        }
        const url = payload.url || 'https://example.com';
        await this.browserEngine.navigate(url);
        return { message: `Opened test tab: ${url}` };

      case 'snapshot-test':
        if (!this.browserEngine.isLaunched()) {
          throw new Error('Browser not running');
        }
        const currentUrl = await this.browserEngine.getCurrentUrl();
        const title = await this.browserEngine.getTitle();
        return {
          message: 'Browser connection test successful',
          url: currentUrl,
          title
        };

      case 'screenshot':
        if (!this.browserEngine.isLaunched()) {
          throw new Error('Browser not running');
        }
        const screenshot = await this.browserEngine.takeScreenshot();
        return {
          message: 'Screenshot captured',
          image: screenshot
        };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async handleBrowserSessions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      this.logger.info('Getting browser sessions');

      // For now, return mock browser session data that matches Mission Control expectations
      const mockSessions = [
        {
          id: "session-1",
          agentId: "main",
          url: this.browserEngine.isLaunched() ? await this.browserEngine.getCurrentUrl() : "https://example.com",
          startTime: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          endTime: null,
          status: this.browserEngine.isLaunched() ? "active" : "completed",
          actions: this.browserEngine.isLaunched() ? [
            {
              type: "navigate",
              target: this.browserEngine.isLaunched() ? await this.browserEngine.getCurrentUrl() : "https://example.com",
              timestamp: Date.now() - 2 * 60 * 60 * 1000,
              success: true,
              mcpPrecision: 95,
              playwrightPrecision: 98,
              duration: 1200
            },
            {
              type: "scroll",
              timestamp: Date.now() - 2 * 60 * 60 * 1000 + 30000,
              success: true,
              mcpPrecision: 88,
              playwrightPrecision: 95,
              duration: 800
            }
          ] : []
        }
      ];

      reply.send({
        success: true,
        sessions: mockSessions,
        count: mockSessions.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting browser sessions', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Additional browser endpoints for Mission Control compatibility
  private async handleBrowserStatus(request: FastifyRequest<{ Querystring: { profile?: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const { profile } = request.query;
      this.logger.info(`Getting browser status for profile: ${profile || 'default'}`);

      const isLaunched = this.browserEngine.isLaunched();

      reply.send({
        enabled: true,
        profile: profile || 'chrome',
        running: isLaunched,
        cdpReady: isLaunched,
        cdpHttp: isLaunched,
        cdpPort: null,
        cdpUrl: null,
        detectedBrowser: isLaunched ? 'chromium' : null,
        detectedExecutablePath: null,
        chosenBrowser: 'chromium',
        userDataDir: null,
        detectError: null,
        attachOnly: false,
        headless: false,
        color: '#4285f4'
      });
    } catch (error) {
      this.logger.error('Error getting browser status', error);
      reply.code(500).send({
        enabled: false,
        running: false,
        cdpReady: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowserProfiles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      this.logger.info('Getting browser profiles');

      reply.send({
        profiles: [
          {
            name: 'chrome',
            cdpPort: null,
            cdpUrl: null,
            color: '#4285f4',
            running: this.browserEngine.isLaunched(),
            tabCount: this.browserEngine.isLaunched() ? 1 : 0,
            isDefault: true,
            isRemote: false
          }
        ]
      });
    } catch (error) {
      this.logger.error('Error getting browser profiles', error);
      reply.code(500).send({
        profiles: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowserTabs(request: FastifyRequest<{ Querystring: { profile?: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const { profile } = request.query;
      this.logger.info(`Getting browser tabs for profile: ${profile || 'default'}`);

      const tabs = this.browserEngine.isLaunched() ? [{
        targetId: 'page-1',
        title: await this.browserEngine.getTitle(),
        url: await this.browserEngine.getCurrentUrl(),
        id: 'page-1'
      }] : [];

      reply.send({
        tabs
      });
    } catch (error) {
      this.logger.error('Error getting browser tabs', error);
      reply.code(500).send({
        tabs: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowserStart(request: FastifyRequest<{ Body: { profile?: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const { profile } = request.body;
      this.logger.info(`Starting browser for profile: ${profile || 'default'}`);

      if (!this.browserEngine.isLaunched()) {
        await this.browserEngine.launch();
      }

      reply.send({
        message: 'Browser started successfully'
      });
    } catch (error) {
      this.logger.error('Error starting browser', error);
      reply.code(500).send({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowserStop(request: FastifyRequest<{ Body: { profile?: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const { profile } = request.body;
      this.logger.info(`Stopping browser for profile: ${profile || 'default'}`);

      if (this.browserEngine.isLaunched()) {
        await this.browserEngine.close();
      }

      reply.send({
        message: 'Browser stopped successfully'
      });
    } catch (error) {
      this.logger.error('Error stopping browser', error);
      reply.code(500).send({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowserSnapshot(request: FastifyRequest<{ Querystring: { profile?: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const { profile } = request.query;
      this.logger.info(`Getting browser snapshot for profile: ${profile || 'default'}`);

      const isLaunched = this.browserEngine.isLaunched();

      reply.send({
        running: isLaunched,
        cdpReady: isLaunched,
        tabs: isLaunched ? [{
          targetId: 'page-1',
          title: await this.browserEngine.getTitle(),
          url: await this.browserEngine.getCurrentUrl()
        }] : []
      });
    } catch (error) {
      this.logger.error('Error getting browser snapshot', error);
      reply.code(500).send({
        running: false,
        cdpReady: false,
        tabs: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleBrowserScreenshot(request: FastifyRequest<{ Body: { profile?: string; format?: string; fullPage?: boolean } }>, reply: FastifyReply): Promise<void> {
    try {
      const { profile, format = 'png', fullPage = false } = request.body;
      this.logger.info(`Taking browser screenshot for profile: ${profile || 'default'}`);

      if (!this.browserEngine.isLaunched()) {
        reply.code(400).send({
          error: 'Browser not running'
        });
        return;
      }

      const screenshot = await this.browserEngine.takeScreenshot();

      reply.send({
        image: screenshot,
        format,
        fullPage
      });
    } catch (error) {
      this.logger.error('Error taking browser screenshot', error);
      reply.code(500).send({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleWebSocket(connection: any, request: FastifyRequest): Promise<void> {
    this.logger.info('WebSocket connection established');

    connection.socket.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        this.logger.info('WebSocket message received', data);

        // Echo back for now - in full implementation this would handle real-time commands
        connection.socket.send(JSON.stringify({
          type: 'echo',
          data,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        this.logger.error('Error handling WebSocket message', error);
      }
    });

    connection.socket.on('close', () => {
      this.logger.info('WebSocket connection closed');
    });
  }

  // Computer use handlers
  private async handleGetComputerContext(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const context = await this.computerOrchestrator.getCurrentContext();

      reply.send({
        success: true,
        context,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting computer context', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get computer context'
      });
    }
  }

  private async handleExecuteOperation(
    request: FastifyRequest<{ Body: { type: string; target?: string; parameters?: any; description?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { type, target, parameters, description } = request.body;

      // Validate operation type
      const validTypes = ['open_application', 'close_application', 'navigate_web', 'take_screenshot',
                         'type_text', 'click_element', 'edit_file', 'run_command', 'monitor_screen'];
      if (!validTypes.includes(type)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid operation type: ${type}`
        });
      }

      const operation = { type: type as any, target, parameters, description };
      const result = await this.computerOrchestrator.executeHighLevelOperation(operation);

      this.wsEventManager.broadcast({
        type: 'computer:operation_completed',
        data: { operation, result },
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        operation,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error executing computer operation', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute computer operation'
      });
    }
  }

  private async handleExecuteComputerTask(
    request: FastifyRequest<{ Body: { id: string; description: string; type: string; priority?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id, description, type, priority } = request.body;

      // Validate task type
      const validTaskTypes = ['web_navigation', 'research', 'monitoring', 'coding_task', 'desktop_operation', 'complex_workflow'];
      if (!validTaskTypes.includes(type)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid task type: ${type}`
        });
      }

      // Validate priority
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      const taskPriority = priority || 'medium';
      if (!validPriorities.includes(taskPriority)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid priority: ${taskPriority}`
        });
      }

      const task = {
        id,
        description,
        type: type as any,
        status: 'pending' as const,
        priority: taskPriority as any,
        createdAt: new Date()
      };

      const result = await this.computerOrchestrator.executeComputerTask(task);

      this.wsEventManager.broadcast({
        type: 'computer:task_completed',
        data: { task, result },
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        task,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error executing computer task', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute computer task'
      });
    }
  }

  private async handleProcessNaturalCommand(
    request: FastifyRequest<{ Body: { command: string; operator?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { command, operator = 'assistant' } = request.body;

      const digitalOperator = this.digitalOperators.get(operator);
      if (!digitalOperator) {
        return reply.code(404).send({
          success: false,
          error: `Digital operator '${operator}' not found`
        });
      }

      const result = await digitalOperator.processNaturalLanguageCommand(command);

      this.wsEventManager.broadcast({
        type: 'computer:command_processed',
        data: { command, operator, result },
        timestamp: new Date().toISOString()
      });

      reply.send({
        success: true,
        command,
        operator,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error processing natural command', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process natural command'
      });
    }
  }

  private async handleListDigitalOperators(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const operators = Array.from(this.digitalOperators.entries()).map(([key, operator]) => ({
        key,
        status: operator.getStatus()
      }));

      reply.send({
        success: true,
        operators,
        count: operators.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error listing digital operators', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list digital operators'
      });
    }
  }

  private async handleGetOperatorStatus(
    request: FastifyRequest<{ Params: { name: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { name } = request.params;

      const operator = this.digitalOperators.get(name);
      if (!operator) {
        return reply.code(404).send({
          success: false,
          error: `Digital operator '${name}' not found`
        });
      }

      const status = operator.getStatus();

      reply.send({
        success: true,
        name,
        status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting operator status', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get operator status'
      });
    }
  }

  private async handleGetScreenshot(
    request: FastifyRequest<{ Querystring: { format?: string; quality?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { format = 'png', quality } = request.query;

      const options = {
        format: format as 'png' | 'jpeg',
        quality: quality ? parseInt(quality) : undefined
      };

      const result = await this.computerOrchestrator.executeHighLevelOperation({
        type: 'take_screenshot',
        parameters: options
      });

      if (result.success && result.data?.screenshot) {
        reply.header('Content-Type', `image/${format}`);
        reply.send(result.data.screenshot);
      } else {
        reply.code(500).send({
          success: false,
          error: 'Failed to capture screenshot'
        });
      }
    } catch (error) {
      this.logger.error('Error getting screenshot', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get screenshot'
      });
    }
  }

  private registerDefaultSkills(): void {
    // Register basic navigation skill
    this.skillRegistry.register({
      name: 'navigate_to',
      description: 'Navigate the browser to a specific URL',
      parameters: [
        { name: 'url', type: 'string', description: 'The URL to navigate to', required: true }
      ],
      handler: async (params) => {
        await this.browserEngine.navigate(params.url);
        return { 
          message: `Navigated to ${params.url}`,
          title: await this.browserEngine.getTitle()
        };
      }
    });

    // Register basic extraction skill
    this.skillRegistry.register({
      name: 'extract_text',
      description: 'Extract text content from the current page',
      parameters: [
        { name: 'selector', type: 'string', description: 'CSS selector to extract from (optional, defaults to body)', required: false }
      ],
      handler: async (params) => {
        const selector = params.selector || 'body';
        const text = await this.browserEngine.extractText(selector);
        return { text };
      }
    });
    
    this.logger.info(`Registered ${this.skillRegistry.getAllSkills().length} default skills`);
  }

  private async handleExecuteSkill(
    request: FastifyRequest<{ Body: { skill: string; params: any; context?: any } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { skill, params, context } = request.body;

      const result = await this.skillExecutor.execute(skill, params, context);

      reply.send({
        success: result.success,
        skill,
        result: result.result,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error executing skill', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ──────────────────────────────────────────────
  // Phase 1: Agent Execute Handler (THE KEY ENDPOINT)
  // ──────────────────────────────────────────────

  private async handleExecuteAgent(
    request: FastifyRequest<{ Params: { id: string }; Body: { goal: string; maxIterations?: number; enableMemory?: boolean } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.params;
      const { goal, maxIterations = 10, enableMemory = true } = request.body;

      if (!this.agentRuntime) {
        reply.code(503).send({ success: false, error: 'Agent runtime not initialized' });
        return;
      }

      const agent = await this.agentManager.getAgent(id);
      if (!agent) {
        reply.code(404).send({ success: false, error: 'Agent not found' });
        return;
      }

      this.logger.info(`Executing agent ${agent.name} with goal: ${goal}`);

      const execution = await this.agentRuntime.execute(agent, goal, {
        maxIterations,
        enableMemoryRetrieval: enableMemory,
        enableSkillLearning: true,
        enableSelfCorrection: true,
      });

      // Broadcast execution completion via WebSocket
      this.wsEventManager.broadcast({
        type: 'agent:execution:complete',
        data: {
          agentId: id,
          executionId: execution.id,
          status: execution.status,
          goal,
          finalAnswer: execution.finalAnswer,
          iterations: execution.iterations,
          tokensUsed: execution.tokensUsed,
        },
        timestamp: new Date().toISOString(),
      });

      reply.send({
        success: execution.status === 'completed',
        execution: {
          id: execution.id,
          agentId: execution.agentId,
          goal: execution.goal,
          status: execution.status,
          finalAnswer: execution.finalAnswer,
          error: execution.error,
          iterations: execution.iterations,
          tokensUsed: execution.tokensUsed,
          steps: execution.plan.steps.map((s) => ({
            id: s.id,
            tool: s.tool,
            thought: s.thought,
            status: s.status,
            observation: s.observation?.slice(0, 500),
            durationMs: s.durationMs,
          })),
          startedAt: execution.startedAt.toISOString(),
          completedAt: execution.completedAt?.toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error executing agent', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleListExecutions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      if (!this.agentRuntime) {
        reply.send({ success: true, executions: [], count: 0 });
        return;
      }
      const executions = this.agentRuntime.getActiveExecutions();
      reply.send({ success: true, executions, count: executions.length });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // ──────────────────────────────────────────────
  // Cron Job Handlers
  // ──────────────────────────────────────────────

  private async handleCreateCronJob(
    request: FastifyRequest<{ Body: { name: string; schedule: string; command: string; agentId?: string; description?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      if (!this.cronScheduler) {
        reply.code(503).send({ success: false, error: 'Cron scheduler not initialized' });
        return;
      }
      const job = await this.cronScheduler.createJob(request.body);
      this.wsEventManager.broadcast({ type: 'cron:created', data: job, timestamp: new Date().toISOString() });
      reply.send({ success: true, job, timestamp: new Date().toISOString() });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleListCronJobs(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const jobs = this.cronScheduler ? await this.cronScheduler.listJobs() : [];
      reply.send({ success: true, jobs, count: jobs.length });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handlePauseCronJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      if (!this.cronScheduler) { reply.code(503).send({ success: false, error: 'Cron scheduler not initialized' }); return; }
      await this.cronScheduler.pauseJob(request.params.id);
      reply.send({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleResumeCronJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      if (!this.cronScheduler) { reply.code(503).send({ success: false, error: 'Cron scheduler not initialized' }); return; }
      await this.cronScheduler.resumeJob(request.params.id);
      reply.send({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleTriggerCronJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      if (!this.cronScheduler) { reply.code(503).send({ success: false, error: 'Cron scheduler not initialized' }); return; }
      const run = await this.cronScheduler.triggerJob(request.params.id);
      reply.send({ success: true, run, timestamp: new Date().toISOString() });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleDeleteCronJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      if (!this.cronScheduler) { reply.code(503).send({ success: false, error: 'Cron scheduler not initialized' }); return; }
      await this.cronScheduler.deleteJob(request.params.id);
      reply.send({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleCronJobHistory(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const history = this.cronScheduler
        ? this.cronScheduler.getHistory(request.params.id, parseInt(request.query.limit ?? '20'))
        : [];
      reply.send({ success: true, history, count: history.length });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // ──────────────────────────────────────────────
  // Usage & Cost Handlers
  // ──────────────────────────────────────────────

  private async handleGetUsage(
    request: FastifyRequest<{ Querystring: { days?: string; agentId?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const summary = this.usageTracker
        ? this.usageTracker.getSummary({
            days: parseInt(request.query.days ?? '30'),
            agentId: request.query.agentId,
          })
        : { totalRequests: 0, totalTokens: 0, totalCostUsd: 0, byModel: {}, byAgent: {}, byDay: {} };
      reply.send({ success: true, summary });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleGetUsageEntries(
    request: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const entries = this.usageTracker
        ? this.usageTracker.getRecentEntries(parseInt(request.query.limit ?? '50'))
        : [];
      reply.send({ success: true, entries, count: entries.length });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // ──────────────────────────────────────────────
  // Health Check
  // ──────────────────────────────────────────────

  private async handleHealthCheck(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const memStats = await this.memory.getStats().catch(() => ({}));
    reply.send({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      systems: {
        api: 'running',
        llm: this.llmManager.getAvailableProviders().length > 0 ? 'ready' : 'no_providers',
        memory: 'ready',
        browser: this.browserEngine.isLaunched() ? 'launched' : 'idle',
        agentRuntime: this.agentRuntime ? 'ready' : 'not_initialized',
        cronScheduler: this.cronScheduler ? 'ready' : 'not_initialized',
        usageTracker: this.usageTracker ? 'ready' : 'not_initialized',
      },
      memory: memStats,
    });
  }

  async start(): Promise<void> {
    try {
      await this.fastify.listen({
        host: this.config.host,
        port: this.config.port
      });

      this.logger.info(`API server listening on ${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.logger.error('Failed to start API server', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.fastify.close();
      this.logger.info('API server stopped');
    } catch (error) {
      this.logger.error('Error stopping API server', error);
      throw error;
    }
  }
}