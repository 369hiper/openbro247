import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '../utils/logger';
import { IDEController } from '../computer-use/types';

const execAsync = promisify(exec);
const logger = new Logger('ClaudeCodeController');

/**
 * Claude Code Controller
 * 
 * Provides IDE-like codeless integration by leveraging the Anthropic Claude Code CLI.
 */
export class ClaudeCodeController implements IDEController {
  private isInitialized = false;

  constructor() {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check if claude is installed
      const { stdout } = await execAsync('claude --version');
      logger.info(`Claude Code Controller initialized. Version: ${stdout.trim()}`);
      this.isInitialized = true;
    } catch (error) {
      logger.error('Claude Code CLI not found. Ensure it is installed and in PATH.', error);
      // We still set initialized to true so we don't keep trying, but commands may fail
      this.isInitialized = true;
    }
  }

  async open(options?: any): Promise<void> {
    logger.info('Claude Code Controller does not require opening a UI window.');
  }

  async openFile(filePath: string, line?: number): Promise<void> {
    logger.info(`Requested to open file: ${filePath}`);
    // Claude code is generally headless but we could trigger an action here.
  }

  async readFile(filePath: string): Promise<string> {
    const content = await readFile(filePath, 'utf-8');
    logger.debug(`Read file: ${filePath}`);
    return content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const dir = join(filePath, '..');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, content, 'utf-8');
    logger.info(`Wrote file: ${filePath}`);
  }

  async editFile(edit: any): Promise<void> {
    logger.info(`Asking Claude to edit file: ${edit.file} with operation: ${edit.operation}`);
    
    // Instead of doing manual text replacement, we delegate complex logic to Claude Code when possible.
    // For now, we will use a prompted command to Claude Code.
    let instruction = `Edit the file ${edit.file}. `;
    if (edit.operation === 'replace' && edit.searchPattern) {
      instruction += `Replace occurrences of '${edit.searchPattern}' with '${edit.content}'.`;
    } else if (edit.operation === 'insert' && edit.line) {
      instruction += `Insert '${edit.content}' at line ${edit.line}.`;
    } else {
      instruction += `Apply the requested changes: ${JSON.stringify(edit)}`;
    }
    
    await this.executeCommand(instruction);
  }

  async executeCommand(command: string): Promise<void> {
    logger.info(`Executing Claude Code command: ${command}`);
    try {
      // Using -p (prompt) to execute a command statelessly
      const { stdout, stderr } = await execAsync(`claude -p "${command.replace(/"/g, '\\"')}"`);
      if (stdout) logger.info(`Claude Code Output: ${stdout}`);
      if (stderr) logger.warn(`Claude Code Error: ${stderr}`);
    } catch (error) {
      logger.error(`Failed to execute Claude Code command: ${command}`, error);
      throw error;
    }
  }

  async runTerminalCommand(command: string): Promise<void> {
    logger.info(`Running terminal command via Claude: ${command}`);
    // In Claude code, we can prompt it to run a terminal command or we just execute it normally.
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stdout) logger.info(`Command Output: ${stdout}`);
      if (stderr) logger.warn(`Command Error/Warn: ${stderr}`);
    } catch (error) {
      logger.error(`Terminal command execution failed: ${command}`, error);
      throw error;
    }
  }
}

// Singleton instance
let _claudeCodeController: ClaudeCodeController | null = null;

export function getClaudeCodeController(): ClaudeCodeController {
  if (!_claudeCodeController) {
    _claudeCodeController = new ClaudeCodeController();
  }
  return _claudeCodeController;
}
