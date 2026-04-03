import { Request, Response } from 'express';
import { OpenClawClient } from '../client';
import { z } from 'zod';

const ExecuteGoalSchema = z.object({
  goal: z.string().min(1),
  context: z.record(z.any()).optional(),
  config: z
    .object({
      name: z.string().optional(),
      workspace: z.string().optional(),
      llmModel: z.string().optional(),
      maxRetries: z.number().optional(),
      timeout: z.number().optional(),
      autoNotify: z.boolean().optional(),
      notificationChannels: z.array(z.enum(['websocket', 'email', 'slack'])).optional(),
      selfImprovementEnabled: z.boolean().optional(),
      browserConfig: z
        .object({
          headless: z.boolean().optional(),
          defaultTimeout: z.number().optional(),
          screenshotOnFailure: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

const GetLogsSchema = z.object({
  category: z.string().optional(),
  level: z.enum(['debug', 'info', 'warn', 'error', 'critical']).optional(),
  limit: z.number().optional(),
});

export class AutonomousRoutes {
  constructor(private client: OpenClawClient) {}

  /**
   * POST /api/autonomous/execute
   * Execute a goal autonomously
   */
  async executeGoal(req: Request, res: Response) {
    try {
      const validation = ExecuteGoalSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors,
        });
      }

      const result = await this.client.executeAutonomousGoal(validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error executing goal:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to execute goal',
      });
    }
  }

  /**
   * GET /api/autonomous/state
   * Get autonomous agent state
   */
  async getState(req: Request, res: Response) {
    try {
      const result = await this.client.getAutonomousState();
      res.json(result);
    } catch (error: any) {
      console.error('Error getting agent state:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get agent state',
      });
    }
  }

  /**
   * GET /api/autonomous/plans
   * Get all execution plans
   */
  async getPlans(req: Request, res: Response) {
    try {
      const result = await this.client.getAutonomousPlans();
      res.json(result);
    } catch (error: any) {
      console.error('Error getting plans:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get plans',
      });
    }
  }

  /**
   * GET /api/autonomous/plans/:id
   * Get a specific plan by ID
   */
  async getPlan(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.getAutonomousPlan(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting plan:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get plan',
      });
    }
  }

  /**
   * GET /api/autonomous/logs
   * Get execution logs
   */
  async getLogs(req: Request, res: Response) {
    try {
      const validation = GetLogsSchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.errors,
        });
      }

      const result = await this.client.getAutonomousLogs(validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting logs:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get logs',
      });
    }
  }

  /**
   * GET /api/autonomous/logs/summary/:planId
   * Get log summary for a plan
   */
  async getLogSummary(req: Request, res: Response) {
    try {
      const { planId } = req.params;
      const result = await this.client.getAutonomousLogSummary(planId);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting log summary:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get log summary',
      });
    }
  }

  /**
   * GET /api/autonomous/artifacts/:planId
   * Get artifacts for a plan
   */
  async getArtifacts(req: Request, res: Response) {
    try {
      const { planId } = req.params;
      const result = await this.client.getAutonomousArtifacts(planId);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting artifacts:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get artifacts',
      });
    }
  }

  /**
   * GET /api/autonomous/capabilities
   * Get all capabilities
   */
  async getCapabilities(req: Request, res: Response) {
    try {
      const result = await this.client.getAutonomousCapabilities();
      res.json(result);
    } catch (error: any) {
      console.error('Error getting capabilities:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get capabilities',
      });
    }
  }

  /**
   * GET /api/autonomous/notifications
   * Get all notifications
   */
  async getNotifications(req: Request, res: Response) {
    try {
      const result = await this.client.getAutonomousNotifications();
      res.json(result);
    } catch (error: any) {
      console.error('Error getting notifications:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get notifications',
      });
    }
  }
}
