// ============================================================================
// CODE PARSER - AST-Based Code Analysis
// ============================================================================
// Inspired by Code-Assistant-AI's Tree-sitter approach, adapted for TypeScript

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import {
  ProgrammingLanguage,
  ASTNode,
  CodeDefinition,
  CodeChunk,
  ChunkingOptions,
  CodeAnalysisResult,
  ComplexityMetrics,
  ParameterInfo,
} from './types';

/**
 * AST-based code parser that extracts semantic code structures
 * Similar to Code-Assistant-AI's Tree-sitter approach but for TypeScript/JavaScript
 */
export class CodeParser {
  private logger: Logger;
  private defaultChunkSize: number = 2000;
  private defaultChunkOverlap: number = 200;

  constructor() {
    this.logger = new Logger('CodeParser');
  }

  /**
   * Parse a file and extract code definitions using regex-based AST approximation
   * For production use, integrate with Tree-sitter WASM bindings
   */
  async parseFile(filePath: string): Promise<CodeAnalysisResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);
    const stats = await fs.stat(filePath);

    this.logger.info(`Parsing ${filePath} (${language}, ${stats.size} bytes)`);

    const ast = this.buildAST(content, language);
    const definitions = this.extractDefinitions(content, filePath, language);
    const imports = this.extractImports(content, language);
    const exports = this.extractExports(content, language);
    const complexity = this.calculateComplexity(content, definitions);
    const documentation = this.analyzeDocumentation(content, definitions);

    return {
      filePath,
      language,
      ast,
      definitions,
      imports,
      exports,
      complexity,
      documentation,
    };
  }

  /**
   * Parse repository and create chunks for RAG
   */
  async parseRepository(
    repoPath: string,
    options: Partial<ChunkingOptions> = {}
  ): Promise<CodeChunk[]> {
    const opts: ChunkingOptions = {
      chunkSize: options.chunkSize ?? this.defaultChunkSize,
      chunkOverlap: options.chunkOverlap ?? this.defaultChunkOverlap,
      preserveStructure: options.preserveStructure ?? true,
      includeComments: options.includeComments ?? true,
      maxDepth: options.maxDepth ?? 10,
      excludePatterns: options.excludePatterns ?? [
        'node_modules',
        '.git',
        'dist',
        'build',
        '__pycache__',
      ],
      includePatterns: options.includePatterns ?? ['.ts', '.js', '.tsx', '.jsx', '.py'],
    };

    this.logger.info(`Parsing repository at ${repoPath}`);
    const files = await this.findSourceFiles(repoPath, opts);
    this.logger.info(`Found ${files.length} source files`);

    const chunks: CodeChunk[] = [];
    for (const filePath of files) {
      try {
        const fileChunks = await this.chunkFile(filePath, opts);
        chunks.push(...fileChunks);
      } catch (error) {
        this.logger.warn(`Failed to parse ${filePath}: ${error}`);
      }
    }

    this.logger.info(`Created ${chunks.length} code chunks from ${files.length} files`);
    return chunks;
  }

  /**
   * Build a repository map for global codebase understanding
   */
  async buildRepositoryMap(repoPath: string): Promise<{
    structure: string;
    definitions: Map<string, CodeDefinition[]>;
    totalFiles: number;
    totalLines: number;
  }> {
    const files = await this.findSourceFiles(repoPath, {
      excludePatterns: ['node_modules', '.git', 'dist'],
      includePatterns: ['.ts', '.js', '.tsx', '.jsx', '.py'],
    } as ChunkingOptions);

    const definitions = new Map<string, CodeDefinition[]>();
    let totalLines = 0;
    const treeLines: string[] = [];

    treeLines.push(`${path.basename(repoPath)}/`);

    for (const filePath of files) {
      try {
        const analysis = await this.parseFile(filePath);
        definitions.set(filePath, analysis.definitions);
        totalLines += analysis.complexity.linesOfCode;

        const relativePath = path.relative(repoPath, filePath);
        const depth = relativePath.split(path.sep).length;
        const indent = '  '.repeat(depth);

        treeLines.push(`${indent}${path.basename(filePath)}:`);

        // Add definitions
        for (const def of analysis.definitions.slice(0, 5)) {
          treeLines.push(`${indent}  - ${def.type} ${def.name}`);
        }

        if (analysis.definitions.length > 5) {
          treeLines.push(`${indent}  ... and ${analysis.definitions.length - 5} more`);
        }
      } catch (error) {
        this.logger.debug(`Skipping ${filePath}: ${error}`);
      }
    }

    return {
      structure: treeLines.join('\n'),
      definitions,
      totalFiles: files.length,
      totalLines,
    };
  }

  /**
   * Chunk a single file into semantic code units
   */
  private async chunkFile(filePath: string, options: ChunkingOptions): Promise<CodeChunk[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];

    // First, extract definitions to use as chunk boundaries
    const definitions = this.extractDefinitions(content, filePath, language);
    const imports = this.extractImports(content, language);

    // Group definitions into chunks
    let currentChunk: string[] = [];
    let currentStartLine = 1;
    let chunkIndex = 0;
    let currentDefinitions: CodeDefinition[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);

      // Check if we've reached chunk size
      const chunkContent = currentChunk.join('\n');
      const relevantDefs = definitions.filter(
        d => d.startLine >= currentStartLine && d.endLine <= currentStartLine + currentChunk.length
      );

      if (chunkContent.length >= options.chunkSize || relevantDefs.length >= 3) {
        // Create chunk at natural boundary (end of function/class)
        const chunkEndLine = currentStartLine + currentChunk.length - 1;

        chunks.push({
          id: uuidv4(),
          content: chunkContent,
          filePath,
          language,
          chunkIndex: chunkIndex++,
          startLine: currentStartLine,
          endLine: chunkEndLine,
          definitions: relevantDefs,
          imports: imports.filter(imp => {
            const lineNum = this.findImportLine(imp, lines);
            return lineNum >= currentStartLine && lineNum <= chunkEndLine;
          }),
          dependencies: [],
          metadata: {
            fileSize: content.length,
            lastModified: new Date(),
            hash: createHash('md5').update(chunkContent).digest('hex'),
          },
        });

        // Start new chunk with overlap
        const overlapLines = Math.min(options.chunkOverlap / 10, 20);
        const overlapStart = Math.max(0, currentChunk.length - overlapLines);
        currentChunk = currentChunk.slice(overlapStart);
        currentStartLine = chunkEndLine - overlapLines + 1;
        currentDefinitions = [];
      }
    }

    // Add final chunk if any content remains
    if (currentChunk.length > 0) {
      chunks.push({
        id: uuidv4(),
        content: currentChunk.join('\n'),
        filePath,
        language,
        chunkIndex: chunkIndex,
        startLine: currentStartLine,
        endLine: currentStartLine + currentChunk.length - 1,
        definitions: definitions.filter(d => d.startLine >= currentStartLine),
        imports: imports.filter(imp => {
          const lineNum = this.findImportLine(imp, lines);
          return lineNum >= currentStartLine;
        }),
        dependencies: [],
        metadata: {
          fileSize: content.length,
          lastModified: new Date(),
          hash: createHash('md5').update(currentChunk.join('\n')).digest('hex'),
        },
      });
    }

    return chunks;
  }

  /**
   * Extract code definitions from source
   */
  private extractDefinitions(
    content: string,
    filePath: string,
    language: ProgrammingLanguage
  ): CodeDefinition[] {
    const definitions: CodeDefinition[] = [];
    const lines = content.split('\n');

    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.extractTypeScriptDefinitions(content, filePath, lines);
      case 'python':
        return this.extractPythonDefinitions(content, filePath, lines);
      default:
        return this.extractGenericDefinitions(content, filePath, lines);
    }
  }

  /**
   * Extract TypeScript/JavaScript definitions
   */
  private extractTypeScriptDefinitions(
    content: string,
    filePath: string,
    lines: string[]
  ): CodeDefinition[] {
    const definitions: CodeDefinition[] = [];
    let braceDepth = 0;
    let currentClass: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Class definition
      const classMatch = line.match(
        /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w, ]+)?/
      );
      if (classMatch) {
        currentClass = classMatch[1];
        definitions.push({
          type: 'class',
          name: classMatch[1],
          signature: line.trim(),
          filePath,
          startLine: lineNum,
          endLine: this.findBlockEnd(lines, i),
          isExported: line.includes('export'),
          parentClass: this.extractExtendsClause(line),
        });
      }

      // Interface definition
      const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w, ]+)?/);
      if (interfaceMatch) {
        definitions.push({
          type: 'interface',
          name: interfaceMatch[1],
          signature: line.trim(),
          filePath,
          startLine: lineNum,
          endLine: this.findBlockEnd(lines, i),
          isExported: line.includes('export'),
        });
      }

      // Type alias
      const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
      if (typeMatch) {
        definitions.push({
          type: 'type',
          name: typeMatch[1],
          signature: line.trim(),
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          isExported: line.includes('export'),
        });
      }

      // Enum definition
      const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        definitions.push({
          type: 'enum',
          name: enumMatch[1],
          signature: line.trim(),
          filePath,
          startLine: lineNum,
          endLine: this.findBlockEnd(lines, i),
          isExported: line.includes('export'),
        });
      }

      // Function/method definition
      const funcMatch = line.match(
        /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*\(([^)]*)\)\s*(?::-\s*[^{]+)?\s*\{|(\w+)\s*:\s*(?:async\s+)?\(([^)]*)\)\s*=>)/
      );
      if (funcMatch && !classMatch && !interfaceMatch) {
        const funcName = funcMatch[1] || funcMatch[2] || funcMatch[4];
        const params = funcMatch[3] || funcMatch[5] || '';

        if (funcName && funcName !== 'if' && funcName !== 'for' && funcName !== 'while') {
          const isAsync = line.includes('async');
          definitions.push({
            type: currentClass ? 'method' : 'function',
            name: funcName,
            signature: line.trim(),
            filePath,
            startLine: lineNum,
            endLine: this.findBlockEnd(lines, i),
            isAsync,
            isExported: line.includes('export'),
            parentClass: currentClass,
            parameters: this.parseParameters(params),
          });
        }
      }

      // Arrow function assigned to const/let/var
      const arrowMatch = line.match(
        /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?\(([^)]*)\)\s*(?::-\s*[^{]+)?\s*=>/
      );
      if (arrowMatch) {
        definitions.push({
          type: currentClass ? 'method' : 'function',
          name: arrowMatch[1],
          signature: line.trim(),
          filePath,
          startLine: lineNum,
          endLine: this.findBlockEnd(lines, i),
          isAsync: line.includes('async'),
          isExported: line.includes('export'),
          parentClass: currentClass,
          parameters: this.parseParameters(arrowMatch[2]),
        });
      }

      // Track brace depth for class scope
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        currentClass = undefined;
      }
    }

    return definitions;
  }

  /**
   * Extract Python definitions
   */
  private extractPythonDefinitions(
    content: string,
    filePath: string,
    lines: string[]
  ): CodeDefinition[] {
    const definitions: CodeDefinition[] = [];
    let currentClass: string | undefined = undefined;
    let classIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const indent = line.search(/\S|$/);

      // Class definition
      const classMatch = line.match(/class\s+(\w+)(?:\([^)]*\))?:/);
      if (classMatch) {
        currentClass = classMatch[1];
        classIndent = indent;
        definitions.push({
          type: 'class',
          name: classMatch[1],
          signature: line.trim(),
          filePath,
          startLine: lineNum,
          endLine: this.findPythonBlockEnd(lines, i),
          isExported: !line.startsWith('_'),
        });
      }

      // Function/method definition
      const funcMatch = line.match(/(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*[^:]+)?:/);
      if (funcMatch) {
        const isMethod = currentClass !== undefined && indent > classIndent;
        const isAsync = line.includes('async');

        definitions.push({
          type: isMethod ? 'method' : 'function',
          name: funcMatch[1],
          signature: line.trim(),
          filePath,
          startLine: lineNum,
          endLine: this.findPythonBlockEnd(lines, i),
          isAsync,
          isExported: !funcMatch[1].startsWith('_'),
          parentClass: isMethod ? currentClass : undefined,
          parameters: this.parsePythonParameters(funcMatch[2]),
        });
      }

      // Reset class context when indent decreases
      if (
        currentClass &&
        indent <= classIndent &&
        line.trim().length > 0 &&
        !line.startsWith(' ')
      ) {
        currentClass = undefined;
      }
    }

    return definitions;
  }

  /**
   * Extract generic definitions for other languages
   */
  private extractGenericDefinitions(
    content: string,
    filePath: string,
    lines: string[]
  ): CodeDefinition[] {
    const definitions: CodeDefinition[] = [];

    // Generic pattern matching for common constructs
    const patterns = [
      {
        regex: /(?:public|private|protected|internal)?\s*(?:static)?\s*class\s+(\w+)/g,
        type: 'class' as const,
      },
      {
        regex: /(?:public|private|protected|internal)?\s*(?:static)?\s*interface\s+(\w+)/g,
        type: 'interface' as const,
      },
      {
        regex:
          /(?:public|private|protected|internal)?\s*(?:static)?\s*(?:void|int|string|bool|[\w]+)\s+(\w+)\s*\(/g,
        type: 'function' as const,
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const match = pattern.regex.exec(line);
        if (match) {
          definitions.push({
            type: pattern.type,
            name: match[1],
            signature: line.trim(),
            filePath,
            startLine: i + 1,
            endLine: this.findBlockEnd(lines, i),
          });
        }
      }
    }

    return definitions;
  }

  /**
   * Extract imports from source
   */
  private extractImports(content: string, language: ProgrammingLanguage): string[] {
    const imports: string[] = [];

    switch (language) {
      case 'typescript':
      case 'javascript':
        const tsImportRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let match;
        while ((match = tsImportRegex.exec(content)) !== null) {
          imports.push(match[1]);
        }
        while ((match = requireRegex.exec(content)) !== null) {
          imports.push(match[1]);
        }
        break;

      case 'python':
        const pyImportRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
        while ((match = pyImportRegex.exec(content)) !== null) {
          imports.push(match[1] || match[2]);
        }
        break;
    }

    return imports;
  }

  /**
   * Extract exports from source
   */
  private extractExports(content: string, language: ProgrammingLanguage): string[] {
    const exports: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      const exportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // Default export
      if (content.includes('export default')) {
        exports.push('default');
      }
    }

    return exports;
  }

  /**
   * Build approximate AST structure
   */
  private buildAST(content: string, language: ProgrammingLanguage): ASTNode {
    const lines = content.split('\n');
    const root: ASTNode = {
      type: 'program',
      startLine: 1,
      endLine: lines.length,
      startColumn: 0,
      endColumn: 0,
      children: [],
      properties: { language },
    };

    // Simplified AST building using indentation and brackets
    // For production, use Tree-sitter WASM bindings
    const stack: ASTNode[] = [root];
    let currentDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.length === 0) continue;

      // Detect block starts
      if (trimmed.endsWith('{') || trimmed.endsWith(':')) {
        const node: ASTNode = {
          type: this.detectNodeType(trimmed, language),
          startLine: i + 1,
          endLine: i + 1,
          startColumn: line.length - line.trimStart().length,
          endColumn: line.length,
          children: [],
          properties: {},
        };

        if (stack.length > 0) {
          stack[stack.length - 1].children.push(node);
          stack.push(node);
        }
        currentDepth++;
      }

      // Detect block ends
      if (
        trimmed === '}' ||
        (language === 'python' && trimmed.length > 0 && !line.startsWith(' ') && currentDepth > 0)
      ) {
        if (stack.length > 1) {
          const node = stack.pop()!;
          node.endLine = i + 1;
        }
        currentDepth--;
      }
    }

    return root;
  }

  /**
   * Calculate complexity metrics
   */
  private calculateComplexity(content: string, definitions: CodeDefinition[]): ComplexityMetrics {
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Count comment lines
    let commentLines = 0;
    let inBlockComment = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('/*') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        inBlockComment = true;
        commentLines++;
      } else if (inBlockComment || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        commentLines++;
      }
      if (trimmed.endsWith('*/') || trimmed.endsWith('"""') || trimmed.endsWith("'''")) {
        inBlockComment = false;
      }
    }

    // Calculate cyclomatic complexity (simplified)
    const controlFlowPatterns = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]+:/g, // Ternary
      /&&/g,
      /\|\|/g,
    ];

    let complexity = 1; // Base complexity
    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return {
      cyclomaticComplexity: complexity,
      cognitiveComplexity: Math.floor(complexity * 1.5), // Approximate
      linesOfCode: totalLines,
      commentRatio: totalLines > 0 ? commentLines / totalLines : 0,
      functionCount: definitions.filter(d => d.type === 'function' || d.type === 'method').length,
      classCount: definitions.filter(d => d.type === 'class').length,
    };
  }

  /**
   * Analyze documentation coverage
   */
  private analyzeDocumentation(
    content: string,
    definitions: CodeDefinition[]
  ): {
    hasJSDoc: boolean;
    hasReadme: boolean;
    undocumentedFunctions: number;
    undocumentedClasses: number;
    coverage: number;
  } {
    let documentedCount = 0;
    let undocumentedFunctions = 0;
    let undocumentedClasses = 0;

    for (const def of definitions) {
      // Check if there's a JSDoc/docstring before the definition
      const lines = content.split('\n');
      const defLineIndex = def.startLine - 1;

      let hasDoc = false;
      for (let i = Math.max(0, defLineIndex - 5); i < defLineIndex; i++) {
        const line = lines[i].trim();
        if (line.startsWith('/**') || line.startsWith('///') || line.startsWith('#:')) {
          hasDoc = true;
          break;
        }
      }

      if (hasDoc) {
        documentedCount++;
      } else if (def.type === 'function' || def.type === 'method') {
        undocumentedFunctions++;
      } else if (def.type === 'class') {
        undocumentedClasses++;
      }
    }

    const totalDefs = definitions.length;
    const coverage = totalDefs > 0 ? documentedCount / totalDefs : 0;

    return {
      hasJSDoc: content.includes('/**'),
      hasReadme: content.includes('README') || content.includes('readme'),
      undocumentedFunctions,
      undocumentedClasses,
      coverage,
    };
  }

  /**
   * Helper methods
   */
  private detectLanguage(filePath: string): ProgrammingLanguage {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, ProgrammingLanguage> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
    };
    return languageMap[ext] || 'typescript';
  }

  private async findSourceFiles(
    dir: string,
    options: ChunkingOptions,
    depth: number = 0
  ): Promise<string[]> {
    if (options.maxDepth && depth > options.maxDepth) return [];

    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded patterns
        if (options.excludePatterns.some(p => entry.name.includes(p) || entry.name === p)) {
          continue;
        }
        const subFiles = await this.findSourceFiles(fullPath, options, depth + 1);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (options.includePatterns.includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  private findBlockEnd(lines: string[], startIndex: number): number {
    let braceDepth = 0;
    let started = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceDepth++;
          started = true;
        } else if (char === '}') {
          braceDepth--;
          if (started && braceDepth === 0) {
            return i + 1;
          }
        }
      }
    }

    return lines.length;
  }

  private findPythonBlockEnd(lines: string[], startIndex: number): number {
    const baseIndent = lines[startIndex].search(/\S/);
    if (baseIndent === -1) return startIndex + 1;

    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) continue;

      const indent = line.search(/\S/);
      if (indent !== -1 && indent <= baseIndent) {
        return i;
      }
    }

    return lines.length;
  }

  private findImportLine(importPath: string, lines: string[]): number {
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes(importPath) &&
        (lines[i].includes('import') || lines[i].includes('require'))
      ) {
        return i + 1;
      }
    }
    return 0;
  }

  private parseParameters(paramString: string): ParameterInfo[] {
    if (!paramString || paramString.trim().length === 0) return [];

    return paramString.split(',').map(param => {
      const trimmed = param.trim();
      const parts = trimmed.split(':');
      const name = parts[0]?.split('?')[0]?.trim() || '';
      const type = parts[1]?.trim();
      const isOptional = trimmed.includes('?');
      const isRest = trimmed.startsWith('...');

      return { name, type, isOptional, isRest };
    });
  }

  private parsePythonParameters(paramString: string): ParameterInfo[] {
    if (!paramString || paramString.trim().length === 0) return [];

    return paramString.split(',').map(param => {
      const trimmed = param.trim();
      if (trimmed === 'self' || trimmed === 'cls') return { name: trimmed, isOptional: false };

      const parts = trimmed.split('=');
      const name = parts[0]?.split(':')[0]?.trim() || '';
      const defaultValue = parts[1]?.trim();
      const type = parts[0]?.split(':')[1]?.trim();
      const isOptional = !!defaultValue || trimmed.includes('?');

      return { name, type, defaultValue, isOptional };
    });
  }

  private extractExtendsClause(line: string): string | undefined {
    const match = line.match(/extends\s+(\w+)/);
    return match?.[1];
  }

  private detectNodeType(line: string, language: ProgrammingLanguage): string {
    if (line.match(/class\s+\w+/)) return 'class_declaration';
    if (line.match(/(?:interface|type)\s+\w+/)) return 'type_declaration';
    if (line.match(/(?:function|def)\s+\w+/)) return 'function_declaration';
    if (line.match(/if\s*\(/)) return 'if_statement';
    if (line.match(/for\s*\(/)) return 'for_statement';
    if (line.match(/while\s*\(/)) return 'while_statement';
    if (line.match(/switch\s*\(/)) return 'switch_statement';
    return 'block';
  }
}
