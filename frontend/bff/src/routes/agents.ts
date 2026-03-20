import { Request, Response } from 'express';
import { OpenClawClient } from '../client';
import { z } from 'zod';

const CreateAgentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['main', 'sub', 'specialized']),
  modelConfig: z.object({
    provider: z.string(),
    modelId: z.string(),
    parameters: z.object({
      temperature: z.number(),
      maxTokens: z.number(),
      topP: z.number().optional()
    })
  }),
  capabilities: z.array(z.string()),
  parentAgentId: z.string().optional(),
  metadata: z.any().optional()
});

const UpdateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'idle', 'busy', 'error']).optional(),
  capabilities: z.array(z.string()).optional(),
  metadata: z.any().optional()
});

const SetModelSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  parameters: z.object({
    temperature: z.number(),
    maxTokens: z.number(),
    topP: z.number().optional()
  })
});

export class AgentRoutes {
  constructor(private client: OpenClawClient) {}

  async listAgents(req: Request, res: Response) {
    try {
      const { type, status } = req.query;
      const result = await this.client.listAgents({
        type: type as string,
        status: status as string
      });
      res.json(result);
    } catch (error: any) {
      console.error('Error listing agents:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list agents'
      });
    }
  }

  async getAgent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.getAgent(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting agent:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get agent'
      });
    }
  }

  async createAgent(req: Request, res: Response) {
    try {
      const validation = CreateAgentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }

      const result = await this.client.createAgent(validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error creating agent:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create agent'
      });
    }
  }

  async updateAgent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validation = UpdateAgentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }

      const result = await this.client.updateAgent(id, validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error updating agent:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update agent'
      });
    }
  }

  async deleteAgent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.client.deleteAgent(id);
      res.json(result);
    } catch (error: any) {
      console.error('Error deleting agent:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete agent'
      });
    }
  }

  async setAgentModel(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validation = SetModelSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }

      const result = await this.client.setAgentModel(id, validation.data);
      res.json(result);
    } catch (error: any) {
      console.error('Error setting agent model:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to set agent model'
      });
    }
  }
}
