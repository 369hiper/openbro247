/**
 * Desktop Control API Routes
 * 
 * Provides endpoints for:
 * - Windows desktop automation
 * - VS Code control
 * - Screen capture
 * - Vision analysis
 * - Keyboard/mouse control
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getWindowsControl } from '../../desktop/windowsControl';
import { getVSCodeController } from '../../desktop/vscodeController';
import { getScreenCapture } from '../../desktop/screenCapture';
import { getScreenAnalyzer } from '../../vision/screenAnalyzer';
import { Logger } from '../../utils/logger';

const logger = new Logger('DesktopAPI');

const windowsControl = getWindowsControl();
const vscodeController = getVSCodeController();
const screenCapture = getScreenCapture();
const screenAnalyzer = getScreenAnalyzer();

export async function desktopRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize desktop control
  await windowsControl.initialize();
  await vscodeController.initialize();
  await screenCapture.initialize();
  await screenAnalyzer.initialize();

  /**
   * GET /api/desktop/status - Desktop control status
   */
  fastify.get('/api/desktop/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const windows = await windowsControl.getWindows();
      
      reply.send({
        success: true,
        platform: process.platform,
        windows: windows.map((w: any) => ({
          title: w.title,
          className: w.className,
          processId: w.processId
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Desktop status error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/windows - Get/list windows
   */
  fastify.get('/api/desktop/windows', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const windows = await windowsControl.getWindows();
      
      reply.send({
        success: true,
        windows,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Get windows error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/window/activate - Activate a window
   */
  fastify.post('/api/desktop/window/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { hwnd?: number; title?: string };
      
      let hwnd = body.hwnd;
      if (!hwnd && body.title) {
        const window = await windowsControl.findWindow({ title: body.title });
        if (!window) {
          return reply.code(404).send({
            success: false,
            error: `Window not found: ${body.title}`
          });
        }
        hwnd = window.hwnd;
      }

      if (!hwnd) {
        return reply.code(400).send({
          success: false,
          error: 'Either hwnd or title is required'
        });
      }

      await windowsControl.activateWindow(hwnd);
      
      reply.send({
        success: true,
        hwnd,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Activate window error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/launch - Launch an application
   */
  fastify.post('/api/desktop/launch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { application: string; args?: string[] };
      
      const processId = await windowsControl.launchApplication(body.application, body.args);
      
      reply.send({
        success: true,
        processId,
        application: body.application,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Launch application error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/click - Mouse click
   */
  fastify.post('/api/desktop/click', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { x: number; y: number; button?: 'left' | 'right' | 'middle' };
      
      await windowsControl.mouseClick(body.x, body.y, body.button || 'left');
      
      reply.send({
        success: true,
        x: body.x,
        y: body.y,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Mouse click error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/type - Type text
   */
  fastify.post('/api/desktop/type', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { text: string; delay?: number };
      
      await windowsControl.typeText(body.text, { delay: body.delay });
      
      reply.send({
        success: true,
        text: body.text,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Type text error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/key - Press key
   */
  fastify.post('/api/desktop/key', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };
      
      await windowsControl.pressKey(body.key, {
        ctrl: body.ctrl,
        alt: body.alt,
        shift: body.shift
      });
      
      reply.send({
        success: true,
        key: body.key,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Press key error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/clipboard/copy - Copy to clipboard
   */
  fastify.post('/api/desktop/clipboard/copy', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { text: string };
      
      await windowsControl.copyToClipboard(body.text);
      
      reply.send({
        success: true,
        text: body.text,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Copy to clipboard error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/desktop/clipboard/paste - Get clipboard content
   */
  fastify.get('/api/desktop/clipboard/paste', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const content = await windowsControl.getClipboardContent();
      
      reply.send({
        success: true,
        content,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Get clipboard error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/screenshot - Take screenshot
   */
  fastify.post('/api/desktop/screenshot', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { 
        format?: 'png' | 'jpeg'; 
        region?: { x: number; y: number; width: number; height: number };
        save?: boolean;
        path?: string;
      };

      const buffer = await screenCapture.capture({
        format: body.format || 'png',
        ...body.region
      });

      let savedPath: string | undefined;
      if (body.save && body.path) {
        await screenCapture.captureToFile(body.path, body.format ? { format: body.format } : undefined);
        savedPath = body.path;
      }

      reply.send({
        success: true,
        image: buffer.toString('base64'),
        format: body.format || 'png',
        savedPath,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Screenshot error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/analyze - Analyze screen with vision
   */
  fastify.post('/api/desktop/analyze', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { prompt?: string };
      
      const analysis = await screenAnalyzer.analyzeScreen();
      
      reply.send({
        success: true,
        analysis,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Screen analysis error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/desktop/ocr - Perform OCR
   */
  fastify.post('/api/desktop/ocr', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { region?: { x: number; y: number; width: number; height: number } };
      
      const ocrResult = await screenAnalyzer.performOCR({ region: body.region });
      
      reply.send({
        success: true,
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('OCR error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // VS Code routes

  /**
   * GET /api/vscode/status - VS Code status
   */
  fastify.get('/api/vscode/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const version = await vscodeController.getVersion();
      
      reply.send({
        success: true,
        version,
        available: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.send({
        success: false,
        available: false,
        error: error instanceof Error ? error.message : 'VS Code not found',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/vscode/open - Open VS Code
   */
  fastify.post('/api/vscode/open', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { folder?: string; files?: string[]; newWindow?: boolean };
      
      await vscodeController.open(body);
      
      reply.send({
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Open VS Code error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/vscode/file/open - Open file in VS Code
   */
  fastify.post('/api/vscode/file/open', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { path: string; line?: number };
      
      await vscodeController.openFile(body.path, body.line);
      
      reply.send({
        success: true,
        path: body.path,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Open file error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/vscode/file/read - Read file content
   */
  fastify.post('/api/vscode/file/read', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { path: string };
      
      const content = await vscodeController.readFile(body.path);
      
      reply.send({
        success: true,
        content,
        path: body.path,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Read file error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/vscode/file/write - Write file content
   */
  fastify.post('/api/vscode/file/write', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { path: string; content: string };
      
      await vscodeController.writeFile(body.path, body.content);
      
      reply.send({
        success: true,
        path: body.path,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Write file error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/vscode/edit - Edit file
   */
  fastify.post('/api/vscode/edit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        file: string;
        operation: 'insert' | 'replace' | 'delete' | 'append';
        line?: number;
        content?: string;
        searchPattern?: string;
      };
      
      await vscodeController.editFile({
        file: body.file,
        operation: body.operation,
        line: body.line,
        content: body.content,
        searchPattern: body.searchPattern
      });
      
      reply.send({
        success: true,
        file: body.file,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Edit file error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/vscode/command - Execute VS Code command
   */
  fastify.post('/api/vscode/command', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { command: string; args?: any[] };
      
      await vscodeController.executeCommand(body.command, body.args);
      
      reply.send({
        success: true,
        command: body.command,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Execute command error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/vscode/terminal - Run terminal command
   */
  fastify.post('/api/vscode/terminal', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { command: string };
      
      await vscodeController.runTerminalCommand(body.command);
      
      reply.send({
        success: true,
        command: body.command,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Terminal command error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/vscode/screenshot - Screenshot VS Code window
   */
  fastify.post('/api/vscode/screenshot', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const buffer = await vscodeController.screenshot();
      
      reply.send({
        success: true,
        image: buffer.toString('base64'),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('VS Code screenshot error', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
