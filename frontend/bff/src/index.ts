import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import { OpenClawClient } from './client';
import { AgentRoutes } from './routes/agents';
import { TaskRoutes } from './routes/tasks';
import { ChatRoutes } from './routes/chat';
import { ModelRoutes } from './routes/models';
import { AutonomousRoutes } from './routes/autonomous';
import { AppRoutes } from './routes/apps';
import { PermissionRoutes } from './routes/permissions';
import { KiloRoutes } from './routes/kilo';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.BFF_PORT || 3001;
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:8000';

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

// Initialize OpenClaw client
const openclawClient = new OpenClawClient(OPENCLAW_URL);

// Initialize routes
const agentRoutes = new AgentRoutes(openclawClient);
const taskRoutes = new TaskRoutes(openclawClient);
const chatRoutes = new ChatRoutes(openclawClient);
const modelRoutes = new ModelRoutes(openclawClient);
const autonomousRoutes = new AutonomousRoutes(openclawClient);
const appRoutes = new AppRoutes(openclawClient);
const permissionRoutes = new PermissionRoutes();
const kiloRoutes = new KiloRoutes();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Agent routes
app.get('/api/agents', agentRoutes.listAgents.bind(agentRoutes));
app.get('/api/agents/:id', agentRoutes.getAgent.bind(agentRoutes));
app.post('/api/agents', agentRoutes.createAgent.bind(agentRoutes));
app.put('/api/agents/:id', agentRoutes.updateAgent.bind(agentRoutes));
app.delete('/api/agents/:id', agentRoutes.deleteAgent.bind(agentRoutes));
app.put('/api/agents/:id/model', agentRoutes.setAgentModel.bind(agentRoutes));

// Task routes
app.get('/api/tasks', taskRoutes.listTasks.bind(taskRoutes));
app.get('/api/tasks/:id', taskRoutes.getTask.bind(taskRoutes));
app.post('/api/tasks', taskRoutes.createTask.bind(taskRoutes));
app.put('/api/tasks/:id', taskRoutes.updateTask.bind(taskRoutes));
app.delete('/api/tasks/:id', taskRoutes.deleteTask.bind(taskRoutes));
app.post('/api/tasks/:id/assign', taskRoutes.assignTask.bind(taskRoutes));

// Chat routes
app.get('/api/chat/sessions', chatRoutes.listSessions.bind(chatRoutes));
app.get('/api/chat/sessions/:id', chatRoutes.getSession.bind(chatRoutes));
app.post('/api/chat/sessions', chatRoutes.createSession.bind(chatRoutes));
app.post('/api/chat/sessions/:id/messages', chatRoutes.sendMessage.bind(chatRoutes));
app.delete('/api/chat/sessions/:id', chatRoutes.deleteSession.bind(chatRoutes));

// Model routes
app.get('/api/models', modelRoutes.listModels.bind(modelRoutes));
app.post('/api/models/validate', modelRoutes.validateModel.bind(modelRoutes));

// Permission routes
app.get('/api/permissions', permissionRoutes.getPermissions.bind(permissionRoutes));
app.post('/api/permissions/grant', permissionRoutes.grantPermission.bind(permissionRoutes));
app.post('/api/permissions/revoke', permissionRoutes.revokePermission.bind(permissionRoutes));
app.post('/api/permissions/computer/grant', permissionRoutes.grantComputer.bind(permissionRoutes));
app.post(
  '/api/permissions/computer/revoke',
  permissionRoutes.revokeComputer.bind(permissionRoutes)
);
app.post('/api/permissions/browser/grant', permissionRoutes.grantBrowser.bind(permissionRoutes));
app.post('/api/permissions/browser/revoke', permissionRoutes.revokeBrowser.bind(permissionRoutes));
app.get('/api/permissions/pending', permissionRoutes.getPending.bind(permissionRoutes));
app.post('/api/permissions/approve', permissionRoutes.approveRequest.bind(permissionRoutes));
app.post('/api/permissions/deny', permissionRoutes.denyRequest.bind(permissionRoutes));

// KiloCode routes (Open Source)
app.post('/api/kilo/generate', kiloRoutes.generateCode.bind(kiloRoutes));
app.get('/api/kilo/generations', kiloRoutes.getGenerations.bind(kiloRoutes));
app.post('/api/kilo/analyze', kiloRoutes.analyzeCode.bind(kiloRoutes));
app.post('/api/kilo/fix', kiloRoutes.fixCode.bind(kiloRoutes));
app.post('/api/kilo/integration', kiloRoutes.createIntegration.bind(kiloRoutes));
app.get('/api/kilo/integrations', kiloRoutes.getIntegrations.bind(kiloRoutes));
app.get('/api/kilo/mcp-servers', kiloRoutes.getMCPServers.bind(kiloRoutes));
app.get('/api/kilo/tools', kiloRoutes.getTools.bind(kiloRoutes));
app.get('/api/kilo/stats', kiloRoutes.getStats.bind(kiloRoutes));

// App routes
app.post('/api/apps/create', appRoutes.createApp.bind(appRoutes));
app.get('/api/apps', appRoutes.listApps.bind(appRoutes));
app.get('/api/apps/stats', appRoutes.getStats.bind(appRoutes));
app.get('/api/apps/:id', appRoutes.getApp.bind(appRoutes));
app.post('/api/apps/:id/start', appRoutes.startApp.bind(appRoutes));
app.post('/api/apps/:id/stop', appRoutes.stopApp.bind(appRoutes));
app.post('/api/apps/:id/restart', appRoutes.restartApp.bind(appRoutes));
app.post('/api/apps/:id/test', appRoutes.runTests.bind(appRoutes));
app.get('/api/apps/:id/logs', appRoutes.getAppLogs.bind(appRoutes));
app.get('/api/apps/:id/status', appRoutes.getAppStatus.bind(appRoutes));

// Autonomous agent routes
app.post('/api/autonomous/execute', autonomousRoutes.executeGoal.bind(autonomousRoutes));
app.get('/api/autonomous/state', autonomousRoutes.getState.bind(autonomousRoutes));
app.get('/api/autonomous/plans', autonomousRoutes.getPlans.bind(autonomousRoutes));
app.get('/api/autonomous/plans/:id', autonomousRoutes.getPlan.bind(autonomousRoutes));
app.get('/api/autonomous/logs', autonomousRoutes.getLogs.bind(autonomousRoutes));
app.get(
  '/api/autonomous/logs/summary/:planId',
  autonomousRoutes.getLogSummary.bind(autonomousRoutes)
);
app.get('/api/autonomous/artifacts/:planId', autonomousRoutes.getArtifacts.bind(autonomousRoutes));
app.get('/api/autonomous/capabilities', autonomousRoutes.getCapabilities.bind(autonomousRoutes));
app.get('/api/autonomous/notifications', autonomousRoutes.getNotifications.bind(autonomousRoutes));

// WebSocket connection handling
wss.on('connection', ws => {
  console.log('WebSocket client connected');

  // Forward messages from OpenClaw to frontend
  const openclawWs = openclawClient.connectWebSocket();

  openclawWs.on('message', data => {
    ws.send(data.toString());
  });

  openclawWs.on('close', () => {
    ws.close();
  });

  ws.on('message', data => {
    // Forward messages from frontend to OpenClaw
    openclawWs.send(data.toString());
  });

  ws.on('close', () => {
    openclawWs.close();
    console.log('WebSocket client disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`BFF server running on port ${PORT}`);
  console.log(`Connected to OpenClaw at ${OPENCLAW_URL}`);
});

export { app, server };
