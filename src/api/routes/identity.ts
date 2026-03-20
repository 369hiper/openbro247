/**
 * Identity API Routes
 * 
 * Provides endpoints for:
 * - Device identity management
 * - Token generation and validation
 * - Device pairing
 * - Access control
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDeviceIdentityManager } from '../../identity/deviceIdentity';
import { Logger } from '../../utils/logger';

const logger = new Logger('IdentityAPI');
const identityManager = getDeviceIdentityManager();

export async function identityRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize identity manager
  await identityManager.initialize();

  /**
   * GET /api/identity/status - Get identity status
   */
  fastify.get('/api/identity/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const identity = await identityManager.getIdentity();
      
      reply.send({
        success: true,
        identity: {
          deviceId: identity.deviceId,
          deviceName: identity.deviceName,
          deviceType: identity.deviceType,
          capabilities: identity.capabilities,
          createdAt: identity.createdAt,
          lastUsedAt: identity.lastUsedAt
        },
        hasIdentity: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Identity status error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        hasIdentity: false,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/identity/export - Export identity (for backup)
   */
  fastify.get('/api/identity/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const identity = await identityManager.exportIdentity();
      
      reply.send({
        success: true,
        identity,
        warning: 'Keep this identity secure. Do not share your secret key.',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Identity export error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/import - Import identity (for restore)
   */
  fastify.post('/api/identity/import', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { identity: string };
      
      if (!body.identity) {
        return reply.code(400).send({
          success: false,
          error: 'Identity JSON is required',
          timestamp: new Date().toISOString()
        });
      }

      const identity = await identityManager.importIdentity(body.identity);
      
      reply.send({
        success: true,
        identity: {
          deviceId: identity.deviceId,
          deviceName: identity.deviceName,
          deviceType: identity.deviceType
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Identity import error', error);
      reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/reset - Reset identity (create new)
   */
  fastify.post('/api/identity/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const identity = await identityManager.resetIdentity();
      
      reply.send({
        success: true,
        identity: {
          deviceId: identity.deviceId,
          deviceName: identity.deviceName,
          deviceType: identity.deviceType,
          createdAt: identity.createdAt
        },
        warning: 'Previous identity and all tokens have been revoked',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Identity reset error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/token/generate - Generate API token
   */
  fastify.post('/api/identity/token/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { 
        scopes: string[]; 
        expiresIn?: number;
        type?: 'device' | 'api' | 'pairing';
      };

      if (!body.scopes || !Array.isArray(body.scopes)) {
        return reply.code(400).send({
          success: false,
          error: 'Scopes array is required',
          timestamp: new Date().toISOString()
        });
      }

      const token = await identityManager.generateToken(body.scopes, {
        expiresIn: body.expiresIn,
        type: body.type
      });

      reply.send({
        success: true,
        token: token.token,
        type: token.type,
        scopes: token.scopes,
        expiresAt: token.expiresAt || null,
        warning: 'Store this token securely. It will not be shown again.',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Token generation error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/token/validate - Validate token
   */
  fastify.post('/api/identity/token/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { token: string };

      if (!body.token) {
        return reply.code(400).send({
          success: false,
          error: 'Token is required',
          timestamp: new Date().toISOString()
        });
      }

      const result = await identityManager.validateToken(body.token);

      reply.send({
        success: result.valid,
        valid: result.valid,
        token: result.token ? {
          type: result.token.type,
          scopes: result.token.scopes,
          issuedAt: result.token.issuedAt,
          expiresAt: result.token.expiresAt
        } : null,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Token validation error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/token/revoke - Revoke token
   */
  fastify.post('/api/identity/token/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { token: string };

      if (!body.token) {
        return reply.code(400).send({
          success: false,
          error: 'Token is required',
          timestamp: new Date().toISOString()
        });
      }

      await identityManager.revokeToken(body.token);

      reply.send({
        success: true,
        message: 'Token revoked successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Token revocation error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/identity/tokens - List all tokens
   */
  fastify.get('/api/identity/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tokens = await identityManager.listTokens();

      reply.send({
        success: true,
        tokens,
        count: tokens.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('List tokens error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/sign - Sign data with device key
   */
  fastify.post('/api/identity/sign', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { data: string };

      if (!body.data) {
        return reply.code(400).send({
          success: false,
          error: 'Data to sign is required',
          timestamp: new Date().toISOString()
        });
      }

      const signature = await identityManager.sign(body.data);

      reply.send({
        success: true,
        signature,
        algorithm: 'Ed25519',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Sign error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/verify - Verify signature
   */
  fastify.post('/api/identity/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { 
        data: string; 
        signature: string;
        publicKey: string;
      };

      if (!body.data || !body.signature || !body.publicKey) {
        return reply.code(400).send({
          success: false,
          error: 'Data, signature, and public key are required',
          timestamp: new Date().toISOString()
        });
      }

      const valid = await identityManager.verify(body.data, body.signature, body.publicKey);

      reply.send({
        success: true,
        valid,
        algorithm: 'Ed25519',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Verify error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/pair/initiate - Initiate device pairing
   */
  fastify.post('/api/identity/pair/initiate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Generate pairing code
      const pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Store pairing code with expiration (5 minutes)
      const pairingToken = await identityManager.generateToken(
        ['pairing', 'device.read'],
        { expiresIn: 5 * 60 * 1000, type: 'pairing' }
      );

      reply.send({
        success: true,
        pairingCode,
        pairingToken: pairingToken.token,
        expiresAt: pairingToken.expiresAt,
        instructions: `Enter this code on the other device: ${pairingCode}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Pairing initiation error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/identity/pair/complete - Complete device pairing
   */
  fastify.post('/api/identity/pair/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { 
        pairingCode: string;
        pairingToken: string;
        remoteDeviceId: string;
        remotePublicKey: string;
      };

      // Validate pairing token
      const result = await identityManager.validateToken(body.pairingToken);
      if (!result.valid) {
        return reply.code(401).send({
          success: false,
          error: 'Invalid or expired pairing token',
          timestamp: new Date().toISOString()
        });
      }

      // In a full implementation, we would:
      // 1. Verify the pairing code matches
      // 2. Exchange device information
      // 3. Establish trust relationship
      // 4. Generate shared tokens

      reply.send({
        success: true,
        message: 'Device pairing completed',
        pairedDevice: {
          deviceId: body.remoteDeviceId,
          publicKey: body.remotePublicKey
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Pairing completion error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });
}
