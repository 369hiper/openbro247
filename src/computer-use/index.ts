// Core Orchestrator
export {
  ComputerUseOrchestrator,
  getComputerUseOrchestrator,
  createIntegratedAutonomousAgent,
} from './orchestrator';

// Autonomous Agent (KiloCode 2.0 Integration)
export { AutonomousAgent, createAutonomousAgent, getAutonomousAgent } from './autonomousAgent';

// Browser Agent (True browser-use integration)
export { BrowserAgent, createBrowserAgent } from './browserAgent';

// Sub-components
export { TaskPlanner } from './taskPlanner';
export { ExecutionLogger } from './executionLogger';
export { SelfImprovement } from './selfImprovement';
export { GoalNotifier } from './goalNotifier';

// Legacy Digital Operator
export {
  AutonomousDigitalOperator,
  createDigitalOperator,
  OPERATOR_CONFIGS,
} from './digitalOperator';

// Types - Core
export {
  ComputerUseTask,
  ComputerContext,
  ComputerTool,
  ComputerUseResult,
  ComputerOperation,
  DigitalOperatorConfig,
  ScreenState,
  UIElement,
} from './types';

// Types - Autonomous Agent
export {
  ExecutionPlan,
  ExecutionStep,
  ExecutionLogEntry,
  GoalNotification,
  Artifact,
  Capability,
  AutonomousAgentConfig,
  AgentState,
} from './types';
