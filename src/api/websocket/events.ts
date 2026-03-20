import { FastifyInstance } from 'fastify';
import { Logger } from '../../utils/logger';

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
}

export class WebSocketEventManager {
  private fastify: FastifyInstance;
  private connections: Set<any> = new Set();
  private logger: Logger;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.logger = new Logger('WebSocketEventManager');
  }

  broadcast(event: WebSocketEvent): void {
    const message = JSON.stringify(event);
    for (const connection of this.connections) {
      try {
        connection.socket.send(message);
      } catch (error) {
        this.logger.error('Error broadcasting to WebSocket', error);
      }
    }
  }

  addConnection(connection: any): void {
    this.connections.add(connection);
    this.logger.info(`WebSocket connection added. Total: ${this.connections.size}`);
  }

  removeConnection(connection: any): void {
    this.connections.delete(connection);
    this.logger.info(`WebSocket connection removed. Total: ${this.connections.size}`);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}
