/**
 * Vision Engine
 * 
 * Provides AI-powered screen understanding:
 * - OCR (Optical Character Recognition)
 * - Object detection (UI elements, icons)
 * - Vision model integration (GPT-4V, Claude Vision)
 * - Screen content analysis
 * 
 * @module vision/screenAnalyzer
 */

import { Logger } from '../utils/logger';
import { getScreenCapture, ScreenCapture } from '../desktop/screenCapture';

const logger = new Logger('ScreenAnalyzer');

/**
 * OCR Result
 */
export interface OCRResult {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  lines: OCRLine[];
}

export interface OCRLine {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  words: OCRWord[];
}

export interface OCRWord {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/**
 * Detected UI Element
 */
export interface DetectedElement {
  type: 'button' | 'input' | 'text' | 'image' | 'icon' | 'menu' | 'link' | 'other';
  name: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  description?: string;
}

/**
 * Screen Analysis Result
 */
export interface ScreenAnalysis {
  description: string;
  elements: DetectedElement[];
  text: string;
  mainAction?: string;
  context: string;
  suggestions: string[];
}

/**
 * Vision Model Provider
 */
export type VisionProvider = 'openai' | 'anthropic' | 'local';

/**
 * Vision Engine Configuration
 */
export interface VisionEngineConfig {
  provider: VisionProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Screen Analyzer - Vision Engine
 */
export class ScreenAnalyzer {
  private screenCapture: ScreenCapture;
  private config: VisionEngineConfig;
  private isInitialized = false;

  constructor(config?: Partial<VisionEngineConfig>) {
    this.screenCapture = getScreenCapture();
    this.config = {
      provider: config?.provider || 'openai',
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
      model: config?.model || 'gpt-4o',
      baseUrl: config?.baseUrl
    };
  }

  /**
   * Initialize the vision engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.screenCapture.initialize();
      
      if (!this.config.apiKey && this.config.provider !== 'local') {
        logger.warn('No API key configured for vision provider');
      }

      this.isInitialized = true;
      logger.info('ScreenAnalyzer initialized');
    } catch (error) {
      logger.error('Failed to initialize ScreenAnalyzer', error);
      throw error;
    }
  }

  /**
   * Perform OCR on screen
   */
  async performOCR(options?: { region?: { x: number; y: number; width: number; height: number } }): Promise<OCRResult> {
    try {
      // Capture screen
      const screenshot = options?.region 
        ? await this.screenCapture.capture({
            x: options.region.x,
            y: options.region.y,
            width: options.region.width,
            height: options.region.height
          })
        : await this.screenCapture.capture();

      // Use Tesseract.js for OCR (would need to be installed)
      // For now, use vision model for text extraction
      const analysis = await this.analyzeWithVisionModel(screenshot, {
        prompt: 'Extract all visible text from this screenshot. Return ONLY the text content, nothing else.'
      });

      return {
        text: analysis.description,
        confidence: 0.9,
        boundingBox: options?.region || { x: 0, y: 0, width: 1920, height: 1080 },
        lines: []
      };
    } catch (error) {
      logger.error('OCR failed', error);
      throw error;
    }
  }

  /**
   * Detect UI elements on screen
   */
  async detectElements(): Promise<DetectedElement[]> {
    try {
      const screenshot = await this.screenCapture.capture();
      
      const analysis = await this.analyzeWithVisionModel(screenshot, {
        prompt: `Analyze this screenshot and identify all UI elements.
For each element, provide:
- type: button, input, text, image, icon, menu, link, or other
- name: descriptive name
- bounding box coordinates (x, y, width, height)
- brief description

Return as JSON array.`
      });

      // Parse the response to extract elements
      // This is simplified - would need proper JSON parsing from vision model
      return [];
    } catch (error) {
      logger.error('Element detection failed', error);
      return [];
    }
  }

  /**
   * Full screen analysis
   */
  async analyzeScreen(): Promise<ScreenAnalysis> {
    try {
      const screenshot = await this.screenCapture.capture();
      
      const analysis = await this.analyzeWithVisionModel(screenshot, {
        prompt: `Analyze this screenshot comprehensively. Provide:

1. **Description**: What is shown on screen? What application is this?
2. **Elements**: List all interactive elements (buttons, inputs, menus)
3. **Text**: Extract all visible text
4. **Main Action**: What is the primary action available?
5. **Context**: What is the user likely trying to do here?
6. **Suggestions**: What actions would you suggest?

Return as structured JSON.`
      });

      return {
        description: analysis.description,
        elements: analysis.elements || [],
        text: analysis.text || '',
        mainAction: analysis.mainAction,
        context: analysis.context,
        suggestions: analysis.suggestions || []
      };
    } catch (error) {
      logger.error('Screen analysis failed', error);
      throw error;
    }
  }

  /**
   * Analyze with vision model (GPT-4V, Claude Vision, etc.)
   */
  private async analyzeWithVisionModel(
    imageBuffer: Buffer,
    options: { prompt: string; maxTokens?: number }
  ): Promise<any> {
    const base64Image = imageBuffer.toString('base64');

    switch (this.config.provider) {
      case 'openai':
        return this.analyzeWithOpenAI(base64Image, options);
      
      case 'anthropic':
        return this.analyzeWithAnthropic(base64Image, options);
      
      case 'local':
        return this.analyzeWithLocal(base64Image, options);
      
      default:
        throw new Error(`Unknown vision provider: ${this.config.provider}`);
    }
  }

  /**
   * Analyze with OpenAI GPT-4 Vision
   */
  private async analyzeWithOpenAI(
    base64Image: string,
    options: { prompt: string; maxTokens?: number }
  ): Promise<any> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: options.prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: options.maxTokens || 2000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data: any = await response.json();
    const content = data.choices[0].message.content;

    // Try to parse as JSON
    try {
      return JSON.parse(content);
    } catch {
      return { description: content };
    }
  }

  /**
   * Analyze with Anthropic Claude Vision
   */
  private async analyzeWithAnthropic(
    base64Image: string,
    options: { prompt: string; maxTokens?: number }
  ): Promise<any> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': `${this.config.apiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens || 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: base64Image
                }
              },
              {
                type: 'text',
                text: options.prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data: any = await response.json();
    const content = data.content[0].text;

    // Try to parse as JSON
    try {
      return JSON.parse(content);
    } catch {
      return { description: content };
    }
  }

  /**
   * Analyze with local model (via Ollama or similar)
   */
  private async analyzeWithLocal(
    base64Image: string,
    options: { prompt: string; maxTokens?: number }
  ): Promise<any> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model || 'llava',
        prompt: options.prompt,
        images: [base64Image],
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local vision model error: ${error}`);
    }

    const data: any = await response.json();
    const content = data.response;

    // Try to parse as JSON
    try {
      return JSON.parse(content);
    } catch {
      return { description: content };
    }
  }

  /**
   * Find element by description
   */
  async findElement(description: string): Promise<DetectedElement | null> {
    const elements = await this.detectElements();
    
    const lowerDesc = description.toLowerCase();
    return elements.find(el => 
      el.name.toLowerCase().includes(lowerDesc) ||
      el.description?.toLowerCase().includes(lowerDesc)
    ) || null;
  }

  /**
   * Wait for element to appear
   */
  async waitForElement(
    description: string,
    options?: { timeout?: number; interval?: number }
  ): Promise<DetectedElement | null> {
    const timeout = options?.timeout || 30000;
    const interval = options?.interval || 1000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const element = await this.findElement(description);
      if (element) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return null;
  }

  /**
   * Compare two screens
   */
  async compareScreens(
    image1: Buffer,
    image2: Buffer
  ): Promise<{ similar: boolean; difference: number; changes: string[] }> {
    const base64Image1 = image1.toString('base64');
    const base64Image2 = image2.toString('base64');

    const analysis = await this.analyzeWithVisionModel(image1, {
      prompt: `Compare these two screenshots and identify the differences.
Image 1 is the first screenshot, Image 2 is the second.
Describe what changed between them.

Return JSON with:
- similar: boolean (are they essentially the same?)
- difference: number (0-1, how different are they?)
- changes: string[] (list of specific changes)`
    });

    return {
      similar: analysis.similar || false,
      difference: analysis.difference || 0,
      changes: analysis.changes || []
    };
  }
}

// Singleton instance
let _screenAnalyzer: ScreenAnalyzer | null = null;

export function getScreenAnalyzer(config?: Partial<VisionEngineConfig>): ScreenAnalyzer {
  if (!_screenAnalyzer) {
    _screenAnalyzer = new ScreenAnalyzer(config);
  }
  return _screenAnalyzer;
}
