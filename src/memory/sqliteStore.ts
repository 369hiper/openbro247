import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';
import { Agent } from '../agents/types';
import { Task } from '../tasks/types';
import { ChatSession, ChatMessage } from '../chat/types';

export interface MemoryRecord {
  id: string;
  content: string;
  memory_type: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  access_count: number;
  importance: number;
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
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ActionRecord {
  id: string;
  action_type: string;
  target: string | null;
  parameters: Record<string, any>;
  result: string;
  success: boolean;
  duration_ms: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface HeartbeatRecord {
  id: string;
  heartbeat_type: string;
  status: string;
  data: Record<string, any>;
  created_at: string;
}

export interface AgentTaskRecord {
  id: string;
  parent_task_id: string | null;
  agent_type: string;
  task_description: string;
  status: string;
  result: string | null;
  metadata: Record<string, any>;
  created_at: string;
  completed_at: string | null;
}

export interface ResearchReportRecord {
  id: string;
  topic: string;
  content: string;
  sources: string[];
  metadata: Record<string, any>;
  created_at: string;
}

export interface SQLiteStoreOptions {
  dbPath: string;
}

export class SQLiteStore {
  private db: Database.Database | null = null;
  private options: SQLiteStoreOptions;
  private logger: Logger;

  constructor(options: SQLiteStoreOptions) {
    this.options = options;
    this.logger = new Logger('SQLiteStore');
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
      )`
    ];

    for (const sql of tables) {
      this.db!.exec(sql);
    }
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
    const row = selectStmt.get(memoryId) as any;

    if (row) {
      return {
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      } as MemoryRecord;
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
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    })) as MemoryRecord[];
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
    const row = stmt.get(skillId) as any;

    if (row) {
      return {
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      } as SkillRecord;
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
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    })) as SkillRecord[];
  }

  async updateSkillUsage(skillId: string, success: boolean): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get current stats
    const selectStmt = this.db.prepare('SELECT usage_count, success_rate FROM skills WHERE id = ?');
    const row = selectStmt.get(skillId) as any;

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
      const row = stmt.get() as any;
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
    const row = stmt.get(agentId) as any;

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
    const rows = stmt.all() as any[];

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
    const row = stmt.get(taskId) as any;

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
    const rows = stmt.all() as any[];

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
    const row = stmt.get(sessionId) as any;

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
    const rows = stmt.all() as any[];

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
    const rows = stmt.all(sessionId) as any[];

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: new Date(row.created_at)
    })) as ChatMessage[];
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.info('SQLite store closed');
    }
  }
}