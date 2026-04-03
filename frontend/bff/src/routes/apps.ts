import { Request, Response } from 'express';
import { OpenClawClient } from '../client';
import { z } from 'zod';

const CreateAppSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(['web', 'api', 'cli', 'fullstack']).optional(),
  framework: z.enum(['react', 'nextjs', 'express', 'vite', 'vue', 'svelte', 'custom']).optional(),
  requirements: z.string().min(1),
  autoStart: z.boolean().optional(),
  autoTest: z.boolean().optional(),
});

const RunTestsSchema = z.object({
  appId: z.string().min(1),
  types: z.array(z.enum(['unit', 'integration', 'e2e', 'visual', 'health'])).optional(),
});

export class AppRoutes {
  constructor(private client: OpenClawClient) {}

  /**
   * POST /api/apps/create
   * Create a new app with auto-generation
   */
  async createApp(req: Request, res: Response) {
    try {
      const validation = CreateAppSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors,
        });
      }

      const result = await this.client.createApp(validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error creating app:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create app',
      });
    }
  }

  /**
   * GET /api/apps
   * Get all apps
   */
  async listApps(req: Request, res: Response) {
    try {
      const result = await this.client.listApps();
      res.json(result);
    } catch (error: any) {
      console.error('Error listing apps:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list apps',
      });
    }
  }

  /**
   * GET /api/apps/:id
   * Get app details
   */
  async getApp(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.getApp(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting app:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get app',
      });
    }
  }

  /**
   * POST /api/apps/:id/start
   * Start an app
   */
  async startApp(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.startApp(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error starting app:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start app',
      });
    }
  }

  /**
   * POST /api/apps/:id/stop
   * Stop an app
   */
  async stopApp(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.stopApp(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error stopping app:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to stop app',
      });
    }
  }

  /**
   * POST /api/apps/:id/restart
   * Restart an app
   */
  async restartApp(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.restartApp(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error restarting app:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to restart app',
      });
    }
  }

  /**
   * POST /api/apps/:id/test
   * Run tests on an app
   */
  async runTests(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.runAppTests(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error running tests:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to run tests',
      });
    }
  }

  /**
   * GET /api/apps/:id/logs
   * Get app logs
   */
  async getAppLogs(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const result = await this.client.getAppLogs(id, limit);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting app logs:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get app logs',
      });
    }
  }

  /**
   * GET /api/apps/:id/status
   * Get app status
   */
  async getAppStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.getAppStatus(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting app status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get app status',
      });
    }
  }

  /**
   * GET /api/apps/stats
   * Get orchestrator stats
   */
  async getStats(req: Request, res: Response) {
    try {
      const result = await this.client.getAppStats();
      res.json(result);
    } catch (error: any) {
      console.error('Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get stats',
      });
    }
  }
}
