import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';

// ============================================================================
// PERMISSION MANAGER - Human-in-the-Loop Control System
// ============================================================================

/**
 * Permission types
 */
export type PermissionType =
  | 'computer' // Full desktop control (keyboard, mouse, apps)
  | 'browser' // Chrome/browser control (navigation, screenshots)
  | 'terminal' // Terminal command execution
  | 'file_system' // File read/write operations
  | 'network' // Network requests
  | 'camera' // Screen capture
  | 'notifications' // Send notifications
  | 'self_improve'; // Self-modification

/**
 * Permission scope
 */
export interface PermissionScope {
  type: PermissionType;
  level: 'none' | 'ask' | 'allow_once' | 'allow_session' | 'allow_always';
  description: string;
  actions: string[];
  expiresAt?: Date;
  grantedAt?: Date;
}

/**
 * Permission request
 */
export interface PermissionRequest {
  id: string;
  type: PermissionType;
  action: string;
  description: string;
  details: Record<string, any>;
  status: 'pending' | 'approved' | 'denied' | 'timeout';
  requestedAt: Date;
  respondedAt?: Date;
  response?: 'approved' | 'denied';
  timeout: number; // milliseconds
}

/**
 * Permission event
 */
export interface PermissionEvent {
  id: string;
  type: PermissionType;
  action: string;
  status: 'granted' | 'denied' | 'revoked';
  timestamp: Date;
  details: Record<string, any>;
}

/**
 * PermissionManager - Controls access to sensitive operations
 */
export class PermissionManager extends EventEmitter {
  private permissions: Map<PermissionType, PermissionScope> = new Map();
  private pendingRequests: Map<string, PermissionRequest> = new Map();
  private eventLog: Map<string, PermissionEvent> = new Map();
  private logger: Logger;

  constructor() {
    super();
    this.logger = new Logger('PermissionManager');
    this.initializeDefaultPermissions();
  }

  /**
   * Initialize default permissions (all disabled for safety)
   */
  private initializeDefaultPermissions(): void {
    const defaultScopes: PermissionScope[] = [
      {
        type: 'computer',
        level: 'ask',
        description: 'Control computer (keyboard, mouse, applications)',
        actions: [
          'type_text',
          'click_element',
          'drag_element',
          'scroll',
          'open_application',
          'close_application',
          'switch_window',
          'take_screenshot',
          'record_screen',
        ],
      },
      {
        type: 'browser',
        level: 'ask',
        description: 'Control browser (Chrome navigation, tabs, automation)',
        actions: [
          'navigate',
          'click',
          'type',
          'scroll',
          'screenshot',
          'open_tab',
          'close_tab',
          'switch_tab',
          'get_html',
          'fill_form',
          'submit_form',
          'extract_text',
        ],
      },
      {
        type: 'terminal',
        level: 'ask',
        description: 'Execute terminal commands',
        actions: ['run_command', 'run_script', 'install_package'],
      },
      {
        type: 'file_system',
        level: 'ask',
        description: 'Read and write files',
        actions: ['read_file', 'write_file', 'edit_file', 'delete_file', 'create_directory'],
      },
      {
        type: 'network',
        level: 'ask',
        description: 'Make network requests',
        actions: ['fetch_url', 'api_call', 'webhook'],
      },
      {
        type: 'camera',
        level: 'none',
        description: 'Capture screen or camera',
        actions: ['capture_screen', 'capture_camera'],
      },
      {
        type: 'notifications',
        level: 'allow_always',
        description: 'Send notifications',
        actions: ['notify_user', 'send_message'],
      },
      {
        type: 'self_improve',
        level: 'ask',
        description: 'Modify agent capabilities',
        actions: ['add_capability', 'remove_capability', 'update_code'],
      },
    ];

    for (const scope of defaultScopes) {
      this.permissions.set(scope.type, scope);
    }

    this.logger.info('Default permissions initialized');
  }

  // ============================================================================
  // PERMISSION CHECKING
  // ============================================================================

  /**
   * Check if an action is permitted
   */
  async checkPermission(
    type: PermissionType,
    action: string,
    details: Record<string, any> = {}
  ): Promise<{ permitted: boolean; requestId?: string }> {
    const scope = this.permissions.get(type);

    if (!scope) {
      this.logger.warn(`Unknown permission type: ${type}`);
      return { permitted: false };
    }

    // Check if action is in scope
    if (!scope.actions.includes(action) && !scope.actions.includes('*')) {
      this.logger.warn(`Action not in scope: ${action} for ${type}`);
      return { permitted: false };
    }

    // Check permission level
    switch (scope.level) {
      case 'none':
        this.logEvent(type, action, 'denied', { reason: 'Permission disabled' });
        return { permitted: false };

      case 'allow_always':
        this.logEvent(type, action, 'granted', { reason: 'Always allowed' });
        return { permitted: true };

      case 'allow_session':
        if (scope.expiresAt && scope.expiresAt > new Date()) {
          this.logEvent(type, action, 'granted', { reason: 'Session allowed' });
          return { permitted: true };
        }
        return await this.requestPermission(type, action, details);

      case 'allow_once':
        if (scope.expiresAt && scope.expiresAt > new Date()) {
          this.logEvent(type, action, 'granted', { reason: 'One-time allowed' });
          // Clear after use
          scope.level = 'ask';
          scope.expiresAt = undefined;
          return { permitted: true };
        }
        return await this.requestPermission(type, action, details);

      case 'ask':
      default:
        // Request permission from user
        return await this.requestPermission(type, action, details);
    }
  }

  /**
   * Request permission from user (shows UI prompt)
   */
  private async requestPermission(
    type: PermissionType,
    action: string,
    details: Record<string, any>
  ): Promise<{ permitted: boolean; requestId: string }> {
    const request: PermissionRequest = {
      id: uuidv4(),
      type,
      action,
      description: this.getActionDescription(type, action),
      details,
      status: 'pending',
      requestedAt: new Date(),
      timeout: 30000, // 30 seconds
    };

    this.pendingRequests.set(request.id, request);

    // Emit event for UI to handle
    this.emit('permission:request', request);

    this.logger.info(`Permission requested: ${type}/${action}`, { requestId: request.id });

    // Wait for response or timeout
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        if (request.status === 'pending') {
          request.status = 'timeout';
          this.pendingRequests.delete(request.id);
          this.logEvent(type, action, 'denied', { reason: 'Timeout' });
          resolve({ permitted: false, requestId: request.id });
        }
      }, request.timeout);

      // Listen for response
      const handler = (response: PermissionRequest) => {
        if (response.id === request.id) {
          clearTimeout(timeout);
          this.removeListener('permission:response', handler);
          this.pendingRequests.delete(request.id);

          const permitted = response.status === 'approved';
          this.logEvent(type, action, permitted ? 'granted' : 'denied', {
            requestId: request.id,
          });

          resolve({ permitted, requestId: request.id });
        }
      };

      this.on('permission:response', handler);
    });
  }

  // ============================================================================
  // PERMISSION GRANTING (User Actions)
  // ============================================================================

  /**
   * Approve a pending permission request
   */
  approve(requestId: string, duration?: 'once' | 'session'): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'approved';
    request.response = 'approved';
    request.respondedAt = new Date();

    // Update permission scope if duration specified
    if (duration) {
      const scope = this.permissions.get(request.type);
      if (scope) {
        scope.level = duration === 'once' ? 'allow_once' : 'allow_session';
        scope.grantedAt = new Date();
        scope.expiresAt =
          duration === 'session'
            ? new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
            : new Date(Date.now() + 60 * 1000); // 1 minute for once
      }
    }

    this.emit('permission:response', request);
    this.logger.info(`Permission approved: ${requestId}`);
    return true;
  }

  /**
   * Deny a pending permission request
   */
  deny(requestId: string): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'denied';
    request.response = 'denied';
    request.respondedAt = new Date();

    this.emit('permission:response', request);
    this.logger.info(`Permission denied: ${requestId}`);
    return true;
  }

  /**
   * Grant permission for a type (manual override)
   */
  grantPermission(type: PermissionType, level: PermissionScope['level']): void {
    const scope = this.permissions.get(type);
    if (scope) {
      scope.level = level;
      scope.grantedAt = new Date();

      if (level === 'allow_session') {
        scope.expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      } else if (level === 'allow_once') {
        scope.expiresAt = new Date(Date.now() + 60 * 1000);
      }

      this.emit('permission:updated', scope);
      this.logger.info(`Permission granted: ${type} = ${level}`);
    }
  }

  /**
   * Revoke permission for a type
   */
  revokePermission(type: PermissionType): void {
    const scope = this.permissions.get(type);
    if (scope) {
      scope.level = 'ask';
      scope.expiresAt = undefined;
      this.emit('permission:updated', scope);
      this.logger.info(`Permission revoked: ${type}`);
    }
  }

  /**
   * Grant COMPUTER permission (Computer Button)
   */
  grantComputer(level: PermissionScope['level'] = 'allow_session'): void {
    this.grantPermission('computer', level);
    this.emit('permission:computer_granted', { level });
  }

  /**
   * Grant BROWSER permission (Browser Button)
   */
  grantBrowser(level: PermissionScope['level'] = 'allow_session'): void {
    this.grantPermission('browser', level);
    this.emit('permission:browser_granted', { level });
  }

  /**
   * Revoke COMPUTER permission
   */
  revokeComputer(): void {
    this.revokePermission('computer');
    this.emit('permission:computer_revoked', {});
  }

  /**
   * Revoke BROWSER permission
   */
  revokeBrowser(): void {
    this.revokePermission('browser');
    this.emit('permission:browser_revoked', {});
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get all permissions
   */
  getAllPermissions(): PermissionScope[] {
    return Array.from(this.permissions.values());
  }

  /**
   * Get permission by type
   */
  getPermission(type: PermissionType): PermissionScope | undefined {
    return this.permissions.get(type);
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): PermissionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Get permission event log
   */
  getEventLog(limit: number = 100): PermissionEvent[] {
    return Array.from(this.eventLog.values()).slice(-limit);
  }

  /**
   * Check if COMPUTER is enabled
   */
  isComputerEnabled(): boolean {
    const scope = this.permissions.get('computer');
    return scope?.level !== 'none';
  }

  /**
   * Check if BROWSER is enabled
   */
  isBrowserEnabled(): boolean {
    const scope = this.permissions.get('browser');
    return scope?.level !== 'none';
  }

  /**
   * Get current permission states for UI
   */
  getPermissionStates(): Record<
    PermissionType,
    {
      enabled: boolean;
      level: string;
      description: string;
    }
  > {
    const states: Record<string, any> = {};

    for (const [type, scope] of this.permissions) {
      states[type] = {
        enabled: scope.level !== 'none',
        level: scope.level,
        description: scope.description,
      };
    }

    return states;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getActionDescription(type: PermissionType, action: string): string {
    const descriptions: Record<string, Record<string, string>> = {
      computer: {
        type_text: 'Type text using keyboard',
        click_element: 'Click on screen element',
        open_application: 'Open an application',
        take_screenshot: 'Take a screenshot',
      },
      browser: {
        navigate: 'Navigate to a URL',
        click: 'Click on a webpage element',
        type: 'Type text in a webpage',
        screenshot: 'Take a browser screenshot',
      },
      terminal: {
        run_command: 'Execute a terminal command',
      },
      file_system: {
        read_file: 'Read a file',
        write_file: 'Write to a file',
        edit_file: 'Edit a file',
      },
      network: {
        fetch_url: 'Fetch a URL',
        api_call: 'Make an API call',
      },
    };

    return descriptions[type]?.[action] || `${type}: ${action}`;
  }

  private logEvent(
    type: PermissionType,
    action: string,
    status: PermissionEvent['status'],
    details: Record<string, any>
  ): void {
    const event: PermissionEvent = {
      id: uuidv4(),
      type,
      action,
      status,
      timestamp: new Date(),
      details,
    };

    this.eventLog.set(event.id, event);
    this.emit('permission:event', event);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let _permissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!_permissionManager) {
    _permissionManager = new PermissionManager();
  }
  return _permissionManager;
}
