// Agent Manager
export { AgentManager } from './agentManager';
export { Agent, AgentConfig, AgentFilters, ModelConfig } from './types';

// LangGraph-style Orchestrator
export { LangGraphOrchestrator } from './orchestrator/langGraph';
export type {
  AgentState,
  AgentMode,
  ExecutionPlan,
  PlanStep,
  StepResult,
  GraphNode,
  GraphTransition,
} from './orchestrator/langGraph';

// Permission System
export { PermissionManager, getPermissionManager } from './permissions/permissionManager';
export { PermissionAwareAgent, getPermissionAwareAgent } from './permissions/permissionAwareAgent';
export type {
  PermissionType,
  PermissionScope,
  PermissionRequest,
  PermissionEvent,
} from './permissions/permissionManager';

// CLI Integration (KiloCode/Cline - Open Source)
export {
  KiloCodeOpenSourceBridge,
  ClineOpenSourceBridge,
} from './cliIntegration/kiloCodeBridge';
export type {
  MCPServerConfig,
  OpenSourceTool,
  CodeGenerationRequest,
} from './cliIntegration/kiloCodeBridge';

// Multi-Agent Parallel Execution
export {
  MultiAgentOrchestrator,
  getMultiAgentOrchestrator,
} from './multiAgent/multiAgentOrchestrator';
export type {
  AgentRole,
  AgentInstance,
  AgentTask,
  TaskStep,
  TaskResult,
  AgentLogEntry,
  AgentStats,
  BrowserTabAssignment,
  CorrectionRequest,
} from './multiAgent/multiAgentOrchestrator';

// App Orchestrator
export { AppOrchestrator } from './appOrchestrator/appOrchestrator';
export type {
  AppDefinition,
  AppConfig,
  TestResult,
  AppError,
  AppLog,
} from './appOrchestrator/appOrchestrator';
