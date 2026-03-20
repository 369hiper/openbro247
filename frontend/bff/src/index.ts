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

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.BFF_PORT || 3001;
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:8000';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Initialize OpenClaw client
const openclawClient = new OpenClawClient(OPENCLAW_URL);

// Initialize routes
const agentRoutes = new AgentRoutes(openclawClient);
const taskRoutes = new TaskRoutes(openclawClient);
const chatRoutes = new ChatRoutes(openclawClient);
const modelRoutes = new ModelRoutes(openclawClient);

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

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  // Forward messages from OpenClaw to frontend
  const openclawWs = openclawClient.connectWebSocket();
  
  openclawWs.on('message', (data) => {
    ws.send(data.toString());
  });

  openclawWs.on('close', () => {
    ws.close();
  });

  ws.on('message', (data) => {
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
