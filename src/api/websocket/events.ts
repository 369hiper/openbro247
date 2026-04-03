import { FastifyInstance } from 'fastify';
import { Logger } from '../../utils/logger';

export type WebSocketEventData = any;

export interface WebSocketEvent {
  type: string;
  data: WebSocketEventData;
  timestamp: string;
}

export interface TypedWebSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

export interface WebSocketConnection {
  socket: TypedWebSocket;
  id: string;
  connectedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface WebSocketEventManagerOptions {
  logger?: Logger;
}

export class WebSocketEventManager {
  private fastify: FastifyInstance;
  private connections: Set<WebSocketConnection> = new Set();
  private logger: Logger;

  constructor(fastify: FastifyInstance, options: WebSocketEventManagerOptions = {}) {
    this.fastify = fastify;
    this.logger = options.logger || new Logger('WebSocketEventManager');
  }

  broadcast(event: WebSocketEvent): void {
    const message = JSON.stringify(event);
    const deadConnections: WebSocketConnection[] = [];

    for (const connection of this.connections) {
      try {
        connection.socket.send(message);
      } catch (error) {
        this.logger.error(`Error broadcasting to WebSocket ${connection.id}`, error);
        deadConnections.push(connection);
      }
    }

    // Clean up dead connections
    for (const connection of deadConnections) {
      this.removeConnection(connection);
    }
  }

  broadcastToType(type: string, event: WebSocketEvent): void {
    const message = JSON.stringify(event);
    const deadConnections: WebSocketConnection[] = [];

    for (const connection of this.connections) {
      try {
        if (connection.metadata?.type === type) {
          connection.socket.send(message);
        }
      } catch (error) {
        this.logger.error(`Error broadcasting to WebSocket ${connection.id}`, error);
        deadConnections.push(connection);
      }
    }

    // Clean up dead connections
    for (const connection of deadConnections) {
      this.removeConnection(connection);
    }
  }

  addConnection(connection: WebSocketConnection): void {
    this.connections.add(connection);
    this.logger.info(`WebSocket connection ${connection.id} added. Total: ${this.connections.size}`);
  }

  removeConnection(connection: WebSocketConnection): void {
    if (this.connections.has(connection)) {
      this.connections.delete(connection);
      this.logger.info(`WebSocket connection ${connection.id} removed. Total: ${this.connections.size}`);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnections(): WebSocketConnection[] {
    return Array.from(this.connections);
  }

  isConnected(connectionId: string): boolean {
    return Array.from(this.connections).some(c => c.id === connectionId);
  }
}
