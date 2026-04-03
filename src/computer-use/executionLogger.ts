import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { ExecutionLogEntry, ExecutionPlan, ExecutionStep } from './types';

/**
 * ExecutionLogger provides comprehensive logging for autonomous agent activities.
 * All logs are stored in memory and can be exported or queried.
 */
export class ExecutionLogger {
  private logs: ExecutionLogEntry[] = [];
  private logger: Logger;
  private maxLogs: number;
  private logFile?: string;

  constructor(options: { maxLogs?: number; logFile?: string } = {}) {
    this.logger = new Logger('ExecutionLogger');
    this.maxLogs = options.maxLogs || 10000;
    this.logFile = options.logFile;
  }

  /**
   * Log a planning event
   */
  plan(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>,
    planId?: string
  ): void {
    this.log({ level, category: 'planning', message, data, planId });
  }

  /**
   * Log a research event
   */
  research(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>,
    taskId?: string,
    stepId?: string
  ): void {
    this.log({ level, category: 'research', message, data, taskId, stepId });
  }

  /**
   * Log a coding event
   */
  coding(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>,
    taskId?: string,
    stepId?: string
  ): void {
    this.log({ level, category: 'coding', message, data, taskId, stepId });
  }

  /**
   * Log a testing event
   */
  testing(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>,
    taskId?: string,
    stepId?: string
  ): void {
    this.log({ level, category: 'testing', message, data, taskId, stepId });
  }

  /**
   * Log a browser event
   */
  browser(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>,
    taskId?: string,
    stepId?: string
  ): void {
    this.log({ level, category: 'browser', message, data, taskId, stepId });
  }

  /**
   * Log a deployment event
   */
  deployment(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>,
    taskId?: string,
    stepId?: string
  ): void {
    this.log({ level, category: 'deployment', message, data, taskId, stepId });
  }

  /**
   * Log a self-improvement event
   */
  selfImprovement(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>
  ): void {
    this.log({ level, category: 'self_improvement', message, data });
  }

  /**
   * Log a notification event
   */
  notification(
    level: ExecutionLogEntry['level'],
    message: string,
    data?: Record<string, any>
  ): void {
    this.log({ level, category: 'notification', message, data });
  }

  /**
   * Log a step started event
   */
  stepStarted(step: ExecutionStep, planId: string): void {
    this.log({
      level: 'info',
      category: 'planning',
      message: `Step ${step.order} started: ${step.description}`,
      data: { stepType: step.type, tool: step.tool, params: step.params },
      stepId: step.id,
      planId,
    });
  }

  /**
   * Log a step completed event
   */
  stepCompleted(step: ExecutionStep, planId: string, result?: any): void {
    this.log({
      level: 'info',
      category: 'planning',
      message: `Step ${step.order} completed: ${step.description}`,
      data: {
        stepType: step.type,
        result,
        duration:
          step.completedAt && step.startedAt
            ? step.completedAt.getTime() - step.startedAt.getTime()
            : undefined,
      },
      stepId: step.id,
      planId,
    });
  }

  /**
   * Log a step failed event
   */
  stepFailed(step: ExecutionStep, planId: string, error: string): void {
    this.log({
      level: 'error',
      category: 'planning',
      message: `Step ${step.order} failed: ${step.description}`,
      data: { stepType: step.type, error, retryCount: step.retryCount },
      stepId: step.id,
      planId,
    });
  }

  /**
   * Get all logs
   */
  getAllLogs(): ExecutionLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by category
   */
  getLogsByCategory(category: ExecutionLogEntry['category']): ExecutionLogEntry[] {
    return this.logs.filter(l => l.category === category);
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level: ExecutionLogEntry['level']): ExecutionLogEntry[] {
    return this.logs.filter(l => l.level === level);
  }

  /**
   * Get logs for a specific plan
   */
  getLogsForPlan(planId: string): ExecutionLogEntry[] {
    return this.logs.filter(l => l.planId === planId);
  }

  /**
   * Get logs for a specific step
   */
  getLogsForStep(stepId: string): ExecutionLogEntry[] {
    return this.logs.filter(l => l.stepId === stepId);
  }

  /**
   * Get error logs only
   */
  getErrors(): ExecutionLogEntry[] {
    return this.logs.filter(l => l.level === 'error' || l.level === 'critical');
  }

  /**
   * Generate a summary report for a plan
   */
  generateSummary(planId: string): {
    planId: string;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    totalLogs: number;
    errors: number;
    warnings: number;
    duration: number;
    logs: ExecutionLogEntry[];
  } {
    const planLogs = this.getLogsForPlan(planId);
    const stepLogs = planLogs.filter(l => l.stepId);

    return {
      planId,
      totalSteps: new Set(stepLogs.map(l => l.stepId)).size,
      completedSteps: stepLogs.filter(l => l.message.includes('completed')).length,
      failedSteps: stepLogs.filter(l => l.message.includes('failed')).length,
      totalLogs: planLogs.length,
      errors: planLogs.filter(l => l.level === 'error').length,
      warnings: planLogs.filter(l => l.level === 'warn').length,
      duration:
        planLogs.length > 0
          ? planLogs[planLogs.length - 1].timestamp.getTime() - planLogs[0].timestamp.getTime()
          : 0,
      logs: planLogs,
    };
  }

  /**
   * Export logs as JSON
   */
  exportLogs(format: 'json' | 'text' = 'json'): string {
    if (format === 'text') {
      return this.logs
        .map(
          l =>
            `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`
        )
        .join('\n');
    }
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
    this.logger.info('Logs cleared');
  }

  /**
   * Get log count
   */
  getLogCount(): number {
    return this.logs.length;
  }

  private log(entry: Omit<ExecutionLogEntry, 'id' | 'timestamp'>): void {
    const logEntry: ExecutionLogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      ...entry,
    };

    this.logs.push(logEntry);

    // Trim logs if over limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to system logger
    const logMessage = `[${entry.category}] ${entry.message}`;
    switch (entry.level) {
      case 'debug':
        this.logger.debug(logMessage);
        break;
      case 'info':
        this.logger.info(logMessage);
        break;
      case 'warn':
        this.logger.warn(logMessage);
        break;
      case 'error':
        this.logger.error(logMessage);
        break;
      case 'critical':
        this.logger.error(`CRITICAL: ${logMessage}`);
        break;
    }
  }
}
