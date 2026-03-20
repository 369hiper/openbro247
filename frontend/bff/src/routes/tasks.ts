import { Request, Response } from 'express';
import { OpenClawClient } from '../client';
import { z } from 'zod';

const CreateTaskSchema = z.object({
  agentId: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  metadata: z.any().optional()
});

const UpdateTaskSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
  result: z.any().optional(),
  error: z.string().optional()
});

export class TaskRoutes {
  constructor(private client: OpenClawClient) {}

  async listTasks(req: Request, res: Response) {
    try {
      const { agentId, status, priority } = req.query;
      const result = await this.client.listTasks({
        agentId: agentId as string,
        status: status as string,
        priority: priority as string
      });
      res.json(result);
    } catch (error: any) {
      console.error('Error listing tasks:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list tasks'
      });
    }
  }

  async getTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.getTask(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting task:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get task'
      });
    }
  }

  async createTask(req: Request, res: Response) {
    try {
      const validation = CreateTaskSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }

      const result = await this.client.createTask(validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error creating task:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create task'
      });
    }
  }

  async updateTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validation = UpdateTaskSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }

      const result = await this.client.updateTask(id, validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error updating task:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update task'
      });
    }
  }

  async deleteTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.deleteTask(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error deleting task:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete task'
      });
    }
  }

  async assignTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { agentId } = req.body;

      if (!agentId) {
        return res.status(400).json({
          success: false,
          error: 'agentId is required'
        });
      }

      const result = await this.client.assignTask(id, agentId);
      res.json(result);
    } catch (error: any) {
      console.error('Error assigning task:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to assign task'
      });
    }
  }
}
