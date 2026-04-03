// ============================================================================
// RAG CHAIN - Retrieval-Augmented Generation for Code Assistance
// ============================================================================
// Inspired by Code-Assistant-AI's RAG pipeline with MMR search

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { Logger } from '../utils/logger';
import { ModelRouter } from '../models/modelRouter';
import { ModelConfig } from '../agents/types';
import {
  CodeChunk,
  CodeSearchResult,
  RAGQuery,
  RAGResponse,
  RepositoryMap,
  SearchHighlight,
  ChunkingOptions,
} from './types';
import { CodeParser } from './codeParser';

/**
 * Vector embedding interface for semantic search
 */
export interface VectorEmbedding {
  id: string;
  vector: number[];
  metadata: {
    chunkId: string;
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
  };
}

/**
 * Vector store interface for storing and querying embeddings
 */
export interface VectorStore {
  add(vectors: VectorEmbedding[]): Promise<void>;
  search(query: Vector, topK: number, minScore?: number): Promise<CodeSearchResult[]>;
  get(id: string): Promise<VectorEmbedding | null>;
  delete(ids: string[]): Promise<void>;
  clear(): Promise<void>;
  count(): number;
}

type Vector = number[];

/**
 * MMR (Maximal Marginal Relevance) search for diverse results
 */
function mmrSearch(
  queryVector: Vector,
  candidates: VectorEmbedding[],
  topK: number,
  lambda: number = 0.5
): CodeSearchResult[] {
  const selected: CodeSearchResult[] = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = cosineSimilarity(queryVector, candidate.vector);

      // Calculate max similarity to already selected items
      // Note: In a full implementation, we'd store vectors alongside results
      // For now, use content-based similarity heuristic
      let maxSim = 0;
      for (const sel of selected) {
        // Simple heuristic: check if content overlaps
        const overlap = candidate.metadata.content.includes(sel.chunk.content.slice(0, 50))
          ? 0.5
          : 0;
        maxSim = Math.max(maxSim, overlap);
      }

      // MMR score balances relevance and diversity
      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    const best = remaining.splice(bestIdx, 1)[0];
    selected.push({
      chunk: {
        id: best.id,
        content: best.metadata.content,
        filePath: best.metadata.filePath,
        language: 'typescript', // Will be determined from file
        chunkIndex: 0,
        startLine: best.metadata.startLine,
        endLine: best.metadata.endLine,
        definitions: [],
        imports: [],
        dependencies: [],
        metadata: {
          fileSize: 0,
          lastModified: new Date(),
          hash: createHash('md5').update(best.metadata.content).digest('hex'),
        },
      },
      score: bestScore,
      highlights: [],
      relatedChunks: [],
    });
  }

  return selected;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * In-memory vector store with basic similarity search
 */
export class InMemoryVectorStore implements VectorStore {
  private vectors: Map<string, VectorEmbedding> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('VectorStore');
  }

  async add(vectors: VectorEmbedding[]): Promise<void> {
    for (const v of vectors) {
      this.vectors.set(v.id, v);
    }
    this.logger.debug(`Added ${vectors.length} vectors. Total: ${this.vectors.size}`);
  }

  async search(
    queryVector: Vector,
    topK: number,
    minScore: number = 0
  ): Promise<CodeSearchResult[]> {
    const candidates: Array<VectorEmbedding & { score: number }> = [];

    for (const [_, embedding] of this.vectors) {
      const score = cosineSimilarity(queryVector, embedding.vector);
      if (score >= minScore) {
        candidates.push({ ...embedding, score });
      }
    }

    // Sort by score and return top K
    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, topK * 2); // Get more for MMR

    // Apply MMR for diversity
    const embeddings = topCandidates.map(c => {
      const { score, ...rest } = c;
      return rest;
    });

    return mmrSearch(queryVector, embeddings, topK);
  }

  async get(id: string): Promise<VectorEmbedding | null> {
    return this.vectors.get(id) || null;
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
  }

  async clear(): Promise<void> {
    this.vectors.clear();
  }

  count(): number {
    return this.vectors.size;
  }
}

/**
 * RAG Chain for code assistance
 * Combines repository indexing, vector search, and LLM generation
 */
export class RAGChain {
  private logger: Logger;
  private codeParser: CodeParser;
  private vectorStore: VectorStore;
  private modelRouter: ModelRouter;
  private modelConfig: ModelConfig;
  private repoMap: RepositoryMap | null = null;
  private indexedChunks: CodeChunk[] = [];
  private isInitialized: boolean = false;

  constructor(modelRouter: ModelRouter, modelConfig: ModelConfig, vectorStore?: VectorStore) {
    this.logger = new Logger('RAGChain');
    this.codeParser = new CodeParser();
    this.modelRouter = modelRouter;
    this.modelConfig = modelConfig;
    this.vectorStore = vectorStore || new InMemoryVectorStore();
  }

  /**
   * Index a repository for RAG
   */
  async indexRepository(
    repoPath: string,
    options?: Partial<ChunkingOptions>
  ): Promise<{
    chunks: number;
    definitions: number;
    repositoryMap: string;
  }> {
    this.logger.info(`Indexing repository: ${repoPath}`);

    // Parse repository and create chunks
    this.indexedChunks = await this.codeParser.parseRepository(repoPath, options);

    // Build repository map
    const mapResult = await this.codeParser.buildRepositoryMap(repoPath);
    this.repoMap = {
      rootPath: repoPath,
      totalFiles: mapResult.totalFiles,
      totalLines: mapResult.totalLines,
      languages: new Map(),
      structure: { name: '', path: '', type: 'directory', children: [] },
      definitions: mapResult.definitions,
      exports: new Map(),
      imports: new Map(),
      dependencyGraph: { nodes: new Map(), edges: [] },
    };

    // Create embeddings for chunks
    await this.createEmbeddings(this.indexedChunks);

    this.isInitialized = true;

    const totalDefs = Array.from(mapResult.definitions.values()).reduce(
      (sum, defs) => sum + defs.length,
      0
    );

    this.logger.info(`Indexed ${this.indexedChunks.length} chunks, ${totalDefs} definitions`);

    return {
      chunks: this.indexedChunks.length,
      definitions: totalDefs,
      repositoryMap: mapResult.structure,
    };
  }

  /**
   * Query the codebase with a question
   */
  async query(ragQuery: RAGQuery): Promise<RAGResponse> {
    if (!this.isInitialized) {
      throw new Error('RAG chain not initialized. Call indexRepository() first.');
    }

    this.logger.info(`Query: ${ragQuery.query}`);

    // Generate query embedding (simplified - use actual embedding model in production)
    const queryVector = await this.generateEmbedding(ragQuery.query);

    // Search for relevant chunks
    const searchResults = await this.vectorStore.search(
      queryVector,
      ragQuery.maxResults,
      ragQuery.minScore
    );

    // Build context from search results
    const context = this.buildContext(searchResults);

    // Add repository map if available
    const repoContext = this.repoMap
      ? `\n\nREPOSITORY STRUCTURE:\n${this.getCompactRepoMap()}`
      : '';

    // Generate answer using LLM
    const answer = await this.generateAnswer(ragQuery.query, context, repoContext);

    return {
      answer,
      sources: searchResults,
      repositoryContext: repoContext,
      confidence: this.calculateConfidence(searchResults),
      tokensUsed: 0, // Would be tracked from LLM response
    };
  }

  /**
   * Ask a question (simplified interface)
   */
  async ask(question: string, showSources: boolean = false): Promise<string> {
    const response = await this.query({
      query: question,
      maxResults: 8,
      minScore: 0.3,
      includeDefinitions: true,
      includeCode: true,
    });

    if (showSources) {
      let output = response.answer;
      output += '\n\n--- Sources ---\n';
      for (const source of response.sources.slice(0, 5)) {
        output += `\n[${source.chunk.filePath}:${source.chunk.startLine}-${source.chunk.endLine}]\n`;
        output += source.chunk.content.slice(0, 200) + '...\n';
      }
      return output;
    }

    return response.answer;
  }

  /**
   * Search code by semantic similarity
   */
  async searchCode(
    query: string,
    maxResults: number = 10,
    minScore: number = 0.5
  ): Promise<CodeSearchResult[]> {
    const queryVector = await this.generateEmbedding(query);
    return this.vectorStore.search(queryVector, maxResults, minScore);
  }

  /**
   * Get repository structure map
   */
  getRepositoryMap(): string {
    if (!this.repoMap) {
      return 'No repository indexed.';
    }
    return this.getCompactRepoMap();
  }

  /**
   * Private methods
   */
  private async createEmbeddings(chunks: CodeChunk[]): Promise<void> {
    this.logger.info(`Creating embeddings for ${chunks.length} chunks`);

    const embeddings: VectorEmbedding[] = [];

    for (const chunk of chunks) {
      // Generate embedding (simplified - use actual embedding model)
      const vector = await this.generateEmbedding(chunk.content);

      embeddings.push({
        id: chunk.id,
        vector,
        metadata: {
          chunkId: chunk.id,
          filePath: chunk.filePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
        },
      });
    }

    await this.vectorStore.add(embeddings);
  }

  /**
   * Generate embedding for text
   * In production, use OpenAI embeddings or a local embedding model
   */
  private async generateEmbedding(text: string): Promise<Vector> {
    // Simplified hash-based embedding for demonstration
    // In production, use actual embedding model
    const vector = new Array(128).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      const hash = createHash('md5').update(word).digest();
      for (let i = 0; i < 16 && i < vector.length; i++) {
        vector[i] += hash[i] / 255;
      }
    }

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  private buildContext(searchResults: CodeSearchResult[]): string {
    const contextParts: string[] = [];

    for (const result of searchResults) {
      contextParts.push(
        `// File: ${result.chunk.filePath} (lines ${result.chunk.startLine}-${result.chunk.endLine})\n` +
          result.chunk.content
      );
    }

    return contextParts.join('\n\n');
  }

  private async generateAnswer(
    question: string,
    context: string,
    repoContext: string
  ): Promise<string> {
    const systemPrompt = `You are a Senior Software Engineer assisting with a codebase.
Use the following pieces of retrieved context to answer the question.
If the context doesn't contain the answer, say "I don't have enough context to answer this question."${repoContext}

CONTEXT FROM REPOSITORY:
${context}

USER QUESTION:
${question}

Instructions:
- Answer specifically using the class names, function names, and variable names found in the context
- Reference file paths when relevant
- If the repository map shows relevant files not in the context, mention them
- Provide code examples when appropriate
- Be precise and technical

Answer:`;

    try {
      const response = await this.modelRouter.route('rag-query', this.modelConfig, question, {
        systemMessage: systemPrompt,
        maxTokens: 2000,
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to generate answer', error);
      return 'Failed to generate answer. Please try again.';
    }
  }

  private calculateConfidence(searchResults: CodeSearchResult[]): number {
    if (searchResults.length === 0) return 0;
    const avgScore = searchResults.reduce((sum, r) => sum + r.score, 0) / searchResults.length;
    return Math.min(avgScore * 1.5, 1); // Scale to 0-1
  }

  private getCompactRepoMap(): string {
    if (!this.repoMap) return '';

    const lines: string[] = [];
    lines.push(`Repository: ${this.repoMap.rootPath}`);
    lines.push(`Files: ${this.repoMap.totalFiles}, Lines: ${this.repoMap.totalLines}`);
    lines.push('');

    // This would use the actual structure from buildRepositoryMap
    // For now, return a placeholder
    return lines.join('\n');
  }
}
