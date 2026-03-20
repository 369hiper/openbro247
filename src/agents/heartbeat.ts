import { Logger } from '../utils/logger';
import { SemanticMemory } from '../memory/semanticMemory';
import { AgentManager } from '../agents/agentManager';
import { AgentRuntime } from '../agents/agentRuntime';
import { LLMManager } from '../ai/llmManager';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface HeartbeatConfig {
  /** Seconds between regular heartbeats (default 60) */
  heartbeatInterval?: number;
  /** Seconds between learning cycles (default 300 = 5 min) */
  learningInterval?: number;
  /** Seconds between autonomous browsing cycles (default 900 = 15 min) */
  browsingInterval?: number;
  /** URLs to autonomously browse during browsing cycles */
  browsingTargets?: string[];
  /** Whether autonomous browsing cycles are enabled */
  enableAutoBrowsing?: boolean;
}

export interface HeartbeatStatus {
  running: boolean;
  heartbeatCount: number;
  lastHeartbeat: string | null;
  lastLearning: string | null;
  lastBrowsing: string | null;
  nextLearning: string | null;
  nextBrowsing: string | null;
  intervals: {
    heartbeat: number;
    learning: number;
    browsing: number;
  };
}

// ──────────────────────────────────────────────
// HeartbeatSystem
// ──────────────────────────────────────────────

export class HeartbeatSystem {
  private logger: Logger;
  private memory: SemanticMemory;
  private agentManager: AgentManager;
  private agentRuntime: AgentRuntime;
  private llmManager: LLMManager;

  private running: boolean = false;
  private heartbeatCount: number = 0;
  private lastHeartbeat: Date | null = null;
  private lastLearning: Date | null = null;
  private lastBrowsing: Date | null = null;

  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Config
  private readonly heartbeatInterval: number;
  private readonly learningInterval: number;
  private readonly browsingInterval: number;
  private readonly browsingTargets: string[];
  private readonly enableAutoBrowsing: boolean;

  constructor(
    memory: SemanticMemory,
    agentManager: AgentManager,
    agentRuntime: AgentRuntime,
    llmManager: LLMManager,
    config: HeartbeatConfig = {}
  ) {
    this.memory = memory;
    this.agentManager = agentManager;
    this.agentRuntime = agentRuntime;
    this.llmManager = llmManager;
    this.logger = new Logger('HeartbeatSystem');

    this.heartbeatInterval = (config.heartbeatInterval ?? 60) * 1000;
    this.learningInterval = (config.learningInterval ?? 300) * 1000;
    this.browsingInterval = (config.browsingInterval ?? 900) * 1000;
    this.enableAutoBrowsing = config.enableAutoBrowsing ?? false;
    this.browsingTargets = config.browsingTargets ?? [
      'https://news.ycombinator.com',
      'https://reddit.com/r/MachineLearning',
    ];
  }

  // ──────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────

  start(): void {
    if (this.running) {
      this.logger.warn('Heartbeat system already running');
      return;
    }

    this.running = true;
    this.logger.info('Heartbeat system started');
    this.scheduleNextBeat();
  }

  stop(): void {
    this.running = false;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.logger.info('Heartbeat system stopped');
  }

  // ──────────────────────────────────────────────
  // Core loop
  // ──────────────────────────────────────────────

  private scheduleNextBeat(): void {
    if (!this.running) return;

    this.heartbeatTimer = setTimeout(async () => {
      await this.beat().catch((e) => this.logger.error('Heartbeat error', e));
      this.scheduleNextBeat();
    }, this.heartbeatInterval);
  }

  private async beat(): Promise<void> {
    this.heartbeatCount++;
    this.lastHeartbeat = new Date();

    this.logger.info(`💓 Heartbeat #${this.heartbeatCount}`);

    // Store heartbeat in SQLite
    await this.memory.storeHeartbeat('heartbeat', 'active', {
      count: this.heartbeatCount,
      timestamp: this.lastHeartbeat.toISOString(),
    }).catch(() => {});

    // Learning cycle
    const now = Date.now();
    if (!this.lastLearning || now - this.lastLearning.getTime() >= this.learningInterval) {
      await this.runLearningCycle().catch((e) =>
        this.logger.error('Learning cycle error', e)
      );
    }

    // Autonomous browsing cycle
    if (
      this.enableAutoBrowsing &&
      (!this.lastBrowsing || now - this.lastBrowsing.getTime() >= this.browsingInterval)
    ) {
      await this.runBrowsingCycle().catch((e) =>
        this.logger.error('Browsing cycle error', e)
      );
    }
  }

  // ──────────────────────────────────────────────
  // Learning cycle — distill patterns from memory
  // ──────────────────────────────────────────────

  async runLearningCycle(): Promise<{ patternsFound: number; skillsCreated: number }> {
    this.logger.info('📚 Starting learning cycle...');
    this.lastLearning = new Date();

    // Recall recent memories
    const recentMemories = await this.memory.recall('recent agent actions and experiences', 20);

    if (recentMemories.length < 3) {
      this.logger.info('Not enough memories for learning cycle (< 3). Skipping.');
      return { patternsFound: 0, skillsCreated: 0 };
    }

    // Group by type
    const groups = new Map<string, any[]>();
    for (const mem of recentMemories) {
      const type = mem.metadata?.type ?? mem.metadata?.memory_type ?? 'general';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(mem);
    }

    let skillsCreated = 0;
    const patternsFound = [...groups.values()].filter((g) => g.length >= 2).length;

    for (const [type, group] of groups) {
      if (group.length < 2) continue;

      try {
        const summary = group
          .slice(0, 5)
          .map((m: any) => `- ${(m.content ?? m.text ?? '').toString().slice(0, 80)}`)
          .join('\n');

        const prompt = `Analyze these ${group.length} related memories of type "${type}" and extract a reusable skill or pattern:

${summary}

Respond with a JSON object:
{"skillName": "...", "description": "...", "pattern": "..."}`;

        const response = await this.llmManager.generate(prompt, {
          temperature: 0.3,
          maxTokens: 300,
        });

        // Parse skill from LLM
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const skill = JSON.parse(jsonMatch[0]);
          if (skill.skillName && skill.description) {
            await this.memory.storeSkill(
              `learned_${type}_${Date.now()}`,
              skill.description,
              skill.pattern ?? summary,
              'auto_learned',
              0.6,
              {
                learnedFrom: type,
                memoryCount: group.length,
                learnedAt: new Date().toISOString(),
                isAutoLearned: true,
              }
            );
            skillsCreated++;
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to extract skill from "${type}" group`, e);
      }
    }

    // Store learning heartbeat
    await this.memory.storeHeartbeat('learning', 'completed', {
      patternsFound,
      skillsCreated,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    this.logger.info(`📚 Learning cycle done: ${patternsFound} patterns, ${skillsCreated} skills created`);
    return { patternsFound, skillsCreated };
  }

  // ──────────────────────────────────────────────
  // Browsing cycle — autonomous web exploration
  // ──────────────────────────────────────────────

  async runBrowsingCycle(): Promise<{ targetsBrowsed: number }> {
    this.logger.info('🌐 Starting browsing cycle...');
    this.lastBrowsing = new Date();

    const mainAgent = await this.agentManager.getMainAgent();
    if (!mainAgent) {
      this.logger.warn('No main agent found for browsing cycle');
      return { targetsBrowsed: 0 };
    }

    const targets = this.browsingTargets.slice(0, 2); // limit to 2 per cycle
    let browsed = 0;

    for (const url of targets) {
      try {
        this.logger.info(`Autonomous browsing: ${url}`);
        const result = await this.agentRuntime.execute(
          mainAgent,
          `Browse ${url}, read the top content, and store any interesting information in memory`,
          { maxIterations: 5, enableSkillLearning: true }
        );

        if (result.status === 'completed') {
          browsed++;
        }
      } catch (e) {
        this.logger.warn(`Failed to browse ${url}`, e);
      }
    }

    await this.memory.storeHeartbeat('browsing', 'completed', {
      targetsBrowsed: browsed,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    this.logger.info(`🌐 Browsing cycle done: ${browsed}/${targets.length} targets browsed`);
    return { targetsBrowsed: browsed };
  }

  // ──────────────────────────────────────────────
  // Manual triggers & status
  // ──────────────────────────────────────────────

  async triggerLearning(): Promise<{ patternsFound: number; skillsCreated: number }> {
    return this.runLearningCycle();
  }

  async triggerBrowsing(): Promise<{ targetsBrowsed: number }> {
    return this.runBrowsingCycle();
  }

  getStatus(): HeartbeatStatus {
    const now = Date.now();
    const nextLearning = this.lastLearning
      ? new Date(this.lastLearning.getTime() + this.learningInterval)
      : null;
    const nextBrowsing = this.lastBrowsing
      ? new Date(this.lastBrowsing.getTime() + this.browsingInterval)
      : null;

    return {
      running: this.running,
      heartbeatCount: this.heartbeatCount,
      lastHeartbeat: this.lastHeartbeat?.toISOString() ?? null,
      lastLearning: this.lastLearning?.toISOString() ?? null,
      lastBrowsing: this.lastBrowsing?.toISOString() ?? null,
      nextLearning: nextLearning?.toISOString() ?? null,
      nextBrowsing: nextBrowsing?.toISOString() ?? null,
      intervals: {
        heartbeat: this.heartbeatInterval / 1000,
        learning: this.learningInterval / 1000,
        browsing: this.browsingInterval / 1000,
      },
    };
  }
}
