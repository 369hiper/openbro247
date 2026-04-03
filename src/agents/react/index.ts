// ============================================================================
// REACT MODULE - ReAct Agent with LangGraph State Machine
// ============================================================================
// Combines web-ui's agent pattern with LangGraph-style state management

// State Graph
export { StateGraph, CompiledGraph, GraphBuilder } from './stateGraph';
export type {
  NodeHandler,
  EdgeCondition,
  GraphNode,
  GraphEdge,
  GraphExecutionResult,
  ExecutionOptions,
} from './stateGraph';

// ReAct Agent
export { ReActAgent, AgentFactory } from './reActAgent';
export type {
  AgentAction,
  AgentObservation,
  AgentStep,
  AgentHistory,
  AgentState,
  Tool,
  ToolParameter,
  ToolResult,
  ReActAgentConfig,
} from './reActAgent';

// Deep Research Agent
export { DeepResearchAgent } from '../deep-research/deepResearchAgent';
export type {
  ResearchTask,
  ResearchCategory,
  SearchResult,
  DeepResearchState,
  DeepResearchConfig,
  DeepResearchResult,
} from '../deep-research/deepResearchAgent';
