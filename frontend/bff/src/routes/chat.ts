import { Request, Response } from 'express';
import { OpenClawClient } from '../client';
import { z } from 'zod';

const CreateSessionSchema = z.object({
  agentId: z.string().min(1),
  metadata: z.any().optional()
});

const SendMessageSchema = z.object({
  content: z.string().min(1),
  metadata: z.any().optional()
});

export class ChatRoutes {
  constructor(private client: OpenClawClient) {}

  async listSessions(req: Request, res: Response) {
    try {
      const { agentId } = req.query;
      const result = await this.client.listSessions(agentId as string);
      res.json(result);
    } catch (error: any) {
      console.error('Error listing chat sessions:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list chat sessions'
      });
    }
  }

  async getSession(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.getSession(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting chat session:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get chat session'
      });
    }
  }

  async createSession(req: Request, res: Response) {
    try {
      const validation = CreateSessionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }

      const result = await this.client.createSession(validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error creating chat session:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create chat session'
      });
    }
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validation = SendMessageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }

      const result = await this.client.sendMessage(id, validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send message'
      });
    }
  }

  async deleteSession(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.deleteSession(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error deleting chat session:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete chat session'
      });
    }
  }
}
