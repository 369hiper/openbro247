/**
 * Device Identity Module
 * 
 * Provides cryptographic identity for OpenBro247 instances:
 * - Ed25519 key pair generation
 * - Device fingerprinting
 * - Secure identity storage
 * - Identity verification
 * 
 * @module identity/deviceIdentity
 */

import nacl from 'tweetnacl';
import { Logger } from '../utils/logger';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';

const logger = new Logger('DeviceIdentity');

/**
 * Device identity structure
 */
export interface DeviceIdentity {
  /** Unique device ID (UUID) */
  deviceId: string;
  /** Ed25519 public key (base64) */
  publicKey: string;
  /** Ed25519 secret key (base64) - KEEP SECRET */
  secretKey: string;
  /** Device name/label */
  deviceName: string;
  /** Device type */
  deviceType: 'desktop' | 'server' | 'mobile' | 'embedded';
  /** Created timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt: number;
  /** Capabilities */
  capabilities: string[];
}

/**
 * Scoped token for API access
 */
export interface ScopedToken {
  /** Token value */
  token: string;
  /** Token type */
  type: 'device' | 'api' | 'pairing';
  /** Scopes granted */
  scopes: string[];
  /** Issued at timestamp */
  issuedAt: number;
  /** Expires at timestamp (0 = never) */
  expiresAt: number;
  /** Issued to device ID */
  issuedTo: string;
  /** Issued by device ID */
  issuedBy: string;
}

/**
 * Identity storage paths
 */
const IDENTITY_DIR = join(process.cwd(), 'data', 'identity');
const IDENTITY_FILE = join(IDENTITY_DIR, 'device-identity.json');
const TOKENS_FILE = join(IDENTITY_DIR, 'tokens.json');

/**
 * Device Identity Manager
 */
export class DeviceIdentityManager {
  private identity: DeviceIdentity | null = null;
  private tokens: Map<string, ScopedToken> = new Map();

  /**
   * Get or create device identity
   */
  async getIdentity(): Promise<DeviceIdentity> {
    if (this.identity) {
      return this.identity;
    }

    // Try to load from disk
    if (existsSync(IDENTITY_FILE)) {
      try {
        const data = await readFile(IDENTITY_FILE, 'utf-8');
        this.identity = JSON.parse(data) as DeviceIdentity;
        logger.info(`Loaded device identity: ${this.identity.deviceId}`);
        return this.identity;
      } catch (error) {
        logger.error('Failed to load identity', error);
      }
    }

    // Create new identity
    this.identity = await this.createIdentity();
    return this.identity;
  }

  /**
   * Create new device identity
   */
  async createIdentity(): Promise<DeviceIdentity> {
    // Generate Ed25519 key pair
    const keyPair = nacl.sign.keyPair();
    
    // Generate device ID
    const deviceId = this.generateDeviceId();
    
    // Get device info
    const deviceInfo = await this.getDeviceInfo();
    
    const identity: DeviceIdentity = {
      deviceId,
      publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
      secretKey: Buffer.from(keyPair.secretKey).toString('base64'),
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      capabilities: deviceInfo.capabilities
    };

    // Save to disk
    await this.saveIdentity(identity);
    
    logger.info(`Created new device identity: ${deviceId}`);
    return identity;
  }

  /**
   * Save identity to disk
   */
  private async saveIdentity(identity: DeviceIdentity): Promise<void> {
    // Ensure directory exists
    if (!existsSync(IDENTITY_DIR)) {
      await mkdir(IDENTITY_DIR, { recursive: true });
    }

    // Write identity file (with restricted permissions conceptually)
    await writeFile(IDENTITY_FILE, JSON.stringify(identity, null, 2));
    
    // Set file permissions (Unix only - best effort)
    try {
      const { chmod } = await import('fs/promises');
      await chmod(IDENTITY_FILE, 0o600);
    } catch {
      // Windows doesn't support chmod
    }
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `openbro-${timestamp}-${random}`;
  }

  /**
   * Get device information
   */
  private async getDeviceInfo(): Promise<{
    deviceName: string;
    deviceType: 'desktop' | 'server' | 'mobile' | 'embedded';
    capabilities: string[];
  }> {
    const hostname = process.env.HOSTNAME || 'unknown';
    const platform = process.platform;
    
    let deviceType: 'desktop' | 'server' | 'mobile' | 'embedded' = 'server';
    let capabilities: string[] = [];

    if (platform === 'win32' || platform === 'darwin') {
      deviceType = 'desktop';
      capabilities = ['desktop-control', 'screen-capture', 'vision', 'browser-automation'];
    } else if (platform === 'linux') {
      // Could be desktop or server
      deviceType = 'desktop';
      capabilities = ['browser-automation', 'api-server'];
      if (process.env.DISPLAY) {
        capabilities.push('desktop-control', 'screen-capture');
      }
    }

    return {
      deviceName: `OpenBro247-${hostname}`,
      deviceType,
      capabilities
    };
  }

  /**
   * Sign data with device private key
   */
  async sign(data: Uint8Array | string): Promise<string> {
    const identity = await this.getIdentity();
    const secretKey = Buffer.from(identity.secretKey, 'base64');
    
    const dataBytes = typeof data === 'string' 
      ? new TextEncoder().encode(data)
      : data;
    
    const signature = nacl.sign.detached(dataBytes, secretKey);
    return Buffer.from(signature).toString('base64');
  }

  /**
   * Verify signature
   */
  async verify(
    data: Uint8Array | string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    const signatureBytes = Buffer.from(signature, 'base64');
    const publicKeyBytes = Buffer.from(publicKey, 'base64');
    const dataBytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    return nacl.sign.detached.verify(dataBytes, signatureBytes, publicKeyBytes);
  }

  /**
   * Generate scoped API token
   */
  async generateToken(
    scopes: string[],
    options?: { expiresIn?: number; type?: 'device' | 'api' | 'pairing' }
  ): Promise<ScopedToken> {
    const identity = await this.getIdentity();
    
    const token: ScopedToken = {
      token: randomBytes(32).toString('hex'),
      type: options?.type || 'api',
      scopes,
      issuedAt: Date.now(),
      expiresAt: options?.expiresIn ? Date.now() + options.expiresIn : 0,
      issuedTo: identity.deviceId,
      issuedBy: identity.deviceId
    };

    // Store token
    this.tokens.set(token.token, token);
    await this.saveTokens();

    logger.info(`Generated ${token.type} token with scopes: ${scopes.join(', ')}`);
    return token;
  }

  /**
   * Validate token
   */
  async validateToken(token: string): Promise<{ valid: boolean; token?: ScopedToken; error?: string }> {
    // Check in-memory tokens
    const storedToken = this.tokens.get(token);
    if (!storedToken) {
      return { valid: false, error: 'Token not found' };
    }

    // Check expiration
    if (storedToken.expiresAt > 0 && Date.now() > storedToken.expiresAt) {
      this.tokens.delete(token);
      await this.saveTokens();
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, token: storedToken };
  }

  /**
   * Check if token has scope
   */
  async hasScope(token: string, scope: string): Promise<boolean> {
    const result = await this.validateToken(token);
    if (!result.valid || !result.token) {
      return false;
    }

    // Check for admin scope (grants all permissions)
    if (result.token.scopes.includes('admin')) {
      return true;
    }

    return result.token.scopes.includes(scope);
  }

  /**
   * Revoke token
   */
  async revokeToken(token: string): Promise<void> {
    this.tokens.delete(token);
    await this.saveTokens();
    logger.info(`Revoked token`);
  }

  /**
   * List all tokens
   */
  async listTokens(): Promise<Array<Omit<ScopedToken, 'token'>>> {
    return Array.from(this.tokens.values()).map(({ token, ...rest }) => rest);
  }

  /**
   * Save tokens to disk
   */
  private async saveTokens(): Promise<void> {
    if (!existsSync(IDENTITY_DIR)) {
      await mkdir(IDENTITY_DIR, { recursive: true });
    }

    const tokensArray = Array.from(this.tokens.entries());
    await writeFile(TOKENS_FILE, JSON.stringify(tokensArray, null, 2));
  }

  /**
   * Load tokens from disk
   */
  private async loadTokens(): Promise<void> {
    if (existsSync(TOKENS_FILE)) {
      try {
        const data = await readFile(TOKENS_FILE, 'utf-8');
        const tokensArray = JSON.parse(data);
        this.tokens = new Map(tokensArray);
      } catch (error) {
        logger.error('Failed to load tokens', error);
      }
    }
  }

  /**
   * Initialize identity manager
   */
  async initialize(): Promise<DeviceIdentity> {
    await this.loadTokens();
    return this.getIdentity();
  }

  /**
   * Export identity (for backup)
   */
  async exportIdentity(): Promise<string> {
    const identity = await this.getIdentity();
    return JSON.stringify(identity);
  }

  /**
   * Import identity (for restore)
   */
  async importIdentity(json: string): Promise<DeviceIdentity> {
    const identity = JSON.parse(json) as DeviceIdentity;
    
    // Validate identity structure
    if (!identity.deviceId || !identity.publicKey || !identity.secretKey) {
      throw new Error('Invalid identity format');
    }

    await this.saveIdentity(identity);
    this.identity = identity;
    
    logger.info(`Imported device identity: ${identity.deviceId}`);
    return identity;
  }

  /**
   * Reset identity (create new)
   */
  async resetIdentity(): Promise<DeviceIdentity> {
    this.identity = null;
    this.tokens.clear();
    
    // Remove old files
    try {
      const { unlink } = await import('fs/promises');
      if (existsSync(IDENTITY_FILE)) {
        await unlink(IDENTITY_FILE);
      }
      if (existsSync(TOKENS_FILE)) {
        await unlink(TOKENS_FILE);
      }
    } catch {
      // Ignore errors
    }

    return this.createIdentity();
  }
}

// Singleton instance
let _identityManager: DeviceIdentityManager | null = null;

export function getDeviceIdentityManager(): DeviceIdentityManager {
  if (!_identityManager) {
    _identityManager = new DeviceIdentityManager();
  }
  return _identityManager;
}
