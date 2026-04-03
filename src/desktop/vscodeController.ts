/**
 * VS Code Controller
 * 
 * Controls Visual Studio Code via:
 * - VS Code CLI commands
 * - VS Code Server API
 * - Direct file manipulation
 * - Keyboard automation for complex operations
 * 
 * @module desktop/vscodeController
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '../utils/logger';
import { WindowsControl, getWindowsControl } from './windowsControl';
import { IDEController } from '../computer-use/types';

const execAsync = promisify(exec);

const logger = new Logger('VSCodeController');

/**
 * VS Code extension command types
 */
export interface VSCodeCommand {
  command: string;
  args?: any[];
}

/**
 * File edit operation
 */
export interface FileEdit {
  file: string;
  line?: number;
  column?: number;
  operation: 'insert' | 'replace' | 'delete' | 'append';
  content?: string;
  searchPattern?: string;
}

/**
 * VS Code Controller
 */
export class VSCodeController implements IDEController {
  private windowsControl: WindowsControl;
  private vscodePath: string = 'code';
  private isInitialized = false;

  constructor() {
    this.windowsControl = getWindowsControl();
  }

  /**
   * Initialize VS Code controller
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check if VS Code is installed
      await this.getVersion();
      this.isInitialized = true;
      logger.info('VSCodeController initialized');
    } catch (error) {
      logger.warn('VS Code not found in PATH, using default command', error);
      this.isInitialized = true;
    }
  }

  /**
   * Get VS Code version
   */
  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync(`${this.vscodePath} --version`);
      return stdout.trim().split('\n')[0];
    } catch (error) {
      throw new Error('VS Code not found. Ensure it is installed and in PATH.');
    }
  }

  /**
   * Open VS Code
   */
  async open(options?: { folder?: string; files?: string[]; newWindow?: boolean }): Promise<void> {
    const args: string[] = [];

    if (options?.newWindow) {
      args.push('-n');
    }

    if (options?.folder) {
      args.push(options.folder);
    }

    if (options?.files) {
      args.push(...options.files);
    }

    const command = `${this.vscodePath} ${args.join(' ')}`;
    await execAsync(command);
    logger.info(`Opened VS Code: ${command}`);

    // Wait for VS Code to launch
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Open a file in VS Code
   */
  async openFile(filePath: string, lineNumber?: number): Promise<void> {
    const args = lineNumber ? `-g ${filePath}:${lineNumber}` : filePath;
    await execAsync(`${this.vscodePath} ${args}`);
    logger.info(`Opened file: ${filePath}${lineNumber ? `:${lineNumber}` : ''}`);
  }

  /**
   * Open a folder/workspace in VS Code
   */
  async openFolder(folderPath: string): Promise<void> {
    await execAsync(`${this.vscodePath} "${folderPath}"`);
    logger.info(`Opened folder: ${folderPath}`);
  }

  /**
   * Execute VS Code command via command palette
   */
  async executeCommand(command: string, args?: any[]): Promise<void> {
    // First, focus VS Code window
    const window = await this.windowsControl.findWindow({ title: 'Visual Studio Code' });
    if (window) {
      await this.windowsControl.activateWindow(window.hwnd);
    }

    // Open command palette (Ctrl+Shift+P)
    await this.windowsControl.pressKey('P', { ctrl: true, shift: true });
    await new Promise(resolve => setTimeout(resolve, 200));

    // Type the command
    await this.windowsControl.typeText(command);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Press Enter to execute
    await this.windowsControl.pressKey('ENTER');
    await new Promise(resolve => setTimeout(resolve, 500));

    logger.info(`Executed VS Code command: ${command}`);
  }

  /**
   * Read file content
   */
  async readFile(filePath: string): Promise<string> {
    const content = await readFile(filePath, 'utf-8');
    logger.debug(`Read file: ${filePath}`);
    return content;
  }

  /**
   * Write content to file
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = join(filePath, '..');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(filePath, content, 'utf-8');
    logger.info(`Wrote file: ${filePath}`);
  }

  /**
   * Edit file with various operations
   */
  async editFile(edit: FileEdit): Promise<void> {
    const content = await this.readFile(edit.file);
    const lines = content.split('\n');

    let newContent: string;

    switch (edit.operation) {
      case 'insert':
        if (edit.line !== undefined) {
          lines.splice(edit.line - 1, 0, edit.content || '');
          newContent = lines.join('\n');
        } else {
          throw new Error('Line number required for insert operation');
        }
        break;

      case 'replace':
        if (edit.searchPattern) {
          const regex = new RegExp(edit.searchPattern, 'g');
          newContent = content.replace(regex, edit.content || '');
        } else if (edit.line !== undefined) {
          lines[edit.line - 1] = edit.content || '';
          newContent = lines.join('\n');
        } else {
          newContent = edit.content || '';
        }
        break;

      case 'delete':
        if (edit.searchPattern) {
          const regex = new RegExp(edit.searchPattern, 'g');
          newContent = content.replace(regex, '');
        } else if (edit.line !== undefined) {
          lines.splice(edit.line - 1, 1);
          newContent = lines.join('\n');
        } else {
          throw new Error('Either searchPattern or line required for delete');
        }
        break;

      case 'append':
        newContent = content + (edit.content || '');
        break;

      default:
        throw new Error(`Unknown operation: ${edit.operation}`);
    }

    await this.writeFile(edit.file, newContent);
    logger.info(`Edited file: ${edit.file} (${edit.operation})`);
  }

  /**
   * Find and replace in file
   */
  async findAndReplace(filePath: string, search: string, replace: string): Promise<void> {
    const content = await this.readFile(filePath);
    const newContent = content.replace(new RegExp(search, 'g'), replace);
    await this.writeFile(filePath, newContent);
    logger.info(`Find and replace in ${filePath}`);
  }

  /**
   * Run terminal command in VS Code
   */
  async runTerminalCommand(command: string): Promise<void> {
    // Open terminal (Ctrl+`)
    await this.windowsControl.pressKey('`', { ctrl: true });
    await new Promise(resolve => setTimeout(resolve, 300));

    // Type and execute command
    await this.windowsControl.typeText(command);
    await this.windowsControl.pressKey('ENTER');

    logger.info(`Ran terminal command: ${command}`);
  }

  /**
   * Create new file
   */
  async createFile(filePath: string, content?: string): Promise<void> {
    await this.writeFile(filePath, content || '');
    try {
      await this.openFile(filePath);
    } catch (e) {
      logger.warn(`Could not open file in VS Code: ${filePath}`);
    }
    logger.info(`Created file: ${filePath}`);
  }

  /**
   * Create new folder
   */
  async createFolder(folderPath: string): Promise<void> {
    if (!existsSync(folderPath)) {
      await mkdir(folderPath, { recursive: true });
      logger.info(`Created folder: ${folderPath}`);
    }
  }

  /**
   * Save current file
   */
  async saveFile(): Promise<void> {
    await this.windowsControl.pressKey('S', { ctrl: true });
    logger.debug('Saved file');
  }

  /**
   * Save all files
   */
  async saveAllFiles(): Promise<void> {
    await this.executeCommand('File: Save All');
  }

  /**
   * Close current editor
   */
  async closeEditor(): Promise<void> {
    await this.windowsControl.pressKey('W', { ctrl: true });
    logger.debug('Closed editor');
  }

  /**
   * Open search
   */
  async openSearch(query?: string): Promise<void> {
    await this.windowsControl.pressKey('F', { ctrl: true });
    if (query) {
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.windowsControl.typeText(query);
    }
  }

  /**
   * Open global search
   */
  async openGlobalSearch(query?: string): Promise<void> {
    await this.windowsControl.pressKey('F', { ctrl: true, shift: true });
    if (query) {
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.windowsControl.typeText(query);
    }
  }

  /**
   * Go to line
   */
  async goToLine(lineNumber: number, column?: number): Promise<void> {
    await this.windowsControl.pressKey('G', { ctrl: true });
    await new Promise(resolve => setTimeout(resolve, 200));

    const target = column ? `${lineNumber}:${column}` : `${lineNumber}`;
    await this.windowsControl.typeText(target);
    await this.windowsControl.pressKey('ENTER');
  }

  /**
   * Toggle comment
   */
  async toggleComment(): Promise<void> {
    await this.windowsControl.pressKey('/', { ctrl: true });
  }

  /**
   * Format document
   */
  async formatDocument(): Promise<void> {
    await this.executeCommand('Format Document');
  }

  /**
   * Quick fix
   */
  async quickFix(): Promise<void> {
    await this.windowsControl.pressKey('.');
  }

  /**
   * Rename symbol
   */
  async renameSymbol(newName: string): Promise<void> {
    await this.windowsControl.pressKey('F2');
    await new Promise(resolve => setTimeout(resolve, 200));
    await this.windowsControl.typeText(newName);
    await this.windowsControl.pressKey('ENTER');
  }

  /**
   * Peek definition
   */
  async peekDefinition(): Promise<void> {
    await this.windowsControl.pressKey('F12');
  }

  /**
   * Go to definition
   */
  async goToDefinition(): Promise<void> {
    await this.windowsControl.pressKey('F12', { alt: true });
  }

  /**
   * Find all references
   */
  async findReferences(): Promise<void> {
    await this.windowsControl.pressKey('F12', { shift: true });
  }

  /**
   * Split editor
   */
  async splitEditor(): Promise<void> {
    await this.executeCommand('View: Split Editor');
  }

  /**
   * Toggle sidebar
   */
  async toggleSidebar(): Promise<void> {
    await this.windowsControl.pressKey('B', { ctrl: true });
  }

  /**
   * Toggle terminal
   */
  async toggleTerminal(): Promise<void> {
    await this.windowsControl.pressKey('`', { ctrl: true });
  }

  /**
   * Get list of open files
   */
  async getOpenFiles(): Promise<string[]> {
    // This would require VS Code extension API for accurate results
    // For now, return empty array
    logger.warn('getOpenFiles requires VS Code extension integration');
    return [];
  }

  /**
   * Install extension
   */
  async installExtension(extensionId: string): Promise<void> {
    await execAsync(`${this.vscodePath} --install-extension ${extensionId}`);
    logger.info(`Installed extension: ${extensionId}`);
  }

  /**
   * List installed extensions
   */
  async listExtensions(): Promise<string[]> {
    const { stdout } = await execAsync(`${this.vscodePath} --list-extensions`);
    return stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Take screenshot of VS Code window
   */
  async screenshot(): Promise<Buffer> {
    const window = await this.windowsControl.findWindow({ title: 'Visual Studio Code' });
    if (!window) {
      throw new Error('VS Code window not found');
    }

    // Use PowerShell to capture window
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      
      $bounds = @{
        X = ${window.bounds.x}
        Y = ${window.bounds.y}
        Width = ${window.bounds.width}
        Height = ${window.bounds.height}
      }
      
      $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size)
      
      $ms = New-Object System.IO.MemoryStream
      $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $bytes = $ms.ToArray()
      
      [Convert]::ToBase64String($bytes)
    `;

    const { stdout } = await execAsync(`powershell -Command "${script}"`);
    return Buffer.from(stdout.trim(), 'base64');
  }
}

// Singleton instance
let _vscodeController: VSCodeController | null = null;

export function getVSCodeController(): VSCodeController {
  if (!_vscodeController) {
    _vscodeController = new VSCodeController();
  }
  return _vscodeController;
}
