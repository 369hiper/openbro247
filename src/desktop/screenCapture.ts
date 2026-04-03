/**
 * Screen Capture Module
 * 
 * Captures screen content using Windows Desktop Duplication API
 * for high-performance, real-time screen capture.
 * 
 * @module desktop/screenCapture
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import screenshot from 'screenshot-desktop';
import { Jimp } from 'jimp';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);
const logger = new Logger('ScreenCapture');

/**
 * Screen capture options
 */
export interface CaptureOptions {
  monitor?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'png' | 'jpeg' | 'bmp';
}

/**
 * Screen information
 */
export interface MonitorInfo {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary: boolean;
  deviceName: string;
}

/**
 * Screen Capture Controller
 */
export class ScreenCapture {
  private isInitialized = false;

  /**
   * Initialize screen capture
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (process.platform !== 'win32') {
        throw new Error('ScreenCapture is only available on Windows');
      }

      // Test capture capability
      await this.capture({ format: 'png' });

      this.isInitialized = true;
      logger.info('ScreenCapture initialized');
    } catch (error) {
      logger.error('Failed to initialize ScreenCapture', error);
      throw error;
    }
  }

  async getMonitors(): Promise<MonitorInfo[]> {
    try {
      const displays = await screenshot.listDisplays();
      return displays.map((d: any, index: number) => ({
        index,
        x: 0,
        y: 0,
        width: typeof d.width === 'number' ? d.width : 1920,
        height: typeof d.height === 'number' ? d.height : 1080,
        isPrimary: index === 0, // Assumption as screenshot-desktop doesn't expose it
        deviceName: d.name || `Display ${index}`
      }));
    } catch(err) {
      logger.error('Failed to get monitors', err);
      return [];
    }
  }

  async capture(options?: CaptureOptions): Promise<Buffer> {
    let format: 'png' | 'jpg' = 'png';
    if (options?.format === 'jpeg') format = 'jpg';
    
    try {
      const imgBuffer = await screenshot({ format });
      return imgBuffer;
    } catch (error) {
      logger.error('Failed to capture screen', error);
      throw error;
    }
  }

  /**
   * Capture specific window
   */
  async captureWindow(windowTitle: string, options?: Partial<CaptureOptions>): Promise<Buffer> {
    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
        [DllImport("user32.dll")]
        public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
        
        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
      }
      
      [StructLayout(LayoutKind.Sequential)]
      public struct RECT {
        public int Left, Top, Right, Bottom;
      }
"@

      $hwnd = [Win32]::FindWindow($null, "${windowTitle}")
      if ($hwnd -eq [IntPtr]::Zero) {
        Write-Error "Window not found: ${windowTitle}"
        exit 1
      }
      
      $rect = New-Object Win32+RECT
      [Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
      
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      
      # Output coordinates
      $rect.Left.ToString() + "," + $rect.Top.ToString() + "," + $width.ToString() + "," + $height.ToString()
    `;

    try {
      const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '`"')}"`);
      const coords = stdout.trim().split(',');
      if (coords.length !== 4) throw new Error('Failed to get window coordinates');
      
      const x = parseInt(coords[0], 10);
      const y = parseInt(coords[1], 10);
      const width = parseInt(coords[2], 10);
      const height = parseInt(coords[3], 10);

      // Capture full screen
      const fullScreenBuffer = await this.capture({ format: 'png' });
      
      // Crop with Jimp
      const image = await Jimp.read(fullScreenBuffer);
      image.crop({ x, y, w: width, h: height });
      
      return await image.getBuffer('image/png');
    } catch (error) {
      logger.error(`Failed to capture window "${windowTitle}"`, error);
      throw error;
    }
  }

  /**
   * Capture to file
   */
  async captureToFile(filePath: string, options?: CaptureOptions): Promise<void> {
    const buffer = await this.capture(options);
    
    // Ensure directory exists
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });
    
    await writeFile(filePath, buffer);
    logger.info(`Screenshot saved to: ${filePath}`);
  }

  /**
   * Continuous capture for video/streaming
   */
  async *captureStream(options?: CaptureOptions & { fps?: number }): AsyncGenerator<Buffer> {
    const fps = options?.fps || 10;
    const interval = 1000 / fps;

    while (true) {
      const start = Date.now();
      yield await this.capture(options);
      const elapsed = Date.now() - start;
      const delay = Math.max(0, interval - elapsed);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Get screen content as base64
   */
  async captureAsBase64(options?: CaptureOptions): Promise<string> {
    const buffer = await this.capture(options);
    const format = options?.format || 'png';
    const mimeType = `image/${format}`;
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  /**
   * Detect screen changes
   */
  async detectChanges(
    previousBuffer: Buffer,
    options?: CaptureOptions & { threshold?: number }
  ): Promise<{ changed: boolean; difference: number; regions: Array<{ x: number; y: number; width: number; height: number }> }> {
    const currentBuffer = await this.capture(options);
    
    // Simple hash comparison for change detection
    const previousHash = this.hashBuffer(previousBuffer);
    const currentHash = this.hashBuffer(currentBuffer);
    
    if (previousHash === currentHash) {
      return { changed: false, difference: 0, regions: [] };
    }

    // For detailed region detection, we'd need image processing
    // This is a simplified version
    return {
      changed: true,
      difference: 1,
      regions: [{ x: 0, y: 0, width: 1920, height: 1080 }]
    };
  }

  private hashBuffer(buffer: Buffer): string {
    // Simple hash for change detection
    let hash = 0;
    for (let i = 0; i < buffer.length; i += 1000) {
      hash = ((hash << 5) - hash) + buffer[i];
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// Singleton instance
let _screenCapture: ScreenCapture | null = null;

export function getScreenCapture(): ScreenCapture {
  if (!_screenCapture) {
    _screenCapture = new ScreenCapture();
  }
  return _screenCapture;
}
