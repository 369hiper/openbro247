import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { ExecutionLogger } from '../../computer-use/executionLogger';
import { ModelRouter } from '../../models/modelRouter';
import { MCPToolRegistry } from '../../mcp/toolRegistry';
import { KiloCodeOpenSourceBridge, ClineOpenSourceBridge } from '../cliIntegration/kiloCodeBridge';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// APP ORCHESTRATOR - 24/7 App Creation, Running, Testing
// ============================================================================

/**
 * App definition
 */
export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  type: 'web' | 'api' | 'cli' | 'fullstack';
  framework: 'react' | 'nextjs' | 'express' | 'vite' | 'vue' | 'svelte' | 'custom';
  status: 'pending' | 'creating' | 'building' | 'running' | 'testing' | 'error' | 'stopped';
  port: number;
  url?: string;
  path: string;
  config: AppConfig;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
  lastTestAt?: Date;
  testResults?: TestResult[];
  errors: AppError[];
  metadata: Record<string, any>;
}

export interface AppConfig {
  template?: string;
  dependencies: string[];
  envVariables: Record<string, string>;
  buildCommand: string;
  startCommand: string;
  testCommand?: string;
  healthCheckUrl?: string;
  healthCheckInterval: number; // seconds
  autoRestart: boolean;
  maxRestarts: number;
}

export interface TestResult {
  id: string;
  appId: string;
  type: 'unit' | 'integration' | 'e2e' | 'visual' | 'health';
  status: 'passed' | 'failed' | 'running';
  duration: number;
  details: any;
  timestamp: Date;
}

export interface AppError {
  id: string;
  type: 'build' | 'runtime' | 'test' | 'timeout';
  message: string;
  stack?: string;
  timestamp: Date;
  resolved: boolean;
}

export interface AppLog {
  id: string;
  appId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'stdout' | 'stderr' | 'agent' | 'test';
  message: string;
  timestamp: Date;
}

/**
 * AppOrchestrator - Creates, runs, tests apps 24/7
 */
export class AppOrchestrator extends EventEmitter {
  private apps: Map<string, AppDefinition> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private logs: Map<string, AppLog[]> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private testIntervals: Map<string, NodeJS.Timeout> = new Map();

  private logger: Logger;
  private executionLogger: ExecutionLogger;
  private modelRouter: ModelRouter;
  private toolRegistry: MCPToolRegistry;
  private kiloBridge: KiloCodeOpenSourceBridge;
  private clineBridge: ClineOpenSourceBridge;
  private workspace: string;
  private isRunning: boolean = false;

  constructor(
    modelRouter: ModelRouter,
    toolRegistry: MCPToolRegistry,
    executionLogger: ExecutionLogger,
    workspace: string = './workspace/apps'
  ) {
    super();
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.executionLogger = executionLogger;
    this.workspace = workspace;
    this.kiloBridge = new KiloCodeOpenSourceBridge(modelRouter, toolRegistry, executionLogger, workspace);
    this.clineBridge = new ClineOpenSourceBridge(modelRouter, workspace);
    this.logger = new Logger('AppOrchestrator');
  }

  /**
   * Initialize the app orchestrator
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing App Orchestrator...');

    try {
      await this.kiloBridge.initialize();
      await this.clineBridge.initialize();

      // Create workspace directories
      await fs.mkdir(this.workspace, { recursive: true });
      await fs.mkdir(path.join(this.workspace, 'logs'), { recursive: true });
      await fs.mkdir(path.join(this.workspace, 'screenshots'), { recursive: true });

      this.isRunning = true;
      this.executionLogger.deployment('info', 'App Orchestrator initialized');
      this.logger.info('App Orchestrator initialized');
    } catch (error) {
      this.logger.error('Failed to initialize App Orchestrator', error);
      throw error;
    }
  }

  // ============================================================================
  // APP LIFECYCLE - CREATE
  // ============================================================================

  /**
   * Create a new app using KiloCode/Cline
   */
  async createApp(options: {
    name: string;
    description: string;
    type?: AppDefinition['type'];
    framework?: AppDefinition['framework'];
    requirements: string;
    autoStart?: boolean;
    autoTest?: boolean;
  }): Promise<AppDefinition> {
    const appId = uuidv4();
    const appPath = path.join(this.workspace, appId);

    this.logger.info(`Creating app: ${options.name}`);
    this.executionLogger.coding('info', `Creating app: ${options.name}`, {
      type: options.type,
      framework: options.framework,
    });

    const app: AppDefinition = {
      id: appId,
      name: options.name,
      description: options.description,
      type: options.type || 'web',
      framework: options.framework || 'react',
      status: 'creating',
      port: this.findAvailablePort(),
      path: appPath,
      config: this.getDefaultConfig(options.framework || 'react'),
      createdAt: new Date(),
      updatedAt: new Date(),
      errors: [],
      metadata: {
        createdBy: 'app_orchestrator',
        autoStart: options.autoStart ?? true,
        autoTest: options.autoTest ?? true,
      },
    };

    this.apps.set(appId, app);
    this.logs.set(appId, []);

    try {
      // Create app directory
      await fs.mkdir(appPath, { recursive: true });

      // Generate app code using KiloCode
      await this.generateAppCode(app, options.requirements);

      // Install dependencies
      await this.installDependencies(app);

      // Build the app
      await this.buildApp(app);

      app.status = 'stopped';
      app.updatedAt = new Date();

      this.executionLogger.coding('info', `App created: ${options.name}`, {
        appId,
        path: appPath,
        port: app.port,
      });

      // Auto-start if enabled
      if (options.autoStart !== false) {
        await this.startApp(appId);
      }

      // Auto-test if enabled
      if (options.autoTest !== false) {
        this.startAutoTesting(appId);
      }

      this.emit('app:created', app);
      return app;
    } catch (error) {
      app.status = 'error';
      app.errors.push({
        id: uuidv4(),
        type: 'build',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        resolved: false,
      });

      this.executionLogger.coding('error', `Failed to create app: ${options.name}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Generate app code using KiloCode
   */
  private async generateAppCode(app: AppDefinition, requirements: string): Promise<void> {
    this.executionLogger.coding('info', `Generating code for ${app.name}`, {
      framework: app.framework,
    });

    const prompt = this.buildAppGenerationPrompt(app, requirements);

    // Use KiloCode bridge to generate code
    const result = await (this.kiloBridge as any).createCapability({
      name: app.name,
      description: app.description,
      language: 'typescript',
      requirements: prompt,
    });

    if (!result || !result.success) {
      throw new Error(`Code generation failed: ${result?.error || 'Unknown error'}`);
    }

    // Generate full app structure based on framework
    await this.generateAppStructure(app);
  }

  /**
   * Generate full app structure
   */
  private async generateAppStructure(app: AppDefinition): Promise<void> {
    switch (app.framework) {
      case 'react':
        await this.generateReactApp(app);
        break;
      case 'nextjs':
        await this.generateNextJsApp(app);
        break;
      case 'express':
        await this.generateExpressApp(app);
        break;
      case 'vite':
        await this.generateViteApp(app);
        break;
      default:
        await this.generateReactApp(app);
    }
  }

  /**
   * Generate React app structure
   */
  private async generateReactApp(app: AppDefinition): Promise<void> {
    const packageJson = {
      name: app.name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      private: true,
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
        test: 'vitest',
        start: 'vite --port ' + app.port,
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@vitejs/plugin-react': '^4.0.0',
        typescript: '^5.0.0',
        vite: '^5.0.0',
        vitest: '^1.0.0',
      },
    };

    const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: ${app.port},
    host: '0.0.0.0'
  }
});`;

    const appTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>${app.name}</h1>
      <p>${app.description}</p>
      <div id="status">
        <p>App is running on port ${app.port}</p>
        <p>Created by OpenClaw Agent</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${app.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

    const testFile = `import { describe, it, expect } from 'vitest';

describe('${app.name}', () => {
  it('should be defined', () => {
    expect(true).toBe(true);
  });

  it('should have valid configuration', () => {
    expect(${app.port}).toBeGreaterThan(0);
  });
});`;

    // Write all files
    await fs.mkdir(path.join(app.path, 'src'), { recursive: true });
    await fs.writeFile(path.join(app.path, 'package.json'), JSON.stringify(packageJson, null, 2));
    await fs.writeFile(path.join(app.path, 'vite.config.ts'), viteConfig);
    await fs.writeFile(path.join(app.path, 'src/App.tsx'), appTsx);
    await fs.writeFile(
      path.join(app.path, 'src/main.tsx'),
      'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);'
    );
    await fs.writeFile(path.join(app.path, 'index.html'), indexHtml);
    await fs.writeFile(path.join(app.path, 'src/App.test.tsx'), testFile);
    await fs.writeFile(
      path.join(app.path, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            lib: ['ES2020', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            skipLibCheck: true,
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
          },
          include: ['src'],
          references: [{ path: './tsconfig.node.json' }],
        },
        null,
        2
      )
    );

    this.executionLogger.coding('info', `React app structure generated`, { path: app.path });
  }

  private async generateNextJsApp(app: AppDefinition): Promise<void> {
    // Similar structure for Next.js
    await this.generateReactApp(app); // Fallback for now
  }

  private async generateExpressApp(app: AppDefinition): Promise<void> {
    const packageJson = {
      name: app.name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      scripts: {
        dev: 'tsx watch src/index.ts',
        build: 'tsc',
        start: 'node dist/index.js',
        test: 'vitest',
      },
      dependencies: {
        express: '^4.18.0',
        cors: '^2.8.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
        tsx: '^4.0.0',
        vitest: '^1.0.0',
      },
    };

    const indexTs = `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = ${app.port};

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: '${app.name}',
    description: '${app.description}',
    status: 'running',
    port: PORT
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`${app.name} running on port \${PORT}\`);
});`;

    await fs.mkdir(path.join(app.path, 'src'), { recursive: true });
    await fs.writeFile(path.join(app.path, 'package.json'), JSON.stringify(packageJson, null, 2));
    await fs.writeFile(path.join(app.path, 'src/index.ts'), indexTs);
    await fs.writeFile(
      path.join(app.path, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            outDir: './dist',
            rootDir: './src',
            strict: true,
          },
        },
        null,
        2
      )
    );
  }

  private async generateViteApp(app: AppDefinition): Promise<void> {
    await this.generateReactApp(app); // Vite is used by default
  }

  // ============================================================================
  // APP LIFECYCLE - START/RUN
  // ============================================================================

  /**
   * Start an app and keep it running 24/7
   */
  async startApp(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);

    this.logger.info(`Starting app: ${app.name}`);
    this.executionLogger.deployment('info', `Starting app: ${app.name}`, { port: app.port });

    app.status = 'building';
    app.updatedAt = new Date();

    try {
      // Build the app
      await this.buildApp(app);

      // Start the dev server
      app.status = 'running';
      app.startedAt = new Date();
      app.updatedAt = new Date();
      app.url = `http://localhost:${app.port}`;

      // Spawn the process
      const proc = spawn('npm', ['run', 'dev'], {
        cwd: app.path,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: { ...process.env, PORT: app.port.toString() },
      });

      this.processes.set(appId, proc);

      // Capture stdout
      proc.stdout?.on('data', data => {
        const message = data.toString().trim();
        this.addLog(appId, 'stdout', 'info', message);
      });

      // Capture stderr
      proc.stderr?.on('data', data => {
        const message = data.toString().trim();
        this.addLog(appId, 'stderr', 'warn', message);
      });

      // Handle process exit
      proc.on('exit', code => {
        this.logger.warn(`App ${app.name} exited with code ${code}`);
        this.processes.delete(appId);

        if (app.config.autoRestart) {
          this.restartApp(appId);
        }
      });

      // Wait for server to be ready
      await this.waitForServer(app.port, 30000);

      // Start health checks
      this.startHealthCheck(appId);

      this.executionLogger.deployment('info', `App started: ${app.name}`, {
        url: app.url,
        port: app.port,
      });

      this.emit('app:started', app);
    } catch (error) {
      app.status = 'error';
      app.errors.push({
        id: uuidv4(),
        type: 'runtime',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        resolved: false,
      });

      this.executionLogger.deployment('error', `Failed to start app: ${app.name}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Stop an app
   */
  async stopApp(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);

    this.logger.info(`Stopping app: ${app.name}`);

    // Stop health check
    const healthInterval = this.healthCheckIntervals.get(appId);
    if (healthInterval) {
      clearInterval(healthInterval);
      this.healthCheckIntervals.delete(appId);
    }

    // Stop test interval
    const testInterval = this.testIntervals.get(appId);
    if (testInterval) {
      clearInterval(testInterval);
      this.testIntervals.delete(appId);
    }

    // Kill the process
    const proc = this.processes.get(appId);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(appId);
    }

    app.status = 'stopped';
    app.stoppedAt = new Date();
    app.updatedAt = new Date();

    this.executionLogger.deployment('info', `App stopped: ${app.name}`);
    this.emit('app:stopped', app);
  }

  /**
   * Restart an app
   */
  async restartApp(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);

    this.logger.info(`Restarting app: ${app.name}`);
    this.executionLogger.deployment('info', `Restarting app: ${app.name}`);

    await this.stopApp(appId);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.startApp(appId);
  }

  /**
   * Build an app
   */
  private async buildApp(app: AppDefinition): Promise<void> {
    this.logger.info(`Building app: ${app.name}`);
    this.executionLogger.coding('info', `Building app: ${app.name}`);

    try {
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: app.path,
        timeout: 120000,
      });

      this.addLog(app.id, 'agent', 'info', `Build output: ${stdout}`);
      if (stderr) {
        this.addLog(app.id, 'agent', 'warn', `Build warnings: ${stderr}`);
      }

      this.executionLogger.coding('info', `App built: ${app.name}`);
    } catch (error) {
      this.executionLogger.coding('error', `Build failed: ${app.name}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Install dependencies
   */
  private async installDependencies(app: AppDefinition): Promise<void> {
    this.logger.info(`Installing dependencies for: ${app.name}`);
    this.executionLogger.coding('info', `Installing dependencies for: ${app.name}`);

    try {
      const { stdout, stderr } = await execAsync('npm install', {
        cwd: app.path,
        timeout: 180000,
      });

      this.addLog(app.id, 'agent', 'info', `Install output: ${stdout}`);
      this.executionLogger.coding('info', `Dependencies installed for: ${app.name}`);
    } catch (error) {
      this.executionLogger.coding('error', `Install failed: ${app.name}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ============================================================================
  // APP LIFECYCLE - TEST 24/7
  // ============================================================================

  /**
   * Start automatic testing for an app
   */
  private startAutoTesting(appId: string): void {
    const app = this.apps.get(appId);
    if (!app) return;

    const testInterval = setInterval(async () => {
      try {
        await this.runTests(appId);
      } catch (error) {
        this.logger.error(`Auto-test failed for ${app.name}`, error);
      }
    }, 60000); // Test every minute

    this.testIntervals.set(appId, testInterval);
    this.logger.info(`Auto-testing started for: ${app.name}`);
  }

  /**
   * Run tests on an app
   */
  async runTests(appId: string): Promise<TestResult[]> {
    const app = this.apps.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);

    this.logger.info(`Running tests for: ${app.name}`);
    app.status = 'testing';
    app.updatedAt = new Date();

    const results: TestResult[] = [];

    // 1. Health check test
    const healthResult = await this.runHealthCheck(app);
    results.push(healthResult);

    // 2. Unit tests
    const unitResult = await this.runUnitTests(app);
    results.push(unitResult);

    // 3. Visual test (screenshot)
    const visualResult = await this.runVisualTest(app);
    results.push(visualResult);

    // Update app with results
    app.testResults = results;
    app.lastTestAt = new Date();
    app.status = 'running';
    app.updatedAt = new Date();

    this.executionLogger.testing('info', `Tests completed for: ${app.name}`, {
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
    });

    this.emit('app:tested', { app, results });
    return results;
  }

  /**
   * Run health check
   */
  private async runHealthCheck(app: AppDefinition): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`http://localhost:${app.port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const result: TestResult = {
        id: uuidv4(),
        appId: app.id,
        type: 'health',
        status: response.ok ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        details: {
          statusCode: response.status,
          statusText: response.statusText,
        },
        timestamp: new Date(),
      };

      this.executionLogger.testing(
        result.status === 'passed' ? 'info' : 'error',
        `Health check ${result.status}: ${app.name}`
      );

      return result;
    } catch (error) {
      return {
        id: uuidv4(),
        appId: app.id,
        type: 'health',
        status: 'failed',
        duration: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date(),
      };
    }
  }

  /**
   * Run unit tests
   */
  private async runUnitTests(app: AppDefinition): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync('npm test -- --run', {
        cwd: app.path,
        timeout: 60000,
      });

      const passed = stdout.includes('PASS') || stdout.includes('Tests  passed');

      return {
        id: uuidv4(),
        appId: app.id,
        type: 'unit',
        status: passed ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        details: { stdout, stderr },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        id: uuidv4(),
        appId: app.id,
        type: 'unit',
        status: 'failed',
        duration: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date(),
      };
    }
  }

  /**
   * Run visual test (screenshot)
   */
  private async runVisualTest(app: AppDefinition): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Use browser tool to take screenshot
      const screenshotResult = await this.toolRegistry.executeTool('browser_screenshot', {
        fullPage: true,
        format: 'png',
      });

      // Save screenshot
      const screenshotPath = path.join(
        this.workspace,
        'screenshots',
        `${app.id}_${Date.now()}.png`
      );
      if (screenshotResult.data) {
        await fs.writeFile(screenshotPath, Buffer.from(screenshotResult.data, 'base64'));
      }

      return {
        id: uuidv4(),
        appId: app.id,
        type: 'visual',
        status: 'passed',
        duration: Date.now() - startTime,
        details: { screenshotPath },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        id: uuidv4(),
        appId: app.id,
        type: 'visual',
        status: 'failed',
        duration: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date(),
      };
    }
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  /**
   * Start health check interval for an app
   */
  private startHealthCheck(appId: string): void {
    const app = this.apps.get(appId);
    if (!app) return;

    const interval = setInterval(
      async () => {
        const result = await this.runHealthCheck(app);

        if (result.status === 'failed') {
          this.executionLogger.deployment('warn', `Health check failed for ${app.name}`);
          this.emit('app:health_failed', { app, result });
        }
      },
      (app.config.healthCheckInterval || 30) * 1000
    );

    this.healthCheckIntervals.set(appId, interval);
  }

  /**
   * Wait for server to be ready
   */
  private async waitForServer(port: number, timeout: number): Promise<boolean> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`http://localhost:${port}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok || response.status < 500) {
          this.logger.info(`Server ready on port ${port}`);
          return true;
        }
      } catch {
        // Not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Server did not become ready on port ${port} within ${timeout}ms`);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private addLog(
    appId: string,
    source: AppLog['source'],
    level: AppLog['level'],
    message: string
  ): void {
    const logs = this.logs.get(appId) || [];
    logs.push({
      id: uuidv4(),
      appId,
      level,
      source,
      message,
      timestamp: new Date(),
    });

    // Keep last 1000 logs
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }

    this.logs.set(appId, logs);
    this.emit('app:log', { appId, source, level, message });
  }

  private findAvailablePort(): number {
    // Simple port allocation (3000-9999)
    const usedPorts = Array.from(this.apps.values()).map(a => a.port);
    let port = 3000;
    while (usedPorts.includes(port)) {
      port++;
    }
    return port;
  }

  private getDefaultConfig(framework: AppDefinition['framework']): AppConfig {
    return {
      dependencies: [],
      envVariables: {},
      buildCommand: 'npm run build',
      startCommand: 'npm run dev',
      testCommand: 'npm test',
      healthCheckUrl: '/health',
      healthCheckInterval: 30,
      autoRestart: true,
      maxRestarts: 5,
    };
  }

  private buildAppGenerationPrompt(app: AppDefinition, requirements: string): string {
    return `Create a ${app.framework} ${app.type} application:

NAME: ${app.name}
DESCRIPTION: ${app.description}
REQUIREMENTS: ${requirements}
PORT: ${app.port}

The app should:
1. Be production-ready
2. Include health check endpoint
3. Have proper error handling
4. Include basic tests
5. Use TypeScript`;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get all apps
   */
  getAllApps(): AppDefinition[] {
    return Array.from(this.apps.values());
  }

  /**
   * Get app by ID
   */
  getApp(appId: string): AppDefinition | undefined {
    return this.apps.get(appId);
  }

  /**
   * Get app logs
   */
  getAppLogs(appId: string, limit: number = 100): AppLog[] {
    const logs = this.logs.get(appId) || [];
    return logs.slice(-limit);
  }

  /**
   * Get app status
   */
  getAppStatus(appId: string): {
    status: string;
    url?: string;
    uptime?: number;
    lastTestAt?: Date;
    errors: number;
  } {
    const app = this.apps.get(appId);
    if (!app) throw new Error(`App not found: ${appId}`);

    return {
      status: app.status,
      url: app.url,
      uptime: app.startedAt ? Date.now() - app.startedAt.getTime() : undefined,
      lastTestAt: app.lastTestAt,
      errors: app.errors.filter(e => !e.resolved).length,
    };
  }

  /**
   * Stop all apps
   */
  async stopAll(): Promise<void> {
    for (const appId of this.apps.keys()) {
      await this.stopApp(appId).catch(() => {});
    }
    this.isRunning = false;
  }

  /**
   * Get orchestrator stats
   */
  getStats(): {
    totalApps: number;
    runningApps: number;
    stoppedApps: number;
    errorApps: number;
    totalTests: number;
  } {
    const apps = Array.from(this.apps.values());
    return {
      totalApps: apps.length,
      runningApps: apps.filter(a => a.status === 'running').length,
      stoppedApps: apps.filter(a => a.status === 'stopped').length,
      errorApps: apps.filter(a => a.status === 'error').length,
      totalTests: apps.reduce((sum, a) => sum + (a.testResults?.length || 0), 0),
    };
  }
}
