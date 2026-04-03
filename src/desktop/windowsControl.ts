/**
 * Windows Desktop Control Module
 * 
 * Provides native Windows automation capabilities:
 * - UI Automation for controlling any Windows application
 * - Keyboard/mouse input simulation
 * - Process management
 * - VS Code integration
 * 
 * @module desktop/windowsControl
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { keyboard, mouse, Key, Point, Button } from '@nut-tree-fork/nut-js';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

const logger = new Logger('WindowsControl');

/**
 * Window information
 */
export interface WindowInfo {
  hwnd: number;
  title: string;
  className: string;
  processId: number;
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * UI Element information
 */
export interface UIElement {
  name: string;
  controlType: string;
  boundingRectangle: { x: number; y: number; width: number; height: number };
  isEnabled: boolean;
  isOffscreen: boolean;
  children?: UIElement[];
}

/**
 * Key codes for keyboard input
 */
export const VirtualKeys: Record<string, number> = {
  // Special keys
  BACKSPACE: 0x08,
  TAB: 0x09,
  ENTER: 0x0D,
  SHIFT: 0x10,
  CONTROL: 0x11,
  ALT: 0x12,
  PAUSE: 0x13,
  CAPS_LOCK: 0x14,
  ESCAPE: 0x1B,
  SPACE: 0x20,
  PAGE_UP: 0x21,
  PAGE_DOWN: 0x22,
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  PRINT: 0x2A,
  PRINT_SCREEN: 0x2C,
  INSERT: 0x2D,
  DELETE: 0x2E,
  
  // Number keys
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
  
  // Letter keys
  'A': 0x41, 'B': 0x42, 'C': 0x43, 'D': 0x44, 'E': 0x45,
  'F': 0x46, 'G': 0x47, 'H': 0x48, 'I': 0x49, 'J': 0x4A,
  'K': 0x4B, 'L': 0x4C, 'M': 0x4D, 'N': 0x4E, 'O': 0x4F,
  'P': 0x50, 'Q': 0x51, 'R': 0x52, 'S': 0x53, 'T': 0x54,
  'U': 0x55, 'V': 0x56, 'W': 0x57, 'X': 0x58, 'Y': 0x59,
  'Z': 0x5A,
  
  // Function keys
  F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73,
  F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77,
  F9: 0x78, F10: 0x79, F11: 0x7A, F12: 0x7B,
  
  // Numpad
  NUMPAD_0: 0x60, NUMPAD_1: 0x61, NUMPAD_2: 0x62, NUMPAD_3: 0x63,
  NUMPAD_4: 0x64, NUMPAD_5: 0x65, NUMPAD_6: 0x66, NUMPAD_7: 0x67,
  NUMPAD_8: 0x68, NUMPAD_9: 0x69,
};

/**
 * Windows Desktop Controller
 * 
 * Uses PowerShell and Windows APIs for desktop automation
 */
export class WindowsControl {
  private isInitialized = false;

  /**
   * Initialize the Windows control module
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Verify we're on Windows
      if (process.platform !== 'win32') {
        throw new Error('WindowsControl is only available on Windows');
      }
      
      // Test PowerShell availability
      await execAsync('powershell -Command "Write-Host OK"');
      
      this.isInitialized = true;
      logger.info('WindowsControl initialized');
    } catch (error) {
      logger.error('Failed to initialize WindowsControl', error);
      throw error;
    }
  }

  /**
   * Get list of all open windows
   */
  async getWindows(): Promise<WindowInfo[]> {
    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsWindowVisible(IntPtr hWnd);
        
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
        
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern int GetWindowTextLength(IntPtr hWnd);
        
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();
        
        [DllImport("user32.dll")]
        public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
        
        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
        
        [DllImport("user32.dll")]
        public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder className, int count);
        
        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
      }
      
      [StructLayout(LayoutKind.Sequential)]
      public struct RECT {
        public int Left, Top, Right, Bottom;
      }
"@

      $windows = @()
      $hwnd = [Win32]::GetForegroundWindow()
      
      while ($hwnd -ne [IntPtr]::Zero) {
        if ([Win32]::IsWindowVisible($hwnd)) {
          $length = [Win32]::GetWindowTextLength($hwnd)
          if ($length -gt 0) {
            $sb = New-Object System.Text.StringBuilder ($length + 1)
            [Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
            $title = $sb.ToString()
            
            $classNameSb = New-Object System.Text.StringBuilder 256
            [Win32]::GetClassName($hwnd, $classNameSb, 256) | Out-Null
            $className = $classNameSb.ToString()
            
            $rect = New-Object Win32+RECT
            [Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
            
            $processId = 0
            [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
            
            $windows += @{
              hwnd = [int]$hwnd
              title = $title
              className = $className
              processId = $processId
              x = $rect.Left
              y = $rect.Top
              width = $rect.Right - $rect.Left
              height = $rect.Bottom - $rect.Top
            }
          }
        }
        $hwnd = [Win32]::GetWindow($hwnd, 2)  # GW_HWNDNEXT
      }
      
      $windows | ConvertTo-Json -Depth 3
    `;
    
    try {
      const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '`"')}"`);
      return JSON.parse(stdout) || [];
    } catch (error) {
      logger.error('Failed to get windows', error);
      return [];
    }
  }

  /**
   * Find window by title or class name
   */
  async findWindow(options: { title?: string; className?: string; processName?: string }): Promise<WindowInfo | null> {
    const windows = await this.getWindows();
    
    return windows.find(win => {
      if (options.title && !win.title.toLowerCase().includes(options.title!.toLowerCase())) {
        return false;
      }
      if (options.className && !win.className.toLowerCase().includes(options.className!.toLowerCase())) {
        return false;
      }
      return true;
    }) || null;
  }

  /**
   * Activate/focus a window
   */
  async activateWindow(hwnd: number): Promise<void> {
    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      }
"@
      
      [Win32]::ShowWindow([IntPtr]${hwnd}, 9)  # SW_RESTORE
      [Win32]::SetForegroundWindow([IntPtr]${hwnd}) | Out-Null
    `;
    
    await execAsync(`powershell -Command "${script}"`);
    logger.info(`Activated window ${hwnd}`);
  }

  /**
   * Close a window
   */
  async closeWindow(hwnd: number): Promise<void> {
    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
        [DllImport("user32.dll")]
        public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
      }
"@
      
      [Win32]::PostMessage([IntPtr]${hwnd}, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null  # WM_CLOSE
    `;
    
    await execAsync(`powershell -Command "${script}"`);
    logger.info(`Closed window ${hwnd}`);
  }

  /**
   * Launch an application
   */
  async launchApplication(application: string, args?: string[]): Promise<number> {
    const argString = args ? args.join(' ') : '';
    const script = `
      $process = Start-Process -FilePath "${application}" -ArgumentList "${argString}" -PassThru
      $process.Id
    `;
    
    const { stdout } = await execAsync(`powershell -Command "${script}"`);
    const processId = parseInt(stdout.trim(), 10);
    logger.info(`Launched ${application} with PID ${processId}`);
    return processId;
  }

  /**
   * Get UI elements in a window using UI Automation
   */
  async getUIElements(hwnd?: number): Promise<UIElement[]> {
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      ${hwnd ? `$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::HandleProperty, ${hwnd})))` : '$window = $root'}
      
      if ($window) {
        $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $result = @()
        
        foreach ($el in $elements) {
          if ($el.Current.Name -and $el.Current.Name.Trim()) {
            $rect = $el.Current.BoundingRectangle
            $result += @{
              name = $el.Current.Name
              controlType = $el.Current.ControlType.ProgrammaticName
              boundingRectangle = @{
                x = [int]$rect.X
                y = [int]$rect.Y
                width = [int]$rect.Width
                height = [int]$rect.Height
              }
              isEnabled = $el.Current.IsEnabled
              isOffscreen = $el.Current.IsOffscreen
            }
          }
        }
        
        $result | ConvertTo-Json -Depth 5
      } else {
        '[]'
      }
    `;
    
    try {
      const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '`"')}"`);
      return JSON.parse(stdout) || [];
    } catch (error) {
      logger.error('Failed to get UI elements', error);
      return [];
    }
  }

  /**
   * Find UI element by name
   */
  async findUIElement(name: string, hwnd?: number): Promise<UIElement | null> {
    const elements = await this.getUIElements(hwnd);
    return elements.find(el => el.name.toLowerCase().includes(name.toLowerCase())) || null;
  }

  /**
   * Click on a UI element
   */
  async clickElement(element: UIElement): Promise<void> {
    const centerX = element.boundingRectangle.x + element.boundingRectangle.width / 2;
    const centerY = element.boundingRectangle.y + element.boundingRectangle.height / 2;
    
    await this.mouseClick(centerX, centerY);
    logger.info(`Clicked on element "${element.name}" at (${centerX}, ${centerY})`);
  }

  /**
   * Move mouse to position
   */
  async mouseMove(x: number, y: number): Promise<void> {
    await mouse.setPosition(new Point(x, y));
  }

  /**
   * Click mouse at position
   */
  async mouseClick(x: number, y: number, btn: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.mouseMove(x, y);
    
    if (btn === 'right') {
      await mouse.click(Button.RIGHT);
    } else if (btn === 'middle') {
      await mouse.click(Button.MIDDLE);
    } else {
      await mouse.click(Button.LEFT);
    }
  }

  /**
   * Send keyboard input
   */
  async sendKeys(keys: string, options?: { ctrl?: boolean; alt?: boolean; shift?: boolean }): Promise<void> {
    const modifiers = [];
    if (options?.ctrl) modifiers.push('^');
    if (options?.alt) modifiers.push('%');
    if (options?.shift) modifiers.push('+');
    
    const keyString = modifiers.join('') + keys;
    
    const script = `
      Add-Type -AssemblyName Microsoft.VisualBasic
      [Microsoft.VisualBasic.Interaction]::SendKeys("${keyString}", $true)
    `;
    
    await execAsync(`powershell -Command "${script}"`);
    logger.debug(`Sent keys: ${keys}`);
  }

  /**
   * Type text with human-like delay
   */
  async typeText(text: string, options?: { delay?: number; element?: UIElement }): Promise<void> {
    if (options?.element) {
      await this.clickElement(options.element);
    }
    
    // Fallback to powershell for complex types or use nut-js
    keyboard.config.autoDelayMs = options?.delay || 50;
    await keyboard.type(text);
    
    logger.debug(`Typed text: ${text}`);
  }

  /**
   * Press special key
   */
  async pressKey(key: string, options?: { ctrl?: boolean; alt?: boolean; shift?: boolean; duration?: number }): Promise<void> {
    const keyMap: Record<string, string> = {
      'ENTER': '~',
      'BACKSPACE': '{BACKSPACE}',
      'TAB': '{TAB}',
      'ESCAPE': '{ESC}',
      'DELETE': '{DELETE}',
      'HOME': '{HOME}',
      'END': '{END}',
      'PAGE_UP': '{PGUP}',
      'PAGE_DOWN': '{PGDN}',
      'LEFT': '{LEFT}',
      'UP': '{UP}',
      'RIGHT': '{RIGHT}',
      'DOWN': '{DOWN}',
      'F1': '{F1}', 'F2': '{F2}', 'F3': '{F3}', 'F4': '{F4}',
      'F5': '{F5}', 'F6': '{F6}', 'F7': '{F7}', 'F8': '{F8}',
      'F9': '{F9}', 'F10': '{F10}', 'F11': '{F11}', 'F12': '{F12}',
    };
    
    const sendKey = keyMap[key.toUpperCase()] || key;
    await this.sendKeys(sendKey, options);
  }

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    const script = `
      Set-Clipboard -Value @"
${text}
"@
    `;
    
    await execAsync(`powershell -Command "${script}"`);
    logger.debug('Copied to clipboard');
  }

  /**
   * Get clipboard content
   */
  async getClipboardContent(): Promise<string> {
    const script = `
      Get-Clipboard -Raw
    `;
    
    const { stdout } = await execAsync(`powershell -Command "${script}"`);
    return stdout.trim();
  }

  /**
   * Get all running processes
   */
  async getProcesses(): Promise<Array<{ name: string; id: number; cpu: number; memory: number }>> {
    const script = `
      Get-Process | Select-Object Name, Id, CPU, WorkingSet64 | ConvertTo-Json
    `;
    
    const { stdout } = await execAsync(`powershell -Command "${script}"`);
    const processes = JSON.parse(stdout);
    return processes.map((p: any) => ({
      name: p.Name,
      id: p.Id,
      cpu: p.CPU || 0,
      memory: p.WorkingSet64 || 0
    }));
  }

  /**
   * Kill a process
   */
  async killProcess(processId: number): Promise<void> {
    const script = `
      Stop-Process -Id ${processId} -Force
    `;
    
    await execAsync(`powershell -Command "${script}"`);
    logger.info(`Killed process ${processId}`);
  }
}

// Singleton instance
let _windowsControl: WindowsControl | null = null;

export function getWindowsControl(): WindowsControl {
  if (!_windowsControl) {
    _windowsControl = new WindowsControl();
  }
  return _windowsControl;
}
