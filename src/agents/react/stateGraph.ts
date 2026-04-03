// ============================================================================
// STATE GRAPH - LangGraph-Style State Machine for Agentic Workflows
// ============================================================================
// Inspired by web-ui's DeepResearchAgent with LangGraph state machines

import { Logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

/**
 * Node handler function type
 */
export type NodeHandler<TState> = (state: TState) => Promise<Partial<TState>>;

/**
 * Edge condition function type
 */
export type EdgeCondition<TState> = (state: TState) => string | Promise<string>;

/**
 * Graph node definition
 */
export interface GraphNode<TState> {
  id: string;
  handler: NodeHandler<TState>;
  description?: string;
}

/**
 * Graph edge definition
 */
export interface GraphEdge<TState> {
  from: string;
  to: string;
  condition?: EdgeCondition<TState>;
  label?: string;
}

/**
 * Execution result
 */
export interface GraphExecutionResult<TState> {
  finalState: TState;
  nodeSequence: string[];
  duration: number;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

/**
 * Execution options
 */
export interface ExecutionOptions {
  maxIterations?: number;
  timeout?: number;
  onNodeStart?: (nodeId: string, state: unknown) => void;
  onNodeEnd?: (nodeId: string, state: unknown) => void;
  onEdgeTraverse?: (from: string, to: string) => void;
}

// ============================================================================
// StateGraph - Core State Machine Implementation
// ============================================================================

/**
 * LangGraph-style state machine for agentic workflows
 * Provides declarative state flow with conditional edges
 */
export class StateGraph<TState extends Record<string, unknown>> {
  private logger: Logger;
  private nodes: Map<string, GraphNode<TState>> = new Map();
  private edges: GraphEdge<TState>[] = [];
  private conditionalEdges: Map<
    string,
    { condition: EdgeCondition<TState>; targets: Map<string, string> }
  > = new Map();
  private entryPoint: string = '';
  private graphId: string;

  constructor(stateSchema?: { name: string }) {
    this.logger = new Logger(`StateGraph-${stateSchema?.name || 'default'}`);
    this.graphId = uuidv4();
  }

  /**
   * Add a node to the graph
   */
  addNode(id: string, handler: NodeHandler<TState>, description?: string): this {
    this.nodes.set(id, { id, handler, description });
    this.logger.debug(`Added node: ${id}`);
    return this;
  }

  /**
   * Set the entry point of the graph
   */
  setEntryPoint(nodeId: string): this {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Node ${nodeId} does not exist`);
    }
    this.entryPoint = nodeId;
    this.logger.debug(`Set entry point: ${nodeId}`);
    return this;
  }

  /**
   * Add a simple edge (unconditional transition)
   */
  addEdge(from: string, to: string, label?: string): this {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node ${from} does not exist`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Target node ${to} does not exist`);
    }

    this.edges.push({ from, to, label });
    this.logger.debug(`Added edge: ${from} -> ${to}`);
    return this;
  }

  /**
   * Add conditional edges (conditional transitions based on state)
   */
  addConditionalEdges(
    nodeId: string,
    condition: EdgeCondition<TState>,
    targets: Record<string, string>
  ): this {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Node ${nodeId} does not exist`);
    }

    const targetMap = new Map<string, string>();
    for (const [key, targetId] of Object.entries(targets)) {
      if (!this.nodes.has(targetId)) {
        throw new Error(`Target node ${targetId} does not exist`);
      }
      targetMap.set(key, targetId);
    }

    this.conditionalEdges.set(nodeId, { condition, targets: targetMap });
    this.logger.debug(`Added conditional edges from: ${nodeId}`);
    return this;
  }

  /**
   * Compile the graph into an executable app
   */
  compile(): CompiledGraph<TState> {
    if (!this.entryPoint) {
      throw new Error('Entry point must be set before compiling');
    }

    // Validate all nodes are reachable
    const reachableNodes = this.getReachableNodes();
    for (const nodeId of this.nodes.keys()) {
      if (!reachableNodes.has(nodeId)) {
        this.logger.warn(`Node ${nodeId} is not reachable from entry point`);
      }
    }

    return new CompiledGraph<TState>(
      this.graphId,
      this.nodes,
      this.edges,
      this.conditionalEdges,
      this.entryPoint,
      this.logger
    );
  }

  /**
   * Get all nodes reachable from entry point
   */
  private getReachableNodes(): Set<string> {
    const reachable = new Set<string>();
    const queue: string[] = [this.entryPoint];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);

      // Add nodes from simple edges
      for (const edge of this.edges) {
        if (edge.from === current && !reachable.has(edge.to)) {
          queue.push(edge.to);
        }
      }

      // Add nodes from conditional edges
      const condEdges = this.conditionalEdges.get(current);
      if (condEdges) {
        for (const [_, targetId] of condEdges.targets) {
          if (!reachable.has(targetId)) {
            queue.push(targetId);
          }
        }
      }
    }

    return reachable;
  }
}

// ============================================================================
// CompiledGraph - Executable State Machine
// ============================================================================

/**
 * Compiled state graph ready for execution
 */
export class CompiledGraph<TState extends Record<string, unknown>> {
  private id: string;
  private nodes: Map<string, GraphNode<TState>>;
  private edges: GraphEdge<TState>[];
  private conditionalEdges: Map<
    string,
    { condition: EdgeCondition<TState>; targets: Map<string, string> }
  >;
  private entryPoint: string;
  private logger: Logger;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;

  constructor(
    id: string,
    nodes: Map<string, GraphNode<TState>>,
    edges: GraphEdge<TState>[],
    conditionalEdges: Map<
      string,
      { condition: EdgeCondition<TState>; targets: Map<string, string> }
    >,
    entryPoint: string,
    logger: Logger
  ) {
    this.id = id;
    this.nodes = nodes;
    this.edges = edges;
    this.conditionalEdges = conditionalEdges;
    this.entryPoint = entryPoint;
    this.logger = logger;
  }

  /**
   * Execute the graph with given initial state
   */
  async invoke(
    initialState: TState,
    options: ExecutionOptions = {}
  ): Promise<GraphExecutionResult<TState>> {
    if (this.isRunning) {
      throw new Error('Graph is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    const startTime = Date.now();
    const nodeSequence: string[] = [];
    let currentState = { ...initialState };
    let currentNodeId: string | null = this.entryPoint;
    let iteration = 0;
    const maxIterations = options.maxIterations ?? 100;
    const timeout = options.timeout ?? 300000; // 5 minutes default

    this.logger.info(`Starting graph execution from: ${currentNodeId}`);

    try {
      while (currentNodeId && !this.shouldStop) {
        // Check iteration limit
        if (iteration >= maxIterations) {
          throw new Error(`Maximum iterations (${maxIterations}) exceeded`);
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error(`Execution timeout (${timeout}ms) exceeded`);
        }

        // Check for end node
        if (currentNodeId === 'end' || currentNodeId === 'end_run') {
          this.logger.info('Reached end node');
          break;
        }

        // Get current node
        const node = this.nodes.get(currentNodeId);
        if (!node) {
          throw new Error(`Node ${currentNodeId} not found`);
        }

        nodeSequence.push(currentNodeId);
        this.logger.debug(`Executing node: ${currentNodeId}`);

        // Notify callbacks
        options.onNodeStart?.(currentNodeId, currentState);

        // Execute node handler
        const partialState = await node.handler(currentState);
        currentState = { ...currentState, ...partialState };

        // Notify callbacks
        options.onNodeEnd?.(currentNodeId, currentState);

        // Determine next node
        const nextNodeId = await this.getNextNode(currentNodeId, currentState);
        if (nextNodeId) {
          options.onEdgeTraverse?.(currentNodeId, nextNodeId);
        }
        currentNodeId = nextNodeId;

        iteration++;
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Graph execution completed in ${duration}ms (${iteration} iterations)`);

      return {
        finalState: currentState,
        nodeSequence,
        duration,
        status: this.shouldStop ? 'cancelled' : 'completed',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Graph execution failed: ${errorMessage}`);

      return {
        finalState: currentState,
        nodeSequence,
        duration,
        status: 'failed',
        error: errorMessage,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stream execution results (for real-time updates)
   */
  async *stream(
    initialState: TState,
    options: ExecutionOptions = {}
  ): AsyncGenerator<{ nodeId: string; state: TState }> {
    let currentState = { ...initialState };
    let currentNodeId: string | null = this.entryPoint;
    let iteration = 0;
    const maxIterations = options.maxIterations ?? 100;

    while (currentNodeId && !this.shouldStop && iteration < maxIterations) {
      if (currentNodeId === 'end' || currentNodeId === 'end_run') {
        break;
      }

      const node = this.nodes.get(currentNodeId);
      if (!node) {
        break;
      }

      options.onNodeStart?.(currentNodeId, currentState);

      const partialState = await node.handler(currentState);
      currentState = { ...currentState, ...partialState };

      options.onNodeEnd?.(currentNodeId, currentState);

      yield { nodeId: currentNodeId, state: currentState };

      const nextNodeId = await this.getNextNode(currentNodeId, currentState);
      currentNodeId = nextNodeId;
      iteration++;
    }
  }

  /**
   * Stop the running graph
   */
  stop(): void {
    this.shouldStop = true;
    this.logger.info('Stop requested');
  }

  /**
   * Get the next node based on edges and conditions
   */
  private async getNextNode(currentNodeId: string, state: TState): Promise<string | null> {
    // Check conditional edges first
    const condEdges = this.conditionalEdges.get(currentNodeId);
    if (condEdges) {
      const conditionResult = await condEdges.condition(state);
      const targetId = condEdges.targets.get(conditionResult);
      if (targetId) {
        this.logger.debug(`Conditional edge: ${currentNodeId} -> ${targetId} (${conditionResult})`);
        return targetId;
      }
      this.logger.warn(`No target for condition result: ${conditionResult}`);
      return null;
    }

    // Check simple edges
    const edge = this.edges.find(e => e.from === currentNodeId);
    if (edge) {
      this.logger.debug(`Simple edge: ${edge.from} -> ${edge.to}`);
      return edge.to;
    }

    return null;
  }

  /**
   * Get graph visualization
   */
  getVisualization(): string {
    const lines: string[] = [`Graph: ${this.id}`];
    lines.push(`Entry: ${this.entryPoint}`);
    lines.push('');

    // Nodes
    lines.push('Nodes:');
    for (const [id, node] of this.nodes) {
      lines.push(`  - ${id}${node.description ? `: ${node.description}` : ''}`);
    }

    // Edges
    lines.push('');
    lines.push('Edges:');
    for (const edge of this.edges) {
      lines.push(`  ${edge.from} -> ${edge.to}${edge.label ? ` [${edge.label}]` : ''}`);
    }

    // Conditional edges
    for (const [nodeId, { targets }] of this.conditionalEdges) {
      for (const [condition, targetId] of targets) {
        lines.push(`  ${nodeId} --(${condition})--> ${targetId}`);
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// GraphBuilder - Fluent API for Building Graphs
// ============================================================================

/**
 * Builder pattern for creating state graphs
 */
export class GraphBuilder<TState extends Record<string, unknown>> {
  private graph: StateGraph<TState>;

  constructor(name?: string) {
    this.graph = new StateGraph<TState>({ name: name || 'agent' });
  }

  /**
   * Add a node with description
   */
  withNode(id: string, handler: NodeHandler<TState>, description?: string): this {
    this.graph.addNode(id, handler, description);
    return this;
  }

  /**
   * Set entry point
   */
  withEntryPoint(nodeId: string): this {
    this.graph.setEntryPoint(nodeId);
    return this;
  }

  /**
   * Add edge
   */
  withEdge(from: string, to: string, label?: string): this {
    this.graph.addEdge(from, to, label);
    return this;
  }

  /**
   * Add conditional edges
   */
  withConditionalEdges(
    nodeId: string,
    condition: EdgeCondition<TState>,
    targets: Record<string, string>
  ): this {
    this.graph.addConditionalEdges(nodeId, condition, targets);
    return this;
  }

  /**
   * Build and compile the graph
   */
  build(): CompiledGraph<TState> {
    return this.graph.compile();
  }
}
