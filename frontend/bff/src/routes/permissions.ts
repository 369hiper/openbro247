import { Request, Response } from 'express';
import { z } from 'zod';

const GrantPermissionSchema = z.object({
  type: z.enum([
    'computer',
    'browser',
    'terminal',
    'file_system',
    'network',
    'camera',
    'notifications',
    'self_improve',
  ]),
  level: z.enum(['none', 'ask', 'allow_once', 'allow_session', 'allow_always']),
});

const ApproveRequestSchema = z.object({
  requestId: z.string().min(1),
  duration: z.enum(['once', 'session']).optional(),
});

// In-memory permission store (in production, use database)
interface PermissionScope {
  type: string;
  level: string;
  description: string;
  enabled: boolean;
  expiresAt?: string;
  grantedAt?: string;
}

let permissionStore: PermissionScope[] = [
  {
    type: 'computer',
    level: 'ask',
    description: 'Control computer (keyboard, mouse, applications)',
    enabled: false,
  },
  {
    type: 'browser',
    level: 'ask',
    description: 'Control browser (Chrome navigation, tabs, automation)',
    enabled: false,
  },
  {
    type: 'terminal',
    level: 'ask',
    description: 'Execute terminal commands',
    enabled: false,
  },
  {
    type: 'file_system',
    level: 'ask',
    description: 'Read and write files',
    enabled: false,
  },
  {
    type: 'network',
    level: 'ask',
    description: 'Make network requests',
    enabled: false,
  },
  {
    type: 'camera',
    level: 'none',
    description: 'Capture screen or camera',
    enabled: false,
  },
  {
    type: 'notifications',
    level: 'allow_always',
    description: 'Send notifications',
    enabled: true,
  },
  {
    type: 'self_improve',
    level: 'ask',
    description: 'Modify agent capabilities',
    enabled: false,
  },
];

let pendingRequests: any[] = [];

export class PermissionRoutes {
  /**
   * GET /api/permissions
   * Get all permissions
   */
  async getPermissions(req: Request, res: Response) {
    try {
      res.json({
        success: true,
        data: permissionStore,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get permissions',
      });
    }
  }

  /**
   * POST /api/permissions/grant
   * Grant a permission
   */
  async grantPermission(req: Request, res: Response) {
    try {
      const validation = GrantPermissionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors,
        });
      }

      const { type, level } = validation.data;
      const permission = permissionStore.find(p => p.type === type);

      if (permission) {
        permission.level = level;
        permission.enabled = level !== 'none';
        permission.grantedAt = new Date().toISOString();

        if (level === 'allow_session') {
          permission.expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        } else if (level === 'allow_once') {
          permission.expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
        } else {
          permission.expiresAt = undefined;
        }
      }

      res.json({
        success: true,
        data: permission,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to grant permission',
      });
    }
  }

  /**
   * POST /api/permissions/revoke
   * Revoke a permission
   */
  async revokePermission(req: Request, res: Response) {
    try {
      const { type } = req.body;
      const permission = permissionStore.find(p => p.type === type);

      if (permission) {
        permission.level = 'ask';
        permission.enabled = false;
        permission.expiresAt = undefined;
      }

      res.json({
        success: true,
        data: permission,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to revoke permission',
      });
    }
  }

  /**
   * POST /api/permissions/computer/grant
   * Grant COMPUTER permission (Computer Button)
   */
  async grantComputer(req: Request, res: Response) {
    try {
      const level = req.body.level || 'allow_session';
      const permission = permissionStore.find(p => p.type === 'computer');

      if (permission) {
        permission.level = level;
        permission.enabled = true;
        permission.grantedAt = new Date().toISOString();

        if (level === 'allow_session') {
          permission.expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        }
      }

      res.json({
        success: true,
        data: permission,
        message: 'Computer access granted',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to grant computer permission',
      });
    }
  }

  /**
   * POST /api/permissions/computer/revoke
   * Revoke COMPUTER permission
   */
  async revokeComputer(req: Request, res: Response) {
    try {
      const permission = permissionStore.find(p => p.type === 'computer');

      if (permission) {
        permission.level = 'none';
        permission.enabled = false;
        permission.expiresAt = undefined;
      }

      res.json({
        success: true,
        data: permission,
        message: 'Computer access revoked',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to revoke computer permission',
      });
    }
  }

  /**
   * POST /api/permissions/browser/grant
   * Grant BROWSER permission (Browser Button)
   */
  async grantBrowser(req: Request, res: Response) {
    try {
      const level = req.body.level || 'allow_session';
      const permission = permissionStore.find(p => p.type === 'browser');

      if (permission) {
        permission.level = level;
        permission.enabled = true;
        permission.grantedAt = new Date().toISOString();

        if (level === 'allow_session') {
          permission.expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        }
      }

      res.json({
        success: true,
        data: permission,
        message: 'Browser access granted',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to grant browser permission',
      });
    }
  }

  /**
   * POST /api/permissions/browser/revoke
   * Revoke BROWSER permission
   */
  async revokeBrowser(req: Request, res: Response) {
    try {
      const permission = permissionStore.find(p => p.type === 'browser');

      if (permission) {
        permission.level = 'none';
        permission.enabled = false;
        permission.expiresAt = undefined;
      }

      res.json({
        success: true,
        data: permission,
        message: 'Browser access revoked',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to revoke browser permission',
      });
    }
  }

  /**
   * GET /api/permissions/pending
   * Get pending permission requests
   */
  async getPending(req: Request, res: Response) {
    try {
      res.json({
        success: true,
        data: pendingRequests,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get pending requests',
      });
    }
  }

  /**
   * POST /api/permissions/approve
   * Approve a pending request
   */
  async approveRequest(req: Request, res: Response) {
    try {
      const validation = ApproveRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: validation.error.errors,
        });
      }

      const { requestId, duration } = validation.data;
      const requestIndex = pendingRequests.findIndex(r => r.id === requestId);

      if (requestIndex !== -1) {
        pendingRequests.splice(requestIndex, 1);
      }

      res.json({
        success: true,
        message: 'Request approved',
        data: { requestId, duration },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to approve request',
      });
    }
  }

  /**
   * POST /api/permissions/deny
   * Deny a pending request
   */
  async denyRequest(req: Request, res: Response) {
    try {
      const { requestId } = req.body;
      const requestIndex = pendingRequests.findIndex(r => r.id === requestId);

      if (requestIndex !== -1) {
        pendingRequests.splice(requestIndex, 1);
      }

      res.json({
        success: true,
        message: 'Request denied',
        data: { requestId },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to deny request',
      });
    }
  }
}
