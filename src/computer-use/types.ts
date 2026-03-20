import { BrowserEngine } from '../browser/engine';
import { WindowsControl, getWindowsControl } from '../desktop/windowsControl';
import { ScreenCapture, getScreenCapture } from '../desktop/screenCapture';
import { VSCodeController, getVSCodeController } from '../desktop/vscodeController';

// Computer Use Task Types
export interface ComputerUseTask {
  id: string;
  description: string;
  type: 'web_navigation' | 'desktop_operation' | 'coding_task' | 'research' | 'monitoring' | 'complex_workflow';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
  context?: ComputerContext;
  subtasks?: ComputerUseTask[];
  dependencies?: string[];
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

export interface ComputerContext {
  activeWindow?: string;
  openApplications?: string[];
  currentUrl?: string;
  screenState?: ScreenState;
  clipboard?: string;
  timestamp: Date;
}

export interface ScreenState {
  screenshot?: Buffer;
  activeElement?: UIElement;
  mousePosition?: { x: number; y: number };
  changedRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface UIElement {
  name: string;
  controlType: string;
  boundingRectangle: { x: number; y: number; width: number; height: number };
  isEnabled: boolean;
  isOffscreen: boolean;
  children?: UIElement[];
  automationId?: string;
}

// Computer Use Tools
export interface ComputerTool {
  name: string;
  description: string;
  capabilities: string[];
  execute: (params: any, context?: ComputerContext) => Promise<any>;
}

// Computer Use Result
export interface ComputerUseResult {
  success: boolean;
  data?: any;
  error?: string;
  context: ComputerContext;
  executionTime: number;
  toolUsed: string;
  screenshot?: Buffer;
}

// High-level Computer Operations
export interface ComputerOperation {
  type: 'open_application' | 'close_application' | 'navigate_web' | 'take_screenshot' |
        'type_text' | 'click_element' | 'edit_file' | 'run_command' | 'monitor_screen';
  target?: string;
  parameters?: Record<string, any>;
  description?: string;
}

// Autonomous Digital Operator Configuration
export interface DigitalOperatorConfig {
  name: string;
  role: string;
  capabilities: string[];
  llmModel: string;
  visionEnabled: boolean;
  maxConcurrentTasks: number;
  securityLevel: 'low' | 'medium' | 'high' | 'maximum';
  workspace: string;
  tools: {
    browser: boolean;
    desktop: boolean;
    vscode: boolean;
    screen: boolean;
    filesystem: boolean;
  };
}
