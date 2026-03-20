# OpenBro247 - TypeScript AI Browser Automation System

OpenBro247 is a powerful, TypeScript-based AI agent system that provides true browser automation with semantic memory, self-improving skills, and MCP (Model Context Protocol) integration. It's a complete rewrite of the original Python openclaw247 project, leveraging the JavaScript/TypeScript ecosystem for superior performance and native AI tool integration.

## 🚀 What Makes OpenBro247 Special

Unlike traditional browser automation tools, OpenBro247 is a **true AI agent** that:

- **Learns from experience** using semantic memory and vector search
- **Adapts its behavior** through self-improving skills
- **Coordinates multiple concurrent tasks** with master/sub-agent delegation
- **Integrates seamlessly** with AI tools via official SDKs
- **Provides real-time communication** through WebSocket APIs
- **Supports MCP protocol** for external tool integration

## 🎯 Key Features

### True Browser Automation
- Human-like mouse movements with Bezier curves
- Virtual cursor with variable speed control
- DOM element detection (CSS, XPath, text, role, label)
- Form filling, button clicking, link navigation
- Screenshot capture and multi-tab management
- Natural scrolling behavior

### Advanced Memory System
- **Vector Storage**: ChromaDB for semantic search and embeddings
- **Structured Storage**: SQLite for metadata and relationships
- **Unified Interface**: Single API for all memory operations
- **Skill Learning**: Automatic skill extraction from successful actions
- **Failure Analysis**: Learning from anti-patterns

### Multi-Provider AI Integration
- **OpenAI**: GPT-4, GPT-3.5-turbo via official SDK
- **Anthropic**: Claude-3 via official SDK
- **Local Models**: Support for local LLM deployments
- **Streaming**: Real-time response streaming
- **Embedding**: Vector embeddings for semantic search

### API & Communication
- **REST API**: Full HTTP API with Fastify
- **WebSocket**: Real-time bidirectional communication
- **CORS Support**: Configurable cross-origin access
- **Type Safety**: Full TypeScript interfaces

### MCP Integration (Coming Soon)
- **MCP Server**: Expose agent capabilities as MCP tools
- **MCP Client**: Use external MCP-compatible tools
- **Tool Discovery**: Dynamic tool registration and discovery
- **Resource Management**: MCP resource protocol support

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Server    │    │  AI Services    │    │ Browser Engine  │
│   (Fastify)     │◄──►│ (LLM Manager)   │◄──►│ (Playwright)    │
│                 │    │                 │    │                 │
│ • REST API      │    │ • Multi-Provider │    │ • Human-like   │
│ • WebSocket     │    │ • Streaming      │    │ • DOM Control  │
│ • MCP Protocol  │    │ • Embeddings     │    │ • Multi-tab    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Memory System  │    │   Skill Store   │    │   Integrations  │
│ (Semantic Mem)  │    │ (Self-Improving)│    │ (YouTube, etc)  │
│                 │    │                 │    │                 │
│ • Vector Search │    │ • Usage Stats   │    │ • API Clients   │
│ • SQLite Store  │    │ • Success Rates │    │ • Fallbacks     │
│ • Context       │    │ • Learning      │    │ • Automation    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📦 Installation

### Prerequisites
- Node.js 18+ with npm
- Playwright browsers (installed automatically)

### Quick Start
```bash
# Clone and install
npm install

# Install Playwright browsers
npx playwright install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Build TypeScript
npm run build

# Start the server
npm start
```

### Environment Configuration
```bash
# Required API Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Server Configuration
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=http://localhost:3000,http://localhost:8000

# Memory Configuration
VECTOR_PATH=./data/memory/vectors
SQLITE_PATH=./data/memory/structured.db

# Browser Configuration
BROWSER_HEADLESS=false
BROWSER_TYPE=chromium
BROWSER_WIDTH=1920
BROWSER_HEIGHT=1080
BROWSER_HUMAN_LIKE=true
BROWSER_SPEED_MULTIPLIER=1.0
BROWSER_TIMEOUT=30000
BROWSER_SLOW_MO=50

# LLM Configuration
DEFAULT_LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
LOCAL_LLM_BASE_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama2
```

## 🔧 API Endpoints

### Command Processing
```bash
POST /api/command
{
  "command": "Browse to Google and search for TypeScript",
  "context": { "session_id": "abc123" }
}
```

### Browser Operations
```bash
POST /api/browse
{
  "url": "https://google.com",
  "action": "search"
}

GET /api/memory/stats
POST /api/memory/store
GET /api/memory/search?q=typescript
```

### Skill Management
```bash
POST /api/skills/store
{
  "name": "Google Search",
  "description": "Search Google for any query",
  "content": "Navigate to google.com, enter query, click search",
  "type": "web_navigation",
  "confidence": 0.9
}

GET /api/skills/search?q=navigation
```

### Agent Operations
```bash
POST /api/agents/spawn
{
  "type": "sub_agent",
  "task": "Research latest TypeScript features",
  "config": { "timeout": 300000 }
}

POST /api/agents/spawn-multiple
{
  "agents": [
    { "type": "researcher", "task": "Analyze trends" },
    { "type": "browser", "task": "Screenshot websites" }
  ]
}
```

### Heartbeat System
```bash
GET /api/heartbeat/status
POST /api/heartbeat/trigger-learning
POST /api/heartbeat/trigger-browsing
```

### Real-time Communication
```javascript
// WebSocket connection
const ws = new WebSocket('ws://localhost:8000/ws');

// Send commands
ws.send(JSON.stringify({
  type: 'command',
  data: { command: 'Browse to example.com' }
}));

// Receive responses
ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log('Agent response:', response);
};
```

## 🧠 How It Works

### 1. Command Processing
When you send a natural language command:

1. **Parsing**: LLM analyzes the command and breaks it into steps
2. **Planning**: Agent generates an action plan
3. **Execution**: Browser automation performs the actions
4. **Learning**: System stores successful patterns as skills
5. **Memory**: All interactions are stored for future reference

### 2. Memory & Learning
- **Vector Embeddings**: Commands and results are converted to vectors
- **Semantic Search**: Similar tasks are found using vector similarity
- **Skill Extraction**: Successful action sequences become reusable skills
- **Usage Tracking**: Skills improve their success rates over time

### 3. Multi-Agent Coordination
- **Master Agent**: Coordinates high-level tasks
- **Sub-Agents**: Handle specific browser automation tasks
- **Concurrent Execution**: Multiple browsers can run simultaneously
- **Task Delegation**: Complex tasks are broken into parallel subtasks

## 🔌 MCP Integration (Planned)

OpenBro247 will fully support the Model Context Protocol:

### As MCP Server
```typescript
// Expose agent capabilities as MCP tools
{
  "name": "browse_website",
  "description": "Navigate to a website and perform actions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": { "type": "string" },
      "actions": { "type": "array" }
    }
  }
}
```

### As MCP Client
```typescript
// Use external MCP tools
const result = await mcpClient.callTool('external_search', {
  query: 'latest AI trends',
  engine: 'google'
});
```

## 🛠️ Development

### Project Structure
```
openbro247-typescript/
├── src/
│   ├── ai/                 # AI services (LLM manager)
│   ├── api/                # REST/WebSocket API server
│   ├── browser/            # Playwright browser automation
│   ├── memory/             # Vector + SQLite memory system
│   ├── utils/              # Logging, config utilities
│   ├── integrations/       # External service integrations
│   ├── skills/             # Platform-specific skills
│   └── main.ts             # Application entry point
├── dist/                   # Compiled JavaScript
├── data/                   # Runtime data (vectors, db, logs)
├── package.json
├── tsconfig.json
└── README.md
```

### Building & Running
```bash
# Development with auto-reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

### Testing
```bash
# Run tests (when implemented)
npm test

# Run with coverage
npm run test:coverage
```

## 🌟 Use Cases

### Web Research & Analysis
- Automated market research
- Competitive analysis
- Content monitoring
- Price tracking

### Data Collection
- Web scraping with AI understanding
- Form automation
- Multi-site data aggregation
- Screenshot-based monitoring

### Workflow Automation
- Business process automation
- Quality assurance testing
- Content management
- Social media monitoring

### AI-Powered Browsing
- Context-aware web navigation
- Intelligent form filling
- Adaptive user interaction
- Learning from user behavior

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/openbro247-typescript.git`
3. Install dependencies: `npm install`
4. Create feature branch: `git checkout -b feature/your-feature`
5. Make changes and add tests
6. Build and test: `npm run build && npm test`
7. Submit pull request

### Coding Standards
- **TypeScript Strict**: All code must pass strict TypeScript compilation
- **ESLint**: Follow provided linting rules
- **Tests**: Write tests for new features
- **Documentation**: Update README and inline comments

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **Playwright**: For powerful browser automation
- **ChromaDB**: For vector database functionality
- **OpenAI & Anthropic**: For AI model access
- **Fastify**: For high-performance API server
- **Original openclaw247**: For the inspiration and concept

## 🚧 Roadmap

### Phase 1: Core System ✅
- TypeScript rewrite with modern architecture
- Browser automation with human-like behavior
- Multi-provider AI integration
- Semantic memory system
- REST/WebSocket API

### Phase 2: Advanced Features 🔄
- MCP protocol integration
- CLI interface with Oclif
- YouTube automation with transcripts
- Web crawler with content extraction
- Platform-specific skills (WhatsApp, Telegram, etc.)

### Phase 3: Production Ready 🚀
- Comprehensive testing suite
- Docker containerization
- Monitoring and logging
- Performance optimization
- Enterprise features

---

**OpenBro247**: Where AI meets browser automation with true intelligence and learning capabilities.