import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';

export class OpenClawClient {
  private http: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Agent methods
  async listAgents(filters?: { type?: string; status?: string }) {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    
    const response = await this.http.get(`/api/agents?${params.toString()}`);
    return response.data;
  }

  async getAgent(id: string) {
    const response = await this.http.get(`/api/agents/${id}`);
    return response.data;
  }

  async createAgent(data: {
    name: string;
    type: string;
    modelConfig: any;
    capabilities: string[];
    parentAgentId?: string;
    metadata?: any;
  }) {
    const response = await this.http.post('/api/agents', data);
    return response.data;
  }

  async updateAgent(id: string, data: {
    name?: string;
    status?: string;
    capabilities?: string[];
    metadata?: any;
  }) {
    const response = await this.http.put(`/api/agents/${id}`, data);
    return response.data;
  }

  async deleteAgent(id: string) {
    const response = await this.http.delete(`/api/agents/${id}`);
    return response.data;
  }

  async setAgentModel(id: string, modelConfig: {
    provider: string;
    modelId: string;
    parameters: any;
  }) {
    const response = await this.http.put(`/api/agents/${id}/model`, modelConfig);
    return response.data;
  }

  // Task methods
  async listTasks(filters?: { agentId?: string; status?: string; priority?: string }) {
    const params = new URLSearchParams();
    if (filters?.agentId) params.append('agentId', filters.agentId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    
    const response = await this.http.get(`/api/tasks?${params.toString()}`);
    return response.data;
  }

  async getTask(id: string) {
    const response = await this.http.get(`/api/tasks/${id}`);
    return response.data;
  }

  async createTask(data: {
    agentId: string;
    description: string;
    priority?: string;
    metadata?: any;
  }) {
    const response = await this.http.post('/api/tasks', data);
    return response.data;
  }

  async updateTask(id: string, data: {
    status?: string;
    result?: any;
    error?: string;
  }) {
    const response = await this.http.put(`/api/tasks/${id}`, data);
    return response.data;
  }

  async deleteTask(id: string) {
    const response = await this.http.delete(`/api/tasks/${id}`);
    return response.data;
  }

  async assignTask(id: string, agentId: string) {
    const response = await this.http.post(`/api/tasks/${id}/assign`, { agentId });
    return response.data;
  }

  // Chat methods
  async listSessions(agentId?: string) {
    const params = new URLSearchParams();
    if (agentId) params.append('agentId', agentId);
    
    const response = await this.http.get(`/api/chat/sessions?${params.toString()}`);
    return response.data;
  }

  async getSession(id: string) {
    const response = await this.http.get(`/api/chat/sessions/${id}`);
    return response.data;
  }

  async createSession(data: { agentId: string; metadata?: any }) {
    const response = await this.http.post('/api/chat/sessions', data);
    return response.data;
  }

  async sendMessage(sessionId: string, data: { content: string; metadata?: any }) {
    const response = await this.http.post(`/api/chat/sessions/${sessionId}/messages`, data);
    return response.data;
  }

  async deleteSession(id: string) {
    const response = await this.http.delete(`/api/chat/sessions/${id}`);
    return response.data;
  }

  // Model methods
  async listModels() {
    const response = await this.http.get('/api/models');
    return response.data;
  }

  async validateModel(modelConfig: {
    provider: string;
    modelId: string;
    parameters: any;
  }) {
    const response = await this.http.post('/api/models/validate', modelConfig);
    return response.data;
  }

  // WebSocket connection
  connectWebSocket(): WebSocket {
    const wsUrl = this.baseUrl.replace('http', 'ws') + '/ws';
    return new WebSocket(wsUrl);
  }
}
