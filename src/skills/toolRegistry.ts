import { Logger } from '../utils/logger';
import { BrowserEngine } from '../browser/engine';
import { SemanticMemory } from '../memory/semanticMemory';
import { ComputerUseOrchestrator } from '../computer-use/orchestrator';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, { type: string; description: string; required?: boolean }>;
  handler: (input: Record<string, any>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  durationMs?: number;
}

// ──────────────────────────────────────────────
// ToolRegistry
// ──────────────────────────────────────────────

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ToolRegistry');
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.logger.info(`Registered tool: ${tool.name}`);
  }

  async execute(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: "${toolName}". Available tools: ${this.listTools().map((t) => t.name).join(', ')}`,
      };
    }

    const startTime = Date.now();
    this.logger.info(`Executing tool: ${toolName}`, input);

    try {
      const result = await tool.handler(input);
      result.durationMs = Date.now() - startTime;
      this.logger.info(`Tool ${toolName} completed in ${result.durationMs}ms`);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error(`Tool ${toolName} failed: ${err}`);
      return {
        success: false,
        error: err,
        durationMs: Date.now() - startTime,
      };
    }
  }

  listTools(): Omit<ToolDefinition, 'handler'>[] {
    return Array.from(this.tools.values()).map(({ handler: _h, ...rest }) => rest);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}

// ──────────────────────────────────────────────
// Factory: register all built-in tools
// ──────────────────────────────────────────────

export function createDefaultToolRegistry(
  browserEngine: BrowserEngine,
  memory?: SemanticMemory,
  computerOrchestrator?: ComputerUseOrchestrator
): ToolRegistry {
  const registry = new ToolRegistry();
  const logger = new Logger('BuiltinTools');


  // ── Web Search (DuckDuckGo scrape — no API key needed) ──
  registry.register({
    name: 'web_search',
    description: 'Search the web for information. Returns a list of result titles and snippets.',
    inputSchema: {
      query: { type: 'string', description: 'The search query', required: true },
      maxResults: { type: 'number', description: 'Maximum number of results (default 5)' },
    },
    handler: async (input) => {
      const query = input.query as string;
      const maxResults = (input.maxResults as number) ?? 5;
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      try {
        await browserEngine.navigate(url);
        const results: Array<{ title: string; url: string; snippet: string }> = [];

        // Extract results from DuckDuckGo HTML via page evaluation
        const extracted = await browserEngine.evaluate(`
          (function() {
            var links = Array.from(document.querySelectorAll('.result__a')).slice(0, ${maxResults});
            var snips = Array.from(document.querySelectorAll('.result__snippet')).slice(0, ${maxResults});
            return links.map(function(a, i) {
              return { title: a.innerText.trim(), href: a.href, snippet: snips[i] ? snips[i].innerText.trim() : '' };
            });
          })()
        `) as Array<{title: string; href: string; snippet: string}>;

        const extractedArr = Array.isArray(extracted) ? extracted : [];
        for (const item of extractedArr.slice(0, maxResults)) {
          results.push({
            title: item.title ?? '',
            url: item.href ?? '',
            snippet: item.snippet ?? '',
          });
        }

        return {
          success: true,
          data: {
            query,
            results,
            count: results.length,
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ── Browse URL ──
  registry.register({
    name: 'browse_url',
    description: 'Navigate to a URL and extract the page text content.',
    inputSchema: {
      url: { type: 'string', description: 'The URL to navigate to', required: true },
      selector: { type: 'string', description: 'Optional CSS selector to extract specific content' },
    },
    handler: async (input) => {
      const url = input.url as string;
      const selector = input.selector as string | undefined;

      await browserEngine.navigate(url);
      const title = await browserEngine.evaluate(`document.title`) as string;

      let content: string;
      if (selector) {
        const raw = await browserEngine.extractText(selector);
        content = Array.isArray(raw) ? raw.join('\n') : raw;
      } else {
        // Get main text without scripts/styles
        content = await browserEngine.evaluate(`
          (function() {
            const body = document.body.cloneNode(true);
            body.querySelectorAll('script,style,nav,footer,header,aside').forEach(e => e.remove());
            return body.innerText.slice(0, 4000);
          })()
        `);
      }

      const currentUrl = await browserEngine.evaluate(`window.location.href`) as string;

      return {
        success: true,
        data: { url: currentUrl, title, content },
      };
    },
  });

  // ── Click element ──
  registry.register({
    name: 'browser_click',
    description: 'Click an element on the current page by CSS selector or text.',
    inputSchema: {
      selector: { type: 'string', description: 'CSS selector of the element to click', required: true },
    },
    handler: async (input) => {
      await browserEngine.click(input.selector as string);
      return { success: true, data: { clicked: input.selector } };
    },
  });

  // ── Type text ──
  registry.register({
    name: 'browser_type',
    description: 'Type text into an input element on the current page.',
    inputSchema: {
      selector: { type: 'string', description: 'CSS selector of the input element', required: true },
      text: { type: 'string', description: 'Text to type', required: true },
    },
    handler: async (input) => {
      // BrowserEngine.type(text, selector) — note text is first
      await browserEngine.type(input.text as string, input.selector as string);
      return { success: true, data: { typed: input.text } };
    },
  });

  // ── Take screenshot ──
  registry.register({
    name: 'take_screenshot',
    description: 'Take a screenshot of the current browser page. Returns base64-encoded image.',
    inputSchema: {
      fullPage: { type: 'boolean', description: 'Whether to capture full page (default true)' },
    },
    handler: async (input) => {
      // BrowserEngine.screenshot(path?) — use takeScreenshot for fullPage support
      const screenshot = await browserEngine.takeScreenshot(
        undefined,
        input.fullPage !== false
      );
      return {
        success: true,
        data: {
          screenshot: screenshot.toString('base64'),
          mimeType: 'image/png',
          note: 'base64 encoded PNG',
        },
      };
    },
  });

  // ── Read file ──
  registry.register({
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem.',
    inputSchema: {
      path: { type: 'string', description: 'Absolute or relative file path', required: true },
      maxBytes: { type: 'number', description: 'Maximum bytes to read (default 10000)' },
    },
    handler: async (input) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.resolve(input.path as string);
      const maxBytes = (input.maxBytes as number) ?? 10000;

      try {
        const stat = await fs.stat(filePath);
        const buffer = await fs.readFile(filePath);
        const content = buffer.slice(0, maxBytes).toString('utf-8');
        const truncated = stat.size > maxBytes;

        return {
          success: true,
          data: {
            path: filePath,
            content,
            sizeBytes: stat.size,
            truncated,
            encoding: 'utf-8',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Cannot read file "${filePath}": ${error.message}` };
      }
    },
  });

  // ── Write file ──
  registry.register({
    name: 'write_file',
    description: 'Write content to a file. Creates the file if it does not exist.',
    inputSchema: {
      path: { type: 'string', description: 'File path to write to', required: true },
      content: { type: 'string', description: 'Content to write', required: true },
      append: { type: 'boolean', description: 'If true, append instead of overwrite (default false)' },
    },
    handler: async (input) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.resolve(input.path as string);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      if (input.append) {
        await fs.appendFile(filePath, input.content as string, 'utf-8');
      } else {
        await fs.writeFile(filePath, input.content as string, 'utf-8');
      }

      return {
        success: true,
        data: {
          path: filePath,
          bytesWritten: (input.content as string).length,
          mode: input.append ? 'append' : 'overwrite',
        },
      };
    },
  });

  // ── List directory ──
  registry.register({
    name: 'list_directory',
    description: 'List files and directories at a given path.',
    inputSchema: {
      path: { type: 'string', description: 'Directory path to list', required: true },
    },
    handler: async (input) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dirPath = path.resolve(input.path as string);

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const items = entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          path: path.join(dirPath, e.name),
        }));

        return { success: true, data: { path: dirPath, items, count: items.length } };
      } catch (error: any) {
        return { success: false, error: `Cannot list directory "${dirPath}": ${error.message}` };
      }
    },
  });

  // ── HTTP Request ──
  registry.register({
    name: 'http_request',
    description: 'Make an HTTP request and return the response body.',
    inputSchema: {
      url: { type: 'string', description: 'Request URL', required: true },
      method: { type: 'string', description: 'HTTP method: GET, POST, PUT, DELETE (default GET)' },
      body: { type: 'string', description: 'Request body (JSON string for POST/PUT)' },
      headers: { type: 'object', description: 'Request headers as key-value pairs' },
    },
    handler: async (input) => {
      const method = (input.method as string) ?? 'GET';
      const headers: Record<string, string> = {
        'User-Agent': 'OpenBro247/1.0',
        ...(input.headers as Record<string, string> | undefined),
      };

      if (input.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
        body: input.body ? String(input.body) : undefined,
      };

      const response = await fetch(input.url as string, fetchOptions);
      const contentType = response.headers.get('content-type') ?? '';
      const text = await response.text();

      let parsed: any = text;
      if (contentType.includes('application/json')) {
        try { parsed = JSON.parse(text); } catch { /* keep as text */ }
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        success: response.ok,
        data: {
          status: response.status,
          statusText: response.statusText,
          body: parsed,
          headers: responseHeaders,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    },
  });

  // ── Execute shell command ──
  registry.register({
    name: 'run_command',
    description: 'Execute a shell command and return stdout/stderr. Use with caution.',
    inputSchema: {
      command: { type: 'string', description: 'Shell command to run', required: true },
      cwd: { type: 'string', description: 'Working directory (optional)' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
    },
    handler: async (input) => {
      const { execSync } = await import('child_process');
      const command = input.command as string;
      const cwd = (input.cwd as string | undefined) ?? process.cwd();
      const timeout = (input.timeout as number) ?? 30000;

      // Basic safety guard — reject obviously dangerous commands
      const dangerous = ['rm -rf', 'del /f', 'format', 'mkfs', 'dd if='];
      for (const d of dangerous) {
        if (command.toLowerCase().includes(d)) {
          return { success: false, error: `Command blocked for safety: contains "${d}"` };
        }
      }

      try {
        const output = execSync(command, {
          cwd,
          timeout,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024, // 1MB
        });
        return { success: true, data: { stdout: output, stderr: '', exitCode: 0 } };
      } catch (error: any) {
        return {
          success: false,
          data: {
            stdout: error.stdout ?? '',
            stderr: error.stderr ?? '',
            exitCode: error.status ?? 1,
          },
          error: error.message,
        };
      }
    },
  });

  // ── Memory store ──
  registry.register({
    name: 'store_memory',
    description: 'Store a piece of information in long-term memory for future recall.',
    inputSchema: {
      content: { type: 'string', description: 'The information to remember', required: true },
      tags: { type: 'string', description: 'Comma-separated tags for categorization' },
    },
    handler: async (input) => {
      if (!memory) {
        return { success: false, error: 'SemanticMemory not available. Cannot store.' };
      }
      try {
        await memory.store(
           input.content as string,
           'user_memory',
           { tags: (input.tags as string)?.split(',') || [] }
        );
        return { success: true, data: { stored: true } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  });

  // ── Memory Recall ──
  registry.register({
    name: 'memory_recall',
    description: 'Retrieve relevant information from long-term memory.',
    inputSchema: {
      query: { type: 'string', description: 'Search query to find relevant memories', required: true },
      count: { type: 'number', description: 'Number of memories to retrieve (default 5)' }
    },
    handler: async (input) => {
      if (!memory) {
         return { success: false, error: 'SemanticMemory not available' };
      }
      try {
        const count = (input.count as number) || 5;
        const results = await memory.recall(input.query as string, count);
        return { success: true, data: { memories: results } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  });

  // ── JavaScript evaluation in browser ──
  registry.register({
    name: 'browser_evaluate',
    description: 'Execute JavaScript in the current browser page and return the result.',
    inputSchema: {
      script: { type: 'string', description: 'JavaScript code to execute in the browser', required: true },
    },
    handler: async (input) => {
      const result = await browserEngine.evaluate(input.script as string);
      return { success: true, data: { result } };
    },
  });

  // ── Edit file ──
  registry.register({
    name: 'edit_file',
    description: 'Edit a file using search and replace or line insertion. Use this instead of rewrite for large files.',
    inputSchema: {
      path: { type: 'string', description: 'File path to edit', required: true },
      operation: { type: 'string', description: 'Operation: replace, insert, append', required: true },
      searchPattern: { type: 'string', description: 'Text or regex to search for (for replace)' },
      content: { type: 'string', description: 'Content to insert or replace with', required: true },
    },
    handler: async (input) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.resolve(input.path as string);

      try {
        let text = await fs.readFile(filePath, 'utf-8');
        const operation = input.operation as string;
        const searchPattern = input.searchPattern as string | undefined;
        const content = input.content as string;

        if (operation === 'replace' && searchPattern) {
          text = text.replace(new RegExp(searchPattern, 'g'), content);
        } else if (operation === 'insert') {
          text += '\\n' + content;
        } else if (operation === 'append') {
          text += content;
        }

        await fs.writeFile(filePath, text, 'utf-8');
        return { success: true, data: { path: filePath, operation } };
      } catch (error: any) {
        return { success: false, error: `Edit failed: ${error.message}` };
      }
    },
  });

  // ── Search files ──
  registry.register({
    name: 'search_files',
    description: 'Search for a string or regex pattern across files in a directory.',
    inputSchema: {
      dir: { type: 'string', description: 'Directory to search in', required: true },
      pattern: { type: 'string', description: 'Search pattern', required: true },
    },
    handler: async (input) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dir = input.dir as string;
      const pattern = input.pattern as string;
      const results: string[] = [];
      
      const search = async (dirPath: string) => {
        if (results.length > 50) return;
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const e of entries) {
            const fullPath = path.join(dirPath, e.name);
            if (e.isDirectory() && !['.git', 'node_modules', 'dist', 'build'].includes(e.name)) {
                await search(fullPath);
            } else if (e.isFile()) {
                try {
                  const text = await fs.readFile(fullPath, 'utf-8');
                  if (text.includes(pattern)) {
                    results.push(fullPath);
                  }
                } catch {
                  // Ignore unreadable/non-text files during search.
                }
            }
          }
        } catch {
          // Ignore directories that disappear or cannot be read.
        }
      };
      
      await search(path.resolve(dir));
      return { success: true, data: { matches: results } };
    },
  });

  // ── Computer Screenshot ──
  registry.register({
    name: 'computer_screenshot',
    description: 'Take a screenshot of the entire desktop computer screen.',
    inputSchema: {},
    handler: async () => {
      if (!computerOrchestrator) {
         return { success: false, error: 'ComputerUseOrchestrator not available' };
      }
      try {
        const screenshot = await computerOrchestrator.captureScreen({});
        return { success: true, data: { screenshot, mimeType: 'image/png' } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  });

  logger.info(`Registered ${registry.listTools().length} built-in tools`);
  return registry;
}
