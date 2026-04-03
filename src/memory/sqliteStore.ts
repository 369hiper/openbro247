import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';
import { Agent } from '../agents/types';
import { Task } from '../tasks/types';
import { ChatSession, ChatMessage } from '../chat/types';

export interface MemoryMetadata {
  source?: string;
  tags?: string[];
  category?: string;
  [key: string]: unknown;
}

export interface MemoryRecord {
  id: string;
  content: string;
  memory_type: string;
  metadata: MemoryMetadata;
  created_at: string;
  updated_at: string;
  access_count: number;
  importance: number;
}

export interface SkillMetadata {
  category?: string;
  tags?: string[];
  version?: string;
  [key: string]: unknown;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string | null;
  content: string;
  skill_type: string;
  confidence: number;
  usage_count: number;
  success_rate: number;
  metadata: SkillMetadata;
  created_at: string;
  updated_at: string;
}

export interface ActionParameters {
  input?: string;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ActionMetadata {
  sessionId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface ActionRecord {
  id: string;
  action_type: string;
  target: string | null;
  parameters: ActionParameters;
  result: string;
  success: boolean;
  duration_ms: number;
  metadata: ActionMetadata;
  created_at: string;
}

export interface HeartbeatData {
  cpu?: number;
  memory?: number;
  uptime?: number;
  [key: string]: unknown;
}

export interface HeartbeatRecord {
  id: string;
  heartbeat_type: string;
  status: string;
  data: HeartbeatData;
  created_at: string;
}

export interface AgentTaskMetadata {
  priority?: string;
  deadline?: string;
  [key: string]: unknown;
}

export interface AgentTaskRecord {
  id: string;
  parent_task_id: string | null;
  agent_type: string;
  task_description: string;
  status: string;
  result: string | null;
  metadata: AgentTaskMetadata;
  created_at: string;
  completed_at: string | null;
}

export interface ResearchReportMetadata {
  author?: string;
  version?: string;
  [key: string]: unknown;
}

export interface ResearchReportRecord {
  id: string;
  topic: string;
  content: string;
  sources: string[];
  metadata: ResearchReportMetadata;
  created_at: string;
}

export interface SQLiteStoreOptions {
  dbPath: string;
  logger?: Logger;
}

export class SQLiteStore {
  private db: Database.Database | null = null;
  private options: SQLiteStoreOptions;
  private logger: Logger;
  private preparedStatements: Map<string, Database.Statement> = new Map();

  constructor(options: SQLiteStoreOptions) {
    this.options = options;
    this.logger = options.logger || new Logger('SQLiteStore');
  }

  private getPreparedStatement(sql: string): Database.Statement {
    if (!this.db) throw new Error('Database not initialized');

    const cached = this.preparedStatements.get(sql);
    if (cached) {
      return cached;
    }

    const stmt = this.db.prepare(sql);
    this.preparedStatements.set(sql, stmt);
    return stmt;
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing SQLite store...');

      // Ensure directory exists
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(this.options.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.options.dbPath);
      this._createTables();

      this.logger.info(`SQLite store initialized at ${this.options.dbPath}`);
    } catch (error) {
      this.logger.error('Failed to initialize SQLite store', error);
      throw error;
    }
  }

  private _createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    const tables = [
      `CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        model_config TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        parent_agent_id TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        parent_task_id TEXT,
        subtasks TEXT,
        result TEXT,
        error TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        importance REAL DEFAULT 0.5
      )`,
      `CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        skill_type TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0.0,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        target TEXT,
        parameters TEXT,
        result TEXT,
        success INTEGER,
        duration_ms INTEGER,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS heartbeats (
        id TEXT PRIMARY KEY,
        heartbeat_type TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        parent_task_id TEXT,
        agent_type TEXT NOT NULL,
        task_description TEXT NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS research_reports (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        sources TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS ai_models (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'openrouter',
        display_name TEXT NOT NULL,
        agent_role TEXT NOT NULL,
        is_free INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 0,
        context_length INTEGER DEFAULT 4096,
        supports_vision INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_error TEXT,
        last_error_at TEXT,
        last_used_at TEXT,
        total_requests INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of tables) {
      this.db!.exec(sql);
    }

    // Create indexes for better query performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)',
      'CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type)',
      'CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_id ON chat_sessions(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type)',
      'CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance)',
      'CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_skills_type ON skills(skill_type)',
      'CREATE INDEX IF NOT EXISTS idx_skills_confidence ON skills(confidence)',
      'CREATE INDEX IF NOT EXISTS idx_skills_usage ON skills(usage_count)',
      'CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(action_type)',
      'CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_heartbeats_type ON heartbeats(heartbeat_type)',
      'CREATE INDEX IF NOT EXISTS idx_heartbeats_status ON heartbeats(status)',
      'CREATE INDEX IF NOT EXISTS idx_agent_tasks_type ON agent_tasks(agent_type)',
      'CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status)',
      'CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent ON agent_tasks(parent_task_id)',
      'CREATE INDEX IF NOT EXISTS idx_research_reports_topic ON research_reports(topic)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_ai_models_role ON ai_models(agent_role)',
      'CREATE INDEX IF NOT EXISTS idx_ai_models_active ON ai_models(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_ai_models_priority ON ai_models(priority DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ai_models_model_id ON ai_models(model_id)'
    ];

    for (const sql of indexes) {
      this.db!.exec(sql);
    }

    this.logger.info('Database tables and indexes created');
  }

  async storeMemory(
    memoryId: string,
    content: string,
    memoryType: string,
    metadata?: Record<string, any>,
    importance: number = 0.5
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories
      (id, content, memory_type, metadata, importance, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memoryId,
      content,
      memoryType,
      metadata ? JSON.stringify(metadata) : null,
      importance,
      new Date().toISOString()
    );

    this.logger.info(`Stored memory: ${memoryId}`);
  }

  async getMemory(memoryId: string): Promise<MemoryRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    // Update access count
    const updateStmt = this.db.prepare(`
      UPDATE memories SET access_count = access_count + 1 WHERE id = ?
    `);
    updateStmt.run(memoryId);

    // Get the memory
    const selectStmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = selectStmt.get(memoryId) as MemoryRecord | undefined;

    if (row) {
      return {
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata as unknown as string) : {}
      };
    }

    return null;
  }

  async searchMemories(
    query: string,
    memoryType?: string,
    limit: number = 10
  ): Promise<MemoryRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      SELECT * FROM memories
      WHERE content LIKE ?
      ${memoryType ? 'AND memory_type = ?' : ''}
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `;

    const params = memoryType
      ? [`%${query}%`, memoryType, limit]
      : [`%${query}%`, limit];

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as MemoryRecord[];

    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata as unknown as string) : {}
    }));
  }

  async storeSkill(
    skillId: string,
    name: string,
    description: string | null,
    content: string,
    skillType: string,
    confidence: number = 0.5,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO skills
      (id, name, description, content, skill_type, confidence, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      skillId,
      name,
      description,
      content,
      skillType,
      confidence,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString()
    );

    this.logger.info(`Stored skill: ${skillId}`);
  }

  async getSkill(skillId: string): Promise<SkillRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM skills WHERE id = ?');
    const row = stmt.get(skillId) as SkillRecord | undefined;

    if (row) {
      return {
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata as unknown as string) : {}
      };
    }

    return null;
  }

  async searchSkills(
    query: string,
    skillType?: string,
    limit: number = 10
  ): Promise<SkillRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      SELECT * FROM skills
      WHERE (name LIKE ? OR description LIKE ?)
      ${skillType ? 'AND skill_type = ?' : ''}
      ORDER BY confidence DESC, usage_count DESC
      LIMIT ?
    `;

    const params = skillType
      ? [`%${query}%`, `%${query}%`, skillType, limit]
      : [`%${query}%`, `%${query}%`, limit];

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as SkillRecord[];

    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata as unknown as string) : {}
    }));
  }

  async updateSkillUsage(skillId: string, success: boolean): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get current stats
    const selectStmt = this.db.prepare('SELECT usage_count, success_rate FROM skills WHERE id = ?');
    const row = selectStmt.get(skillId) as { usage_count: number; success_rate: number } | undefined;

    if (!row) {
      throw new Error('Skill not found');
    }

    const usageCount = row.usage_count + 1;
    const successRate = success
      ? (row.success_rate * (usageCount - 1) + 1) / usageCount
      : (row.success_rate * (usageCount - 1)) / usageCount;

    const updateStmt = this.db.prepare(`
      UPDATE skills SET usage_count = ?, success_rate = ?, updated_at = ? WHERE id = ?
    `);

    updateStmt.run(usageCount, successRate, new Date().toISOString(), skillId);
  }

  async storeAction(
    actionId: string,
    actionType: string,
    target: string | null,
    parameters: Record<string, any>,
    result: string,
    success: boolean,
    durationMs: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO actions
      (id, action_type, target, parameters, result, success, duration_ms, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      actionId,
      actionType,
      target,
      JSON.stringify(parameters),
      result,
      success ? 1 : 0,
      durationMs,
      metadata ? JSON.stringify(metadata) : null
    );

    this.logger.info(`Stored action: ${actionId}`);
  }

  async storeHeartbeat(
    heartbeatId: string,
    heartbeatType: string,
    status: string,
    data?: Record<string, any>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO heartbeats
      (id, heartbeat_type, status, data)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      heartbeatId,
      heartbeatType,
      status,
      data ? JSON.stringify(data) : null
    );

    this.logger.info(`Stored heartbeat: ${heartbeatId}`);
  }

  async storeAgentTask(
    taskId: string,
    agentType: string,
    taskDescription: string,
    status: string,
    parentTaskId?: string,
    result?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_tasks
      (id, parent_task_id, agent_type, task_description, status, result, metadata, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      taskId,
      parentTaskId || null,
      agentType,
      taskDescription,
      status,
      result || null,
      metadata ? JSON.stringify(metadata) : null,
      status === 'completed' ? new Date().toISOString() : null
    );

    this.logger.info(`Stored agent task: ${taskId}`);
  }

  async storeResearchReport(
    reportId: string,
    topic: string,
    content: string,
    sources?: string[],
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO research_reports
      (id, topic, content, sources, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      reportId,
      topic,
      content,
      sources ? JSON.stringify(sources) : null,
      metadata ? JSON.stringify(metadata) : null
    );

    this.logger.info(`Stored research report: ${reportId}`);
  }

  async getStats(): Promise<Record<string, number>> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = ['agents', 'memories', 'skills', 'conversations', 'actions', 'heartbeats', 'agent_tasks', 'research_reports'];
    const stats: Record<string, number> = {};

    for (const table of tables) {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
      const row = stmt.get() as { count: number };
      stats[table] = row.count;
    }

    return stats;
  }

  // Agent methods
  async storeAgent(agent: Agent): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents
      (id, name, type, status, model_config, capabilities, parent_agent_id, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agent.id,
      agent.name,
      agent.type,
      agent.status,
      JSON.stringify(agent.modelConfig),
      JSON.stringify(agent.capabilities),
      agent.parentAgentId || null,
      agent.metadata ? JSON.stringify(agent.metadata) : null,
      new Date().toISOString()
    );

    this.logger.info(`Stored agent: ${agent.id}`);
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    const row = stmt.get(agentId) as {
      id: string;
      name: string;
      type: string;
      status: string;
      model_config: string;
      capabilities: string;
      parent_agent_id: string | null;
      metadata: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (row) {
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        modelConfig: JSON.parse(row.model_config),
        capabilities: JSON.parse(row.capabilities),
        parentAgentId: row.parent_agent_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      } as Agent;
    }

    return null;
  }

  async getAllAgents(): Promise<Agent[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM agents ORDER BY created_at DESC');
    const rows = stmt.all() as {
      id: string;
      name: string;
      type: string;
      status: string;
      model_config: string;
      capabilities: string;
      parent_agent_id: string | null;
      metadata: string | null;
      created_at: string;
      updated_at: string;
    }[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      modelConfig: JSON.parse(row.model_config),
      capabilities: JSON.parse(row.capabilities),
      parentAgentId: row.parent_agent_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    })) as Agent[];
  }

  async updateAgent(agentId: string, agent: Agent): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE agents
      SET name = ?, type = ?, status = ?, model_config = ?, capabilities = ?, parent_agent_id = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      agent.name,
      agent.type,
      agent.status,
      JSON.stringify(agent.modelConfig),
      JSON.stringify(agent.capabilities),
      agent.parentAgentId || null,
      agent.metadata ? JSON.stringify(agent.metadata) : null,
      new Date().toISOString(),
      agentId
    );

    this.logger.info(`Updated agent: ${agentId}`);
  }

  async deleteAgent(agentId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM agents WHERE id = ?');
    stmt.run(agentId);

    this.logger.info(`Deleted agent: ${agentId}`);
  }

  // Task methods
  async storeTask(task: Task): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks
      (id, agent_id, description, status, priority, parent_task_id, subtasks, result, error, metadata, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.agentId,
      task.description,
      task.status,
      task.priority,
      task.parentTaskId || null,
      JSON.stringify(task.subtasks),
      task.result ? JSON.stringify(task.result) : null,
      task.error || null,
      task.metadata ? JSON.stringify(task.metadata) : null,
      task.startedAt?.toISOString() || null,
      task.completedAt?.toISOString() || null
    );

    this.logger.info(`Stored task: ${task.id}`);
  }

  async getTask(taskId: string): Promise<Task | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(taskId) as {
      id: string;
      agent_id: string;
      description: string;
      status: string;
      priority: string;
      parent_task_id: string | null;
      subtasks: string;
      result: string | null;
      error: string | null;
      metadata: string | null;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    } | undefined;

    if (row) {
      return {
        id: row.id,
        agentId: row.agent_id,
        description: row.description,
        status: row.status,
        priority: row.priority,
        parentTaskId: row.parent_task_id,
        subtasks: JSON.parse(row.subtasks || '[]'),
        result: row.result ? JSON.parse(row.result) : undefined,
        error: row.error,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: new Date(row.created_at),
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined
      } as Task;
    }

    return null;
  }

  async getAllTasks(): Promise<Task[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC');
    const rows = stmt.all() as {
      id: string;
      agent_id: string;
      description: string;
      status: string;
      priority: string;
      parent_task_id: string | null;
      subtasks: string;
      result: string | null;
      error: string | null;
      metadata: string | null;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    }[];

    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      description: row.description,
      status: row.status,
      priority: row.priority,
      parentTaskId: row.parent_task_id,
      subtasks: JSON.parse(row.subtasks || '[]'),
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined
    })) as Task[];
  }

  async updateTask(taskId: string, task: Task): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET agent_id = ?, description = ?, status = ?, priority = ?, parent_task_id = ?, subtasks = ?, result = ?, error = ?, metadata = ?, started_at = ?, completed_at = ?
      WHERE id = ?
    `);

    stmt.run(
      task.agentId,
      task.description,
      task.status,
      task.priority,
      task.parentTaskId || null,
      JSON.stringify(task.subtasks),
      task.result ? JSON.stringify(task.result) : null,
      task.error || null,
      task.metadata ? JSON.stringify(task.metadata) : null,
      task.startedAt?.toISOString() || null,
      task.completedAt?.toISOString() || null,
      taskId
    );

    this.logger.info(`Updated task: ${taskId}`);
  }

  async deleteTask(taskId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.run(taskId);

    this.logger.info(`Deleted task: ${taskId}`);
  }

  // Chat session methods
  async storeChatSession(session: ChatSession): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chat_sessions
      (id, agent_id, metadata, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.agentId,
      session.metadata ? JSON.stringify(session.metadata) : null,
      new Date().toISOString()
    );

    this.logger.info(`Stored chat session: ${session.id}`);
  }

  async getChatSession(sessionId: string): Promise<ChatSession | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?');
    const row = stmt.get(sessionId) as {
      id: string;
      agent_id: string;
      metadata: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (row) {
      const messages = await this.getChatMessages(sessionId);
      return {
        id: row.id,
        agentId: row.agent_id,
        messages,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      } as ChatSession;
    }

    return null;
  }

  async getAllChatSessions(): Promise<ChatSession[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC');
    const rows = stmt.all() as {
      id: string;
      agent_id: string;
      metadata: string | null;
      created_at: string;
      updated_at: string;
    }[];

    const sessions: ChatSession[] = [];
    for (const row of rows) {
      const messages = await this.getChatMessages(row.id);
      sessions.push({
        id: row.id,
        agentId: row.agent_id,
        messages,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      });
    }

    return sessions;
  }

  async updateChatSession(sessionId: string, session: ChatSession): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE chat_sessions
      SET agent_id = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      session.agentId,
      session.metadata ? JSON.stringify(session.metadata) : null,
      new Date().toISOString(),
      sessionId
    );

    this.logger.info(`Updated chat session: ${sessionId}`);
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?');
    stmt.run(sessionId);

    this.logger.info(`Deleted chat session: ${sessionId}`);
  }

  // Chat message methods
  async storeChatMessage(message: ChatMessage): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chat_messages
      (id, session_id, role, content, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.sessionId,
      message.role,
      message.content,
      message.metadata ? JSON.stringify(message.metadata) : null
    );

    this.logger.info(`Stored chat message: ${message.id}`);
  }

  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(sessionId) as {
      id: string;
      session_id: string;
      role: string;
      content: string;
      metadata: string | null;
      created_at: string;
    }[];

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: new Date(row.created_at)
    })) as ChatMessage[];
  }

  // ── AI Models CRUD ────────────────────────────────────────────────────────

  async createAIModelsTable(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    // Table is already created in _createTables, but this allows
    // the fallback manager to ensure it exists independently.
    this.db.exec(`CREATE TABLE IF NOT EXISTS ai_models (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'openrouter',
      display_name TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      is_free INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      context_length INTEGER DEFAULT 4096,
      supports_vision INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_error TEXT,
      last_error_at TEXT,
      last_used_at TEXT,
      total_requests INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  async storeAIModel(model: {
    id: string;
    modelId: string;
    provider: string;
    displayName: string;
    agentRole: string;
    isFree: boolean;
    isActive: boolean;
    priority: number;
    contextLength: number;
    supportsVision: boolean;
    errorCount: number;
    lastError: string | null;
    lastErrorAt: string | null;
    lastUsedAt: string | null;
    totalRequests: number;
    createdAt: string;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ai_models
      (id, model_id, provider, display_name, agent_role, is_free, is_active, priority, context_length, supports_vision, error_count, last_error, last_error_at, last_used_at, total_requests, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      model.id,
      model.modelId,
      model.provider,
      model.displayName,
      model.agentRole,
      model.isFree ? 1 : 0,
      model.isActive ? 1 : 0,
      model.priority,
      model.contextLength,
      model.supportsVision ? 1 : 0,
      model.errorCount,
      model.lastError,
      model.lastErrorAt,
      model.lastUsedAt,
      model.totalRequests,
      model.createdAt
    );
  }

  async getAllAIModels(): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT * FROM ai_models ORDER BY agent_role, priority DESC');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      modelId: r.model_id,
      provider: r.provider,
      displayName: r.display_name,
      agentRole: r.agent_role,
      isFree: r.is_free === 1,
      isActive: r.is_active === 1,
      priority: r.priority,
      contextLength: r.context_length,
      supportsVision: r.supports_vision === 1,
      errorCount: r.error_count,
      lastError: r.last_error,
      lastErrorAt: r.last_error_at,
      lastUsedAt: r.last_used_at,
      totalRequests: r.total_requests,
      createdAt: r.created_at,
    }));
  }

  async getAIModelsByRole(role: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT * FROM ai_models WHERE agent_role = ? ORDER BY priority DESC');
    const rows = stmt.all(role) as any[];
    return rows.map(r => ({
      id: r.id,
      modelId: r.model_id,
      provider: r.provider,
      displayName: r.display_name,
      agentRole: r.agent_role,
      isFree: r.is_free === 1,
      isActive: r.is_active === 1,
      priority: r.priority,
      contextLength: r.context_length,
      supportsVision: r.supports_vision === 1,
      errorCount: r.error_count,
      lastError: r.last_error,
      lastErrorAt: r.last_error_at,
      lastUsedAt: r.last_used_at,
      totalRequests: r.total_requests,
      createdAt: r.created_at,
    }));
  }

  async getAIModelByModelId(modelId: string): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT * FROM ai_models WHERE model_id = ?');
    const r = stmt.get(modelId) as any;
    if (!r) return null;
    return {
      id: r.id,
      modelId: r.model_id,
      provider: r.provider,
      displayName: r.display_name,
      agentRole: r.agent_role,
      isFree: r.is_free === 1,
      isActive: r.is_active === 1,
      priority: r.priority,
      contextLength: r.context_length,
      supportsVision: r.supports_vision === 1,
      errorCount: r.error_count,
      lastError: r.last_error,
      lastErrorAt: r.last_error_at,
      lastUsedAt: r.last_used_at,
      totalRequests: r.total_requests,
      createdAt: r.created_at,
    };
  }

  async updateAIModelStatus(id: string, isActive: boolean, errorCount: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('UPDATE ai_models SET is_active = ?, error_count = ? WHERE id = ?');
    stmt.run(isActive ? 1 : 0, errorCount, id);
  }

  async recordAIModelSuccess(modelId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(`
      UPDATE ai_models
      SET total_requests = total_requests + 1, error_count = 0, last_used_at = ?
      WHERE model_id = ?
    `);
    stmt.run(new Date().toISOString(), modelId);
  }

  async recordAIModelError(modelId: string, error: string, errorCount: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(`
      UPDATE ai_models
      SET total_requests = total_requests + 1, error_count = ?, last_error = ?, last_error_at = ?, last_used_at = ?
      WHERE model_id = ?
    `);
    const now = new Date().toISOString();
    stmt.run(errorCount, error.slice(0, 500), now, now, modelId);
  }

  close(): void {
    if (this.db) {
      // Clear prepared statements cache
      this.preparedStatements.clear();
      this.db.close();
      this.db = null;
      this.logger.info('SQLite store closed');
    }
  }
}