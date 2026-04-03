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
        'Content-Type': 'application/json',
      },
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

  async updateAgent(
    id: string,
    data: {
      name?: string;
      status?: string;
      capabilities?: string[];
      metadata?: any;
    }
  ) {
    const response = await this.http.put(`/api/agents/${id}`, data);
    return response.data;
  }

  async deleteAgent(id: string) {
    const response = await this.http.delete(`/api/agents/${id}`);
    return response.data;
  }

  async setAgentModel(
    id: string,
    modelConfig: {
      provider: string;
      modelId: string;
      parameters: any;
    }
  ) {
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

  async updateTask(
    id: string,
    data: {
      status?: string;
      result?: any;
      error?: string;
    }
  ) {
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

  async validateModel(modelConfig: { provider: string; modelId: string; parameters: any }) {
    const response = await this.http.post('/api/models/validate', modelConfig);
    return response.data;
  }

  // Autonomous Agent methods (KiloCode 2.0 Integration)
  async executeAutonomousGoal(data: {
    goal: string;
    context?: Record<string, any>;
    config?: Record<string, any>;
  }) {
    const response = await this.http.post('/api/autonomous/execute', data);
    return response.data;
  }

  async getAutonomousState() {
    const response = await this.http.get('/api/autonomous/state');
    return response.data;
  }

  async getAutonomousPlans() {
    const response = await this.http.get('/api/autonomous/plans');
    return response.data;
  }

  async getAutonomousPlan(id: string) {
    const response = await this.http.get(`/api/autonomous/plans/${id}`);
    return response.data;
  }

  async getAutonomousLogs(filters?: { category?: string; level?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.level) params.append('level', filters.level);
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const response = await this.http.get(`/api/autonomous/logs?${params.toString()}`);
    return response.data;
  }

  async getAutonomousLogSummary(planId: string) {
    const response = await this.http.get(`/api/autonomous/logs/summary/${planId}`);
    return response.data;
  }

  async getAutonomousArtifacts(planId: string) {
    const response = await this.http.get(`/api/autonomous/artifacts/${planId}`);
    return response.data;
  }

  async getAutonomousCapabilities() {
    const response = await this.http.get('/api/autonomous/capabilities');
    return response.data;
  }

  async getAutonomousNotifications() {
    const response = await this.http.get('/api/autonomous/notifications');
    return response.data;
  }

  // KiloCode methods
  async generateCode(data: {
    description: string;
    language: string;
    framework?: string;
    requirements?: string[];
  }) {
    const response = await this.http.post('/api/kilo/generate', data);
    return response.data;
  }

  async getGenerations() {
    const response = await this.http.get('/api/kilo/generations');
    return response.data;
  }

  async analyzeCode(data: { filePath: string; language: string; focusAreas?: string[] }) {
    const response = await this.http.post('/api/kilo/analyze', data);
    return response.data;
  }

  async fixCode(filePath: string, issues: any[]) {
    const response = await this.http.post('/api/kilo/fix', { filePath, issues });
    return response.data;
  }

  async createIntegration(data: {
    name: string;
    type: string;
    description: string;
    apiEndpoints?: any[];
  }) {
    const response = await this.http.post('/api/kilo/integration', data);
    return response.data;
  }

  async getIntegrations() {
    const response = await this.http.get('/api/kilo/integrations');
    return response.data;
  }

  async getMCPServers() {
    const response = await this.http.get('/api/kilo/mcp-servers');
    return response.data;
  }

  async getKiloTools() {
    const response = await this.http.get('/api/kilo/tools');
    return response.data;
  }

  async getKiloStats() {
    const response = await this.http.get('/api/kilo/stats');
    return response.data;
  }

  // Permission methods
  async getPermissions() {
    const response = await this.http.get('/api/permissions');
    return response.data;
  }

  async grantPermission(type: string, level: string) {
    const response = await this.http.post('/api/permissions/grant', { type, level });
    return response.data;
  }

  async revokePermission(type: string) {
    const response = await this.http.post('/api/permissions/revoke', { type });
    return response.data;
  }

  async grantComputer(level?: string) {
    const response = await this.http.post('/api/permissions/computer/grant', { level });
    return response.data;
  }

  async revokeComputer() {
    const response = await this.http.post('/api/permissions/computer/revoke');
    return response.data;
  }

  async grantBrowser(level?: string) {
    const response = await this.http.post('/api/permissions/browser/grant', { level });
    return response.data;
  }

  async revokeBrowser() {
    const response = await this.http.post('/api/permissions/browser/revoke');
    return response.data;
  }

  async getPendingPermissions() {
    const response = await this.http.get('/api/permissions/pending');
    return response.data;
  }

  async approvePermission(requestId: string, duration?: string) {
    const response = await this.http.post('/api/permissions/approve', { requestId, duration });
    return response.data;
  }

  async denyPermission(requestId: string) {
    const response = await this.http.post('/api/permissions/deny', { requestId });
    return response.data;
  }

  // App Orchestrator methods
  async createApp(data: {
    name: string;
    description: string;
    type?: string;
    framework?: string;
    requirements: string;
    autoStart?: boolean;
    autoTest?: boolean;
  }) {
    const response = await this.http.post('/api/apps/create', data);
    return response.data;
  }

  async listApps() {
    const response = await this.http.get('/api/apps');
    return response.data;
  }

  async getApp(id: string) {
    const response = await this.http.get(`/api/apps/${id}`);
    return response.data;
  }

  async startApp(id: string) {
    const response = await this.http.post(`/api/apps/${id}/start`);
    return response.data;
  }

  async stopApp(id: string) {
    const response = await this.http.post(`/api/apps/${id}/stop`);
    return response.data;
  }

  async restartApp(id: string) {
    const response = await this.http.post(`/api/apps/${id}/restart`);
    return response.data;
  }

  async runAppTests(id: string) {
    const response = await this.http.post(`/api/apps/${id}/test`);
    return response.data;
  }

  async getAppLogs(id: string, limit: number = 100) {
    const response = await this.http.get(`/api/apps/${id}/logs?limit=${limit}`);
    return response.data;
  }

  async getAppStatus(id: string) {
    const response = await this.http.get(`/api/apps/${id}/status`);
    return response.data;
  }

  async getAppStats() {
    const response = await this.http.get('/api/apps/stats');
    return response.data;
  }

  // WebSocket connection
  connectWebSocket(): WebSocket {
    const wsUrl = this.baseUrl.replace('http', 'ws') + '/ws';
    return new WebSocket(wsUrl);
  }
}
