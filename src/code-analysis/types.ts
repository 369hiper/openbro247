// ============================================================================
// CODE ANALYSIS TYPES
// ============================================================================
// Inspired by Code-Assistant-AI's AST-based parsing approach

/**
 * Programming languages supported for code parsing
 */
export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'cpp'
  | 'csharp'
  | 'ruby'
  | 'php';

/**
 * AST node types for code structure
 */
export interface ASTNode {
  type: string;
  name?: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  children: ASTNode[];
  properties: Record<string, unknown>;
}

/**
 * Code definition extracted from AST
 */
export interface CodeDefinition {
  type:
    | 'class'
    | 'function'
    | 'method'
    | 'interface'
    | 'type'
    | 'enum'
    | 'variable'
    | 'import'
    | 'export';
  name: string;
  signature?: string;
  documentation?: string;
  filePath: string;
  startLine: number;
  endLine: number;
  visibility?: 'public' | 'private' | 'protected';
  isAsync?: boolean;
  isExported?: boolean;
  parameters?: ParameterInfo[];
  returnType?: string;
  parentClass?: string;
  decorators?: string[];
}

/**
 * Parameter information
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  defaultValue?: string;
  isOptional: boolean;
  isRest?: boolean;
}

/**
 * Code chunk for RAG/vector storage
 */
export interface CodeChunk {
  id: string;
  content: string;
  filePath: string;
  language: ProgrammingLanguage;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  definitions: CodeDefinition[];
  imports: string[];
  dependencies: string[];
  metadata: {
    fileSize: number;
    lastModified: Date;
    hash: string;
  };
}

/**
 * Repository structure map
 */
export interface RepositoryMap {
  rootPath: string;
  totalFiles: number;
  totalLines: number;
  languages: Map<ProgrammingLanguage, number>;
  structure: FileTreeNode;
  definitions: Map<string, CodeDefinition[]>;
  exports: Map<string, string[]>;
  imports: Map<string, string[]>;
  dependencyGraph: DependencyGraph;
}

/**
 * File tree node for repository structure
 */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  language?: ProgrammingLanguage;
  definitions?: string[];
  children?: FileTreeNode[];
}

/**
 * Dependency graph for code relationships
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
}

export interface DependencyNode {
  filePath: string;
  imports: string[];
  exports: string[];
  definitions: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'extends' | 'implements' | 'calls' | 'references';
}

/**
 * Repository chunking options
 */
export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  preserveStructure: boolean;
  includeComments: boolean;
  maxDepth?: number;
  excludePatterns: string[];
  includePatterns: string[];
}

/**
 * Code search result
 */
export interface CodeSearchResult {
  chunk: CodeChunk;
  score: number;
  highlights: SearchHighlight[];
  relatedChunks: string[];
}

export interface SearchHighlight {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  text: string;
}

/**
 * RAG (Retrieval-Augmented Generation) types
 */
export interface RAGQuery {
  query: string;
  maxResults: number;
  minScore: number;
  includeDefinitions: boolean;
  includeCode: boolean;
  languages?: ProgrammingLanguage[];
}

export interface RAGResponse {
  answer: string;
  sources: CodeSearchResult[];
  repositoryContext?: string;
  confidence: number;
  tokensUsed: number;
}

/**
 * Code analysis result
 */
export interface CodeAnalysisResult {
  filePath: string;
  language: ProgrammingLanguage;
  ast: ASTNode;
  definitions: CodeDefinition[];
  imports: string[];
  exports: string[];
  complexity: ComplexityMetrics;
  documentation: DocumentationInfo;
}

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  commentRatio: number;
  functionCount: number;
  classCount: number;
}

export interface DocumentationInfo {
  hasJSDoc: boolean;
  hasReadme: boolean;
  undocumentedFunctions: number;
  undocumentedClasses: number;
  coverage: number;
}
