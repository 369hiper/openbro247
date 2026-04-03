// ============================================================================
// TOOL USE MODULE - Cline-Style XML Tool Call Parsing
// ============================================================================
// Provides XML-based tool call parsing for agentic AI interactions

// Tool Parser
export { ToolParser, ToolCallBuilder, ResponseFormatter } from './toolParser';
export type {
  ToolParamDef,
  ToolDefinition,
  ToolUse,
  TextContent,
  AssistantMessageContent,
  ParseOptions,
} from './toolParser';

// Default tools
export {
  DEFAULT_TOOLS,
  getToolNames,
  getToolOpenTag,
  getToolCloseTag,
  getParamOpenTag,
  getParamCloseTag,
} from './toolParser';
