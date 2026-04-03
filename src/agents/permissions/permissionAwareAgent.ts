import { Logger } from '../../utils/logger';
import { PermissionManager, PermissionType, PermissionScope } from './permissionManager';
import { ExecutionLogger } from '../../computer-use/executionLogger';

// ============================================================================
// PERMISSION-AWARE AGENT - Wraps actions with permission checks
// ============================================================================

/**
 * Action that requires permission
 */
interface PermissionAction {
  type: PermissionType;
  action: string;
  params: any;
  execute: () => Promise<any>;
}

/**
 * PermissionAwareAgent wraps all agent actions with permission checks
 */
export class PermissionAwareAgent {
  private permissionManager: PermissionManager;
  private executionLogger: ExecutionLogger;
  private logger: Logger;

  constructor(permissionManager: PermissionManager, executionLogger: ExecutionLogger) {
    this.permissionManager = permissionManager;
    this.executionLogger = executionLogger;
    this.logger = new Logger('PermissionAwareAgent');

    // Listen for permission events
    this.permissionManager.on('permission:event', event => {
      this.executionLogger.browser(
        event.status === 'granted' ? 'info' : 'warn',
        `Permission ${event.status}: ${event.type}/${event.action}`,
        event.details
      );
    });
  }

  // ============================================================================
  // COMPUTER ACTIONS (Require Computer Permission)
  // ============================================================================

  /**
   * Type text (requires computer permission)
   */
  async typeText(text: string, element?: any): Promise<any> {
    return this.executeWithPermission({
      type: 'computer',
      action: 'type_text',
      params: { text, element },
      execute: async () => {
        this.logger.info(`Typing text: ${text.substring(0, 50)}...`);
        // Actual implementation would call WindowsControl.typeText
        return { success: true, text };
      },
    });
  }

  /**
   * Click element (requires computer permission)
   */
  async clickElement(element: any): Promise<any> {
    return this.executeWithPermission({
      type: 'computer',
      action: 'click_element',
      params: { element },
      execute: async () => {
        this.logger.info(`Clicking element: ${element.name || element}`);
        // Actual implementation would call WindowsControl.clickElement
        return { success: true, element };
      },
    });
  }

  /**
   * Open application (requires computer permission)
   */
  async openApplication(appName: string): Promise<any> {
    return this.executeWithPermission({
      type: 'computer',
      action: 'open_application',
      params: { appName },
      execute: async () => {
        this.logger.info(`Opening application: ${appName}`);
        // Actual implementation would call WindowsControl.launchApplication
        return { success: true, appName };
      },
    });
  }

  /**
   * Close application (requires computer permission)
   */
  async closeApplication(appName: string): Promise<any> {
    return this.executeWithPermission({
      type: 'computer',
      action: 'close_application',
      params: { appName },
      execute: async () => {
        this.logger.info(`Closing application: ${appName}`);
        return { success: true, appName };
      },
    });
  }

  /**
   * Take screenshot (requires camera permission)
   */
  async takeScreenshot(): Promise<any> {
    return this.executeWithPermission({
      type: 'camera',
      action: 'capture_screen',
      params: {},
      execute: async () => {
        this.logger.info('Taking screenshot');
        return { success: true, screenshot: 'base64_data' };
      },
    });
  }

  // ============================================================================
  // BROWSER ACTIONS (Require Browser Permission)
  // ============================================================================

  /**
   * Navigate to URL (requires browser permission)
   */
  async browserNavigate(url: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'navigate',
      params: { url },
      execute: async () => {
        this.logger.info(`Navigating to: ${url}`);
        return { success: true, url };
      },
    });
  }

  /**
   * Click in browser (requires browser permission)
   */
  async browserClick(selector: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'click',
      params: { selector },
      execute: async () => {
        this.logger.info(`Browser click: ${selector}`);
        return { success: true, selector };
      },
    });
  }

  /**
   * Type in browser (requires browser permission)
   */
  async browserType(text: string, selector?: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'type',
      params: { text, selector },
      execute: async () => {
        this.logger.info(`Browser type: ${text.substring(0, 50)}...`);
        return { success: true, text };
      },
    });
  }

  /**
   * Browser screenshot (requires browser permission)
   */
  async browserScreenshot(options?: { fullPage?: boolean }): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'screenshot',
      params: options,
      execute: async () => {
        this.logger.info('Taking browser screenshot');
        return { success: true, screenshot: 'base64_data' };
      },
    });
  }

  /**
   * Get browser HTML (requires browser permission)
   */
  async browserGetHtml(): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'get_html',
      params: {},
      execute: async () => {
        this.logger.info('Getting browser HTML');
        return { success: true, html: '<html>...</html>' };
      },
    });
  }

  /**
   * Fill form in browser (requires browser permission)
   */
  async browserFillForm(formData: Record<string, string>): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'fill_form',
      params: { formData },
      execute: async () => {
        this.logger.info('Filling browser form');
        return { success: true, formData };
      },
    });
  }

  /**
   * Submit form in browser (requires browser permission)
   */
  async browserSubmitForm(selector?: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'submit_form',
      params: { selector },
      execute: async () => {
        this.logger.info('Submitting browser form');
        return { success: true };
      },
    });
  }

  /**
   * Extract text from browser (requires browser permission)
   */
  async browserExtractText(selector?: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'extract_text',
      params: { selector },
      execute: async () => {
        this.logger.info('Extracting text from browser');
        return { success: true, text: 'extracted text' };
      },
    });
  }

  /**
   * Open new browser tab (requires browser permission)
   */
  async browserOpenTab(url?: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'open_tab',
      params: { url },
      execute: async () => {
        this.logger.info(`Opening browser tab: ${url || 'new tab'}`);
        return { success: true, tabId: 'tab_123' };
      },
    });
  }

  /**
   * Close browser tab (requires browser permission)
   */
  async browserCloseTab(tabId: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'close_tab',
      params: { tabId },
      execute: async () => {
        this.logger.info(`Closing browser tab: ${tabId}`);
        return { success: true };
      },
    });
  }

  /**
   * Switch browser tab (requires browser permission)
   */
  async browserSwitchTab(tabId: string): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'switch_tab',
      params: { tabId },
      execute: async () => {
        this.logger.info(`Switching to browser tab: ${tabId}`);
        return { success: true };
      },
    });
  }

  /**
   * Scroll in browser (requires browser permission)
   */
  async browserScroll(direction: 'up' | 'down', amount?: number): Promise<any> {
    return this.executeWithPermission({
      type: 'browser',
      action: 'scroll',
      params: { direction, amount },
      execute: async () => {
        this.logger.info(`Browser scroll: ${direction}`);
        return { success: true };
      },
    });
  }

  // ============================================================================
  // TERMINAL ACTIONS (Require Terminal Permission)
  // ============================================================================

  /**
   * Run terminal command (requires terminal permission)
   */
  async runCommand(command: string, cwd?: string): Promise<any> {
    return this.executeWithPermission({
      type: 'terminal',
      action: 'run_command',
      params: { command, cwd },
      execute: async () => {
        this.logger.info(`Running command: ${command}`);
        return { success: true, command, output: '' };
      },
    });
  }

  // ============================================================================
  // FILE SYSTEM ACTIONS (Require File System Permission)
  // ============================================================================

  /**
   * Read file (requires file system permission)
   */
  async readFile(filePath: string): Promise<any> {
    return this.executeWithPermission({
      type: 'file_system',
      action: 'read_file',
      params: { path: filePath },
      execute: async () => {
        this.logger.info(`Reading file: ${filePath}`);
        return { success: true, path: filePath, content: '' };
      },
    });
  }

  /**
   * Write file (requires file system permission)
   */
  async writeFile(filePath: string, content: string): Promise<any> {
    return this.executeWithPermission({
      type: 'file_system',
      action: 'write_file',
      params: { path: filePath, content },
      execute: async () => {
        this.logger.info(`Writing file: ${filePath}`);
        return { success: true, path: filePath };
      },
    });
  }

  /**
   * Edit file (requires file system permission)
   */
  async editFile(filePath: string, oldText: string, newText: string): Promise<any> {
    return this.executeWithPermission({
      type: 'file_system',
      action: 'edit_file',
      params: { path: filePath, oldText, newText },
      execute: async () => {
        this.logger.info(`Editing file: ${filePath}`);
        return { success: true, path: filePath };
      },
    });
  }

  // ============================================================================
  // CORE PERMISSION EXECUTION
  // ============================================================================

  /**
   * Execute an action with permission check
   */
  private async executeWithPermission(action: PermissionAction): Promise<any> {
    // Check permission
    const { permitted, requestId } = await this.permissionManager.checkPermission(
      action.type,
      action.action,
      action.params
    );

    if (!permitted) {
      const error = `Permission denied for ${action.type}/${action.action}`;
      this.logger.warn(error);
      this.executionLogger.browser('warn', error, { requestId });
      throw new Error(error);
    }

    // Execute the action
    try {
      const result = await action.execute();
      return result;
    } catch (error) {
      this.executionLogger.browser('error', `Action failed: ${action.action}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get permission manager (for UI integration)
   */
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let _permissionAwareAgent: PermissionAwareAgent | null = null;

export function getPermissionAwareAgent(
  permissionManager: PermissionManager,
  executionLogger: ExecutionLogger
): PermissionAwareAgent {
  if (!_permissionAwareAgent) {
    _permissionAwareAgent = new PermissionAwareAgent(permissionManager, executionLogger);
  }
  return _permissionAwareAgent;
}
