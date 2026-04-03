import { v4 as uuidv4 } from 'uuid';
import { ExecutionLogger } from './executionLogger';
import { GoalNotification, ExecutionLogEntry, Artifact, AutonomousAgentConfig } from './types';

export type NotificationChannel = 'websocket' | 'email' | 'slack';

export interface NotificationPayload {
  goalId: string;
  goalDescription: string;
  status: 'completed' | 'failed' | 'needs_review';
  summary: string;
  details: {
    tasksCompleted: number;
    tasksFailed: number;
    duration: number;
    logs: ExecutionLogEntry[];
    artifacts: Artifact[];
  };
}

/**
 * GoalNotifier handles automatic user notification when goals are accomplished.
 * Supports WebSocket, email, and Slack notifications.
 */
export class GoalNotifier {
  private logger: ExecutionLogger;
  private config: AutonomousAgentConfig;
  private notifications: GoalNotification[] = [];
  private wsClients: Set<any> = new Set();

  constructor(logger: ExecutionLogger, config: AutonomousAgentConfig) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Register a WebSocket client for notifications
   */
  registerWebSocketClient(client: any): void {
    this.wsClients.add(client);
    this.logger.notification('info', 'WebSocket client registered for notifications');
  }

  /**
   * Unregister a WebSocket client
   */
  unregisterWebSocketClient(client: any): void {
    this.wsClients.delete(client);
  }

  /**
   * Notify that a goal has been accomplished
   */
  async notifyGoalCompleted(
    goalId: string,
    goalDescription: string,
    summary: string,
    details: NotificationPayload['details']
  ): Promise<GoalNotification> {
    return this.notify({
      goalId,
      goalDescription,
      status: 'completed',
      summary,
      details,
    });
  }

  /**
   * Notify that a goal has failed
   */
  async notifyGoalFailed(
    goalId: string,
    goalDescription: string,
    summary: string,
    details: NotificationPayload['details']
  ): Promise<GoalNotification> {
    return this.notify({
      goalId,
      goalDescription,
      status: 'failed',
      summary,
      details,
    });
  }

  /**
   * Notify that a goal needs user review
   */
  async notifyGoalNeedsReview(
    goalId: string,
    goalDescription: string,
    summary: string,
    details: NotificationPayload['details']
  ): Promise<GoalNotification> {
    return this.notify({
      goalId,
      goalDescription,
      status: 'needs_review',
      summary,
      details,
    });
  }

  /**
   * Get all notifications
   */
  getAllNotifications(): GoalNotification[] {
    return [...this.notifications];
  }

  /**
   * Get notification by goal ID
   */
  getNotification(goalId: string): GoalNotification | undefined {
    return this.notifications.find(n => n.goalId === goalId);
  }

  /**
   * Get unread notifications (user not notified)
   */
  getUnreadNotifications(): GoalNotification[] {
    return this.notifications.filter(n => !n.userNotified);
  }

  /**
   * Mark a notification as read/user notified
   */
  markAsNotified(goalId: string): void {
    const notification = this.notifications.find(n => n.goalId === goalId);
    if (notification) {
      notification.userNotified = true;
    }
  }

  private async notify(payload: NotificationPayload): Promise<GoalNotification> {
    const notification: GoalNotification = {
      goalId: payload.goalId,
      goalDescription: payload.goalDescription,
      status: payload.status,
      summary: payload.summary,
      details: payload.details,
      timestamp: new Date(),
      userNotified: false,
    };

    this.notifications.push(notification);

    this.logger.notification('info', `Goal ${payload.status}: ${payload.goalDescription}`, {
      goalId: payload.goalId,
      tasksCompleted: payload.details.tasksCompleted,
      tasksFailed: payload.details.tasksFailed,
      duration: payload.details.duration,
    });

    // Send to all configured channels
    const channels = this.config.notificationChannels || ['websocket'];

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'websocket':
            await this.sendWebSocketNotification(notification);
            break;
          case 'email':
            await this.sendEmailNotification(notification);
            break;
          case 'slack':
            await this.sendSlackNotification(notification);
            break;
        }
      } catch (error) {
        this.logger.notification('error', `Failed to send ${channel} notification`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return notification;
  }

  private async sendWebSocketNotification(notification: GoalNotification): Promise<void> {
    const message = JSON.stringify({
      type: 'goal_notification',
      data: notification,
      timestamp: new Date().toISOString(),
    });

    for (const client of this.wsClients) {
      try {
        if (client.readyState === 1) {
          // WebSocket.OPEN
          client.send(message);
        }
      } catch (error) {
        this.logger.notification('warn', 'Failed to send to WebSocket client');
      }
    }

    notification.userNotified = true;
    this.logger.notification('info', 'WebSocket notification sent', {
      clients: this.wsClients.size,
    });
  }

  private async sendEmailNotification(notification: GoalNotification): Promise<void> {
    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    this.logger.notification('info', 'Email notification queued (not implemented)', {
      goalId: notification.goalId,
    });
  }

  private async sendSlackNotification(notification: GoalNotification): Promise<void> {
    // TODO: Integrate with Slack webhook
    this.logger.notification('info', 'Slack notification queued (not implemented)', {
      goalId: notification.goalId,
    });
  }
}
