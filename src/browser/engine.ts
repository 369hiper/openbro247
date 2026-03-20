import { Browser, BrowserContext, Page, chromium, firefox, webkit } from 'playwright';
import { Logger } from '../utils/logger';

export interface BrowserEngineOptions {
  headless?: boolean;
  defaultBrowser?: 'chromium' | 'firefox' | 'webkit';
  viewport?: { width: number; height: number };
  humanLike?: boolean;
  speedMultiplier?: number;
  timeout?: number;
  slowMo?: number;
}

export class BrowserEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private options: BrowserEngineOptions;
  private logger: Logger;

  constructor(options: BrowserEngineOptions = {}) {
    this.options = {
      headless: false,
      defaultBrowser: 'chromium',
      viewport: { width: 1920, height: 1080 },
      humanLike: true,
      speedMultiplier: 1.0,
      timeout: 30000,
      slowMo: 50,
      ...options
    };
    this.logger = new Logger('BrowserEngine');
  }

  async launch(): Promise<void> {
    try {
      this.logger.info('Launching browser...');
      
      let browserInstance;
      switch (this.options.defaultBrowser) {
        case 'firefox':
          browserInstance = firefox;
          break;
        case 'webkit':
          browserInstance = webkit;
          break;
        default:
          browserInstance = chromium;
      }

      this.browser = await browserInstance.launch({
        headless: this.options.headless,
        slowMo: this.options.slowMo
      });

      this.context = await this.browser.newContext({
        viewport: this.options.viewport
      });

      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.options.timeout!);

      this.logger.info('Browser launched successfully');
    } catch (error) {
      this.logger.error('Failed to launch browser', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      this.logger.info('Closing browser...');
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.logger.info('Browser closed successfully');
    } catch (error) {
      this.logger.error('Error closing browser', error);
      throw error;
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    this.logger.info(`Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle' });
    this.logger.info(`Navigation to ${url} completed`);
  }

  async getCurrentUrl(): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page.url();
  }

  async getTitle(): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page.title();
  }

  async screenshot(path?: string): Promise<Buffer> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page.screenshot({ path });
  }

  async evaluate<T>(pageFunction: string | ((arg: any) => T)): Promise<T> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page.evaluate(pageFunction);
  }

  // MCP Tool Methods
  async click(selector: string, options: { button?: 'left' | 'right' | 'middle' } = {}): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    this.logger.info(`Clicking element: ${selector}`);
    await this.page.click(selector, { button: options.button || 'left' });
    this.logger.info(`Click completed: ${selector}`);
  }

  async type(text: string, selector?: string, clear: boolean = true): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    if (selector) {
      if (clear) {
        await this.page.fill(selector, '');
      }
      this.logger.info(`Typing "${text}" into: ${selector}`);
      await this.page.fill(selector, text);
    } else {
      this.logger.info(`Typing "${text}"`);
      await this.page.keyboard.type(text);
    }
    this.logger.info('Typing completed');
  }

  async extractText(selector: string, all: boolean = false): Promise<string | string[]> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    this.logger.info(`Extracting text from: ${selector}`);

    if (all) {
      const elements = await this.page.locator(selector).all();
      const texts = await Promise.all(elements.map(el => el.textContent()));
      return texts.filter((text): text is string => text !== null);
    } else {
      const text = await this.page.locator(selector).textContent();
      return text || '';
    }
  }

  async extractAttribute(selector: string, attribute: string, all: boolean = false): Promise<string | string[]> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    this.logger.info(`Extracting attribute "${attribute}" from: ${selector}`);

    if (all) {
      const elements = await this.page.locator(selector).all();
      const values = await Promise.all(elements.map(el => el.getAttribute(attribute)));
      return values.filter((value): value is string => value !== null);
    } else {
      const value = await this.page.locator(selector).getAttribute(attribute);
      return value || '';
    }
  }

  async waitForSelector(selector: string, timeout?: number): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    this.logger.info(`Waiting for selector: ${selector}`);
    await this.page.waitForSelector(selector, { timeout });
    this.logger.info(`Selector found: ${selector}`);
  }

  async takeScreenshot(selector?: string, fullPage: boolean = false, filename?: string): Promise<Buffer> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const options: any = { fullPage };

    if (filename) {
      options.path = filename;
    }

    this.logger.info(`Taking screenshot${selector ? ` of ${selector}` : ''}`);
    return this.page.screenshot(options);
  }

  isLaunched(): boolean {
    return !!this.browser && !!this.context && !!this.page;
  }
}