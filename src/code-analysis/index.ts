// ============================================================================
// CODE ANALYSIS MODULE - AST-Based Code Parsing & RAG
// ============================================================================
// Exports Code-Assistant-AI style AST parsing and RAG capabilities

// Code Parser
export { CodeParser } from './codeParser';

// RAG Chain
export { RAGChain, InMemoryVectorStore } from './ragChain';
export type { VectorEmbedding, VectorStore } from './ragChain';

// Types
export type {
  ProgrammingLanguage,
  ASTNode,
  CodeDefinition,
  CodeChunk,
  ChunkingOptions,
  CodeSearchResult,
  RepositoryMap,
  FileTreeNode,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  SearchHighlight,
  RAGQuery,
  RAGResponse,
  CodeAnalysisResult,
  ComplexityMetrics,
  DocumentationInfo,
  ParameterInfo,
} from './types';
