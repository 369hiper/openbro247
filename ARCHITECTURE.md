# OpenBro247 TypeScript - Complete Architecture Documentation

**Version:** 1.0.0  
**Last Updated:** March 22, 2026  
**Status:** Active Development

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture Diagram](#architecture-diagram)
4. [Core TypeScript System](#core-typescript-system)
5. [Python Auxiliary Systems](#python-auxiliary-systems)
6. [Module Documentation](#module-documentation)
7. [Data Flow](#data-flow)
8. [API Reference](#api-reference)
9. [Known Limitations](#known-limitations)
10. [Directory Structure](#directory-structure)

---

## Executive Summary

OpenBro247 is a **polyglot, multi-agent automation system** centered around a TypeScript core with specialized Python auxiliary systems. The architecture consists of:

### Primary Systems

| System | Language | Purpose | Status |
|--------|----------|---------|--------|
| **TypeScript Core** | TypeScript/Node.js | Central nervous system, API server, agent runtime | ✅ Active |
| **Code-Assistant-AI** | Python | AST-based code analysis with Tree-sitter | ✅ Functional |
| **web-ui** | Python/Gradio | Browser agent UI with browser-use integration | ✅ Functional |
| **computer_use_ootb** | Python | Computer use demonstration system | ⚠️ Demo |

### Verified Claims Assessment

| Claim | Status | Evidence |
|-------|--------|----------|
| AST parsing is regex-based | ✅ **VERIFIED** | `src/code-analysis/codeParser.ts` uses regex patterns, not tree-sitter |
| VSCode hard dependency exists | ✅ **VERIFIED** | `src/computer-use/orchestrator.ts` imports `VSCodeController` directly |
| Headless search is linear | ✅ **VERIFIED** | `src/research/index.ts` has no feedback loop |
| Browser uses Playwright | ✅ **VERIFIED** | `src/browser/engine.ts` wraps Playwright properly |
| Windows control uses exec | ✅ **VERIFIED** | `src/desktop/windowsControl.ts` shells to PowerShell |

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OPENBRO247 ECOSYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    TypeScript Core (src/)                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ API Server   │  │ Agent        │  │ Memory       │            │    │
│  │  │ (Fastify)    │◄─┤ Runtime      │◄─┤ System       │            │    │
│  │  │              │  │ (ReAct)      │  │ (ChromaDB+   │            │    │
│  │  └──────────────┘  └──────────────┘  │  SQLite)     │            │    │
│  │         │                │           └──────────────┘            │    │
│  │         ▼                ▼                                         │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ Browser      │  │ Computer     │  │ Tool         │            │    │
│  │  │ Engine       │  │ Use          │  │ Registry     │            │    │
│  │  │ (Playwright) │  │ Orchestrator │  │ (13 tools)   │            │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│         │                │                                                   │
│         ▼                ▼                                                   │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    Python Auxiliary Systems                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ Code-        │  │ web-ui       │  │ computer_    │            │    │
│  │  │ Assistant-   │  │ (Gradio)     │  │ use_ootb     │            │    │
│  │  │ AI           │  │              │  │              │            │    │
│  │  │ (Tree-sitter)│  │              │  │              │            │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Diagram

### Component Relationships

```
                                    ┌─────────────────┐
                                    │   Environment   │
                                    │   Variables     │
                                    └────────┬────────┘
                                             │
                                    ┌────────▼────────┐
                                    │   main.ts       │
                                    │   (Entry Point) │
                                    └────────┬────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
     ┌────────▼────────┐           ┌────────▼────────┐           ┌────────▼────────┐
     │   APIServer     │           │   AgentRuntime  │           │  SemanticMemory │
     │   (Fastify)     │           │   (ReAct Loop)  │           │  (ChromaDB+     │
     │                 │           │                 │           │   SQLite)       │
     └────────┬────────┘           └────────┬────────┘           └────────┬────────┘
              │                              │                              │
              │                              │                              │
     ┌────────▼─────────────────────────────▼─────────────────────────────▼────────┐
     │                              ToolRegistry                                    │
     │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │
     │  │web_search │ │browse_url │ │read_file  │ │run_command│ │take_      │    │
     │  │           │ │           │ │write_file │ │           │ │screenshot │    │
     │  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘    │
     │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │
     │  │http_      │ │browser_   │ │edit_file  │ │search_    │ │computer_  │    │
     │  │request    │ │click/type │ │           │ │files      │ │screenshot │    │
     │  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘    │
     └───────────────────────────────────────────────────────────────────────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
     ┌────────▼────────┐           ┌────────▼────────┐           ┌────────▼────────┐
     │  BrowserEngine  │           │ComputerUse      │           │  Desktop        │
     │  (Playwright)   │           │Orchestrator     │           │  Control        │
     └─────────────────┘           └────────┬────────┘           └────────┬────────┘
                                            │                              │
                                   ┌────────▼────────┐           ┌────────▼────────┐
                                   │VSCodeController │           │WindowsControl   │
                                   │⚠️ HARD DEPENDENCY│           │(PowerShell exec)│
                                   └─────────────────┘           └─────────────────┘
```

---

## Core TypeScript System

### 1. Entry Point (`src/main.ts`)

**Purpose:** Application bootstrap and lifecycle management

**Key Responsibilities:**
- Load environment configuration
- Initialize all core components
- Start API server
- Handle graceful shutdown

**Initialization Order:**
```
1. LLMManager (multi-provider LLM routing)
2. SemanticMemory (ChromaDB + SQLite)
3. BrowserEngine (Playwright)
4. AgentManager (agent lifecycle)
5. ModelRouter (LLM selection)
6. TaskOrchestrator (task coordination)
7. ChatManager (conversation handling)
8. ComputerUseOrchestrator (desktop automation)
9. AutonomousDigitalOperator (specialized agents)
10. APIServer (Fastify HTTP + WebSocket)
11. AgentRuntime (ReAct loop) ← Phase 1
12. HeartbeatSystem (continuous learning) ← Phase 1
13. CronScheduler (scheduled tasks) ← Phase 1
```

**Code Quality:** ✅ Well-structured error handling, proper shutdown hooks

---

### 2. AI/LLM Module (`src/ai/`)

#### LLMManager (`src/ai/llmManager.ts`)

**Purpose:** Multi-provider LLM abstraction layer

**Supported Providers:**
| Provider | Models | Status |
|----------|--------|--------|
| OpenAI | GPT-4, GPT-3.5-turbo | ✅ Full |
| Anthropic | Claude-3 family | ✅ Full |
| Local | Ollama, LMStudio | ⚠️ Basic |

**Key Methods:**
```typescript
generate(prompt: string, options: LLMOptions): Promise<LLMResponse>
stream(prompt: string, options: LLMOptions): AsyncGenerator<string>
embed(text: string): Promise<number[]>
```

**Assessment:** ✅ Production-ready, proper error handling

---

### 3. Memory System (`src/memory/`)

#### SemanticMemory (`src/memory/semanticMemory.ts`)

**Purpose:** Hybrid vector + structured storage

**Architecture:**
```
┌─────────────────────────────────────────────┐
│           SemanticMemory                    │
│  ┌─────────────────┐  ┌─────────────────┐  │
│  │   ChromaDB      │  │   SQLite        │  │
│  │   (Vectors)     │  │   (Metadata)    │  │
│  │                 │  │                 │  │
│  │ - Embeddings    │  │ - Conversations │  │
│  │ - Similarity    │  │ - Skills        │  │
│  │ - MMR Search    │  │ - Agent State   │  │
│  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────┘
```

**Key Methods:**
```typescript
store(content: string, type: string, metadata: any): Promise<void>
recall(query: string, limit: number): Promise<Memory[]>
semanticSearch(query: string, filters?: Filter): Promise<Memory[]>
storeSkill(name: string, description: string, content: string): Promise<void>
storeAction(tool: string, input: any, output: any, success: boolean): Promise<void>
```

**Assessment:** ✅ Functional, ChromaDB integration working

---

### 4. Browser Engine (`src/browser/engine.ts`)

**Purpose:** Playwright wrapper for browser automation

**Features:**
- Multi-browser support (Chromium, Firefox, WebKit)
- Human-like interaction simulation
- Screenshot capture
- DOM element extraction
- Form filling and clicking

**Key Methods:**
```typescript
launch(): Promise<void>
navigate(url: string): Promise<void>
click(selector: string): Promise<void>
type(text: string, selector?: string): Promise<void>
screenshot(path?: string): Promise<Buffer>
evaluate<T>(pageFunction: string): Promise<T>
extractText(selector: string, all?: boolean): Promise<string|string[]>
```

**Assessment:** ✅ **PASSABLE** - Standard Playwright wrapper, no issues

---

### 5. Agent Runtime (`src/agents/agentRuntime.ts`)

**Purpose:** ReAct loop execution engine

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                    AgentRuntime                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 ReAct Loop                            │  │
│  │                                                       │  │
│  │   Thought → Action → Observation → Repeat             │  │
│  │      │           │           │                        │  │
│  │      ▼           ▼           ▼                        │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐                  │  │
│  │  │ LLM    │  │ Tool   │  │ Store  │                  │  │
│  │  │ Gen    │  │ Exec   │  │ Result │                  │  │
│  │  └────────┘  └────────┘  └────────┘                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Key Methods:**
```typescript
execute(agent: Agent, goal: string, options: RuntimeOptions): Promise<AgentExecution>
cancelExecution(executionId: string): Promise<void>
getActiveExecutions(): AgentExecution[]
```

**Assessment:** ✅ **SOLID** - ReAct loop properly implemented, tool integration works

---

### 6. Computer Use Orchestrator (`src/computer-use/orchestrator.ts`)

**Purpose:** Coordinate desktop automation tasks

**⚠️ CRITICAL ISSUE: Hard VSCode Dependency**

```typescript
// Line 4-5, src/computer-use/orchestrator.ts
import { VSCodeController, getVSCodeController } from '../desktop/vscodeController';
// ...
this.vscodeController = getVSCodeController(); // HARD DEPENDENCY
```

**Task Types Supported:**
| Type | Status | Implementation |
|------|--------|----------------|
| `web_navigation` | ✅ | Browser automation |
| `desktop_operation` | ⚠️ | PowerShell scripts |
| `coding_task` | ⚠️ | VSCodeController only |
| `research` | ✅ | Browser + crawler |
| `monitoring` | ⚠️ | Basic screen capture |
| `complex_workflow` | ❌ | Not implemented |

**Assessment:** 🔴 **VSCode hard dependency confirmed** - Not truly autonomous

---

### 7. Tool Registry (`src/skills/toolRegistry.ts`)

**Purpose:** Centralized tool management for agents

**Registered Tools (13 total):**

| Tool | Category | Status | Notes |
|------|----------|--------|-------|
| `web_search` | Web | ✅ | DuckDuckGo scraping |
| `browse_url` | Web | ✅ | Playwright navigation |
| `browser_click` | Web | ✅ | DOM click |
| `browser_type` | Web | ✅ | DOM type |
| `take_screenshot` | Web | ✅ | Browser screenshot |
| `read_file` | File | ✅ | Node.js fs |
| `write_file` | File | ✅ | Node.js fs |
| `list_directory` | File | ✅ | Node.js fs |
| `http_request` | Network | ✅ | fetch API |
| `run_command` | Shell | ⚠️ | Safety via string filter |
| `store_memory` | Memory | ✅ | ChromaDB |
| `memory_recall` | Memory | ✅ | ChromaDB |
| `browser_evaluate` | Web | ✅ | JS execution |
| `edit_file` | File | ✅ | Search/replace |
| `search_files` | File | ✅ | Recursive grep |
| `computer_screenshot` | Desktop | ⚠️ | ScreenCapture module |

**Assessment:** ⚠️ Generic tools only, no specialized capabilities

---

### 8. Desktop Control (`src/desktop/`)

#### WindowsControl (`src/desktop/windowsControl.ts`)

**Purpose:** Windows desktop automation

**Implementation:** PowerShell script execution via `child_process.exec`

**Key Methods:**
```typescript
getWindows(): Promise<WindowInfo[]>
findWindow(options): Promise<WindowInfo | null>
activateWindow(hwnd: number): Promise<void>
closeWindow(hwnd: number): Promise<void>
launchApplication(app: string, args?: string[]): Promise<number>
getUIElements(hwnd?: number): Promise<UIElement[]>
clickElement(element: UIElement): Promise<void>
mouseMove(x: number, y: number): Promise<void>
mouseClick(x: number, y: number): Promise<void>
sendKeys(keys: string): Promise<void>
typeText(text: string): Promise<void>
getProcesses(): Promise<ProcessInfo[]>
```

**Assessment:** 🔴 **PowerShell exec wrapper** - Slow, fragile, Windows-only

**Example Implementation:**
```typescript
async getWindows(): Promise<WindowInfo[]> {
  const script = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
      [DllImport("user32.dll")]
      public static extern bool IsWindowVisible(IntPtr hWnd);
      // ... 100+ lines of C# embedded in PowerShell
"@
    // PowerShell execution
  `;
  const { stdout } = await execAsync(`powershell -Command "${script}"`);
  return JSON.parse(stdout);
}
```

---

#### ScreenCapture (`src/desktop/screenCapture.ts`)

**Purpose:** Desktop screen capture

**Implementation:** .NET System.Drawing via PowerShell

**Assessment:** 🔴 **Using deprecated System.Drawing** - Should use Desktop Duplication API

---

#### VSCodeController (`src/desktop/vscodeController.ts`)

**Purpose:** VS Code automation

**Implementation:** Mix of VS Code CLI and keyboard automation

**Key Methods:**
```typescript
open(options): Promise<void>
openFile(filePath: string, line?: number): Promise<void>
readFile(filePath: string): Promise<string>
writeFile(filePath: string, content: string): Promise<void>
editFile(edit: FileEdit): Promise<void>
executeCommand(command: string): Promise<void>
runTerminalCommand(command: string): Promise<void>
```

**Assessment:** ⚠️ Works but contributes to hard dependency issue

---

### 9. Code Analysis (`src/code-analysis/`)

#### CodeParser (`src/code-analysis/codeParser.ts`)

**Purpose:** Extract code definitions for RAG

**⚠️ CRITICAL ISSUE: Regex-Based Parsing (NOT AST)**

**Admission in Code:**
```typescript
// Line 42, src/code-analysis/codeParser.ts
/**
 * Parse a file and extract code definitions using regex-based AST approximation
 * For production use, integrate with Tree-sitter WASM bindings
 */
```

**Regex Patterns Used:**
```typescript
// Class detection
const classMatch = line.match(
  /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?/
);

// Function detection
const funcMatch = line.match(
  /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*\(([^)]*)\)\s*\{)/
);

// Interface detection
const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
```

**Assessment:** 🔴 **FAKE AST** - Regex-based, cannot handle complex nesting

**Comparison with Code-Assistant-AI (Python):**
| Feature | TypeScript Core | Code-Assistant-AI |
|---------|-----------------|-------------------|
| Parser | Regex | Tree-sitter |
| AST | Approximate | Real |
| Language Support | TS/JS/Py (regex) | 7 languages (real) |
| Complex Nesting | ❌ Breaks | ✅ Handles |

---

### 10. Research Module (`src/research/index.ts`)

**Purpose:** Generate research reports

**⚠️ ISSUE: Linear Execution (No Feedback Loop)**

**Execution Flow:**
```
1. searchForTopic(topic) → Google search
2. crawlRelevantPages(urls, depth) → Crawl pages
3. generateReportWithAI(topic, content) → LLM summary
4. storeReportInMemory(report) → Save
```

**No Iteration:**
- ❌ No result quality evaluation
- ❌ No query refinement
- ❌ No gap detection
- ❌ No re-search capability

**Assessment:** 🔴 **Web scraper with LLM** - Not a true research agent

---

### 11. Crawler Module (`src/crawler/index.ts`)

**Purpose:** Web crawling for content extraction

**Implementation:** Playwright-based recursive crawler

**Key Methods:**
```typescript
crawl(url: string, options: CrawlOptions): Promise<CrawlResult[]>
crawlSingle(url: string): Promise<CrawlResult>
```

**Assessment:** ✅ Functional but basic depth-first crawler

---

## Python Auxiliary Systems

### 1. Code-Assistant-AI (`Code-Assistant-AI/`)

**Purpose:** Production-grade code analysis with Tree-sitter

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│              Code-Assistant-AI                           │
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Tree-sitter    │  │  LangChain      │              │
│  │  (Real AST)     │  │  (RAG Chain)    │              │
│  │                 │  │                 │              │
│  │ - Python        │  │ - ChromaDB      │              │
│  │ - JavaScript    │  │ - MMR Search    │              │
│  │ - TypeScript    │  │ - QA Chain      │              │
│  │ - Java, Go...   │  │                 │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

**Key Files:**
- `main.py` - CLI entry point
- `src/code_assistant.py` - Core assistant logic
- `src/code_parser.py` - Tree-sitter integration
- `src/vector_store.py` - ChromaDB integration

**Assessment:** ✅ **REAL AST** - Uses langchain + tree-sitter properly

---

### 2. web-ui (`web-ui/`)

**Purpose:** Gradio UI for browser automation

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                    web-ui                                │
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Gradio UI      │  │  browser-use    │              │
│  │  (Frontend)     │  │  (Automation)   │              │
│  │                 │  │                 │              │
│  │ - Theme support │  │ - Playwright    │              │
│  │ - Session mgmt  │  │ - Agent loop    │              │
│  │ - History       │  │ - Screenshots   │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

**Key Files:**
- `webui.py` - Entry point
- `src/webui/interface.py` - Gradio interface
- `src/browser_agent.py` - Browser automation

**Assessment:** ✅ Production-ready browser automation UI

---

### 3. computer_use_ootb (`computer_use_ootb/`)

**Purpose:** Computer use demonstration

**Status:** Demo/reference implementation

**Assessment:** ⚠️ Demo only, not integrated with main system

---

## Module Documentation

### Complete Module List

```
src/
├── agents/          # Agent management and runtime
│   ├── agentManager.ts
│   ├── agentRuntime.ts      ← ReAct loop
│   ├── heartbeat.ts         ← Continuous learning
│   └── types.ts
│
├── ai/              # LLM abstraction
│   └── llmManager.ts
│
├── api/             # HTTP/WebSocket server
│   └── server.ts
│
├── browser/         # Playwright wrapper
│   └── engine.ts
│
├── chat/            # Conversation management
│   └── chatManager.ts
│
├── code-analysis/   # Code parsing (REGEX-BASED)
│   ├── codeParser.ts        ← Uses regex, not AST
│   ├── ragChain.ts
│   └── types.ts
│
├── computer-use/    # Desktop automation
│   ├── orchestrator.ts      ← Hard VSCode dependency
│   ├── digitalOperator.ts
│   ├── taskPlanner.ts
│   └── types.ts
│
├── crawler/         # Web crawling
│   └── index.ts
│
├── desktop/         # Windows control
│   ├── windowsControl.ts    ← PowerShell exec
│   ├── screenCapture.ts     ← .NET System.Drawing
│   └── vscodeController.ts
│
├── identity/        # Device identity (unused)
│   ├── deviceIdentity.ts
│   ├── tokenManager.ts
│   └── accessControl.ts
│
├── integrations/    # External services
│   └── [various]
│
├── memory/          # Vector + structured storage
│   ├── semanticMemory.ts
│   └── sqliteStore.ts
│
├── models/          # LLM routing
│   └── modelRouter.ts
│
├── plugins/         # Plugin system
│   └── marketing.ts
│
├── rag/             # RAG utilities
│   └── [utilities]
│
├── research/        # Research reports (LINEAR)
│   └── index.ts               ← No feedback loop
│
├── skills/          # Tool registry
│   └── toolRegistry.ts        ← 13 tools
│
├── tasks/           # Task management
│   ├── taskOrchestrator.ts
│   └── cronScheduler.ts
│
├── tool-use/        # Tool utilities
│   └── [utilities]
│
├── types/           # TypeScript types
│   └── [definitions]
│
├── utils/           # Utilities
│   ├── logger.ts
│   └── usageTracker.ts
│
├── vision/          # Screen analysis (STUBBED)
│   └── screenAnalyzer.ts      ← Incomplete
│
└── main.ts          # Entry point
```

---

## Data Flow

### Command Execution Flow

```
User Input (API/CLI/WebSocket)
       │
       ▼
┌──────────────┐
│  APIServer   │
│  (Fastify)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│ ChatManager  │────►│  AgentManager │
└──────┬───────┘     └──────┬───────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────────┐
│         AgentRuntime (ReAct)         │
│  ┌────────────────────────────────┐  │
│  │  Loop:                         │  │
│  │  1. Generate thought           │  │
│  │  2. Select tool                │  │
│  │  3. Execute tool               │  │
│  │  4. Store observation          │  │
│  │  5. Repeat or finalize         │  │
│  └────────────────────────────────┘  │
└──────────────┬───────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Tool   │ │ Memory │ │ Browser│
│Registry│ │ System │ │ Engine │
└───┬────┘ └───┬────┘ └───┬────┘
    │          │          │
    │          │          ▼
    │          │    ┌─────────────┐
    │          │    │ Playwright  │
    │          │    └─────────────┘
    │          ▼
    │    ┌─────────────┐
    │    │ ChromaDB    │
    │    │ SQLite      │
    │    └─────────────┘
    ▼
┌─────────────────────────────────┐
│         Tool Execution          │
│  ┌─────────┐ ┌─────────┐       │
│  │ File    │ │ Shell   │       │
│  │ Ops     │ │ Commands│       │
│  └─────────┘ └─────────┘       │
│  ┌─────────┐ ┌─────────┐       │
│  │ Web     │ │ Desktop │       │
│  │ Search  │ │ Control │       │
│  └─────────┘ └─────────┘       │
└─────────────────────────────────┘
```

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/command` | Execute natural language command |
| POST | `/api/browse` | Browser operation |
| GET | `/api/memory/stats` | Memory system statistics |
| POST | `/api/memory/store` | Store memory |
| GET | `/api/memory/search` | Semantic search |
| POST | `/api/skills/store` | Store skill |
| GET | `/api/skills/search` | Search skills |
| POST | `/api/agents/spawn` | Spawn new agent |
| GET | `/api/heartbeat/status` | Heartbeat system status |
| GET | `/ws` | WebSocket connection |

### WebSocket Messages

```typescript
// Send command
{
  type: 'command',
  data: { command: 'Browse to example.com' }
}

// Receive response
{
  type: 'response',
  data: { result: '...', status: 'completed' }
}

// Receive streaming update
{
  type: 'update',
  data: { step: 'navigating', progress: 0.5 }
}
```

---

## Known Limitations

### Critical Issues

| Issue | Severity | File | Fix Required |
|-------|----------|------|--------------|
| Regex-based AST parsing | 🔴 High | `src/code-analysis/codeParser.ts` | Integrate web-tree-sitter |
| Hard VSCode dependency | 🔴 High | `src/computer-use/orchestrator.ts` | Interface-out VSCodeController |
| No vision system integration | 🔴 High | `src/vision/screenAnalyzer.ts` | Complete implementation |
| Linear research (no feedback) | 🟡 Medium | `src/research/index.ts` | Add iterative loop |
| PowerShell exec for desktop | 🟡 Medium | `src/desktop/windowsControl.ts` | Use native bindings (nut.js) |
| Deprecated System.Drawing | 🟡 Medium | `src/desktop/screenCapture.ts` | Use Desktop Duplication API |

### Missing Features

| Feature | Status | Priority |
|---------|--------|----------|
| Real error recovery | ❌ Missing | High |
| Actual learning loop | ⚠️ Stubbed | High |
| Specialized tools | ❌ Missing | Medium |
| IDE integration | ❌ Missing | Medium |
| Multi-agent coordination | ⚠️ Designed | Medium |
| Testing suite | ❌ Missing | High |

---

## Directory Structure

### Complete File Tree

```
openbro247-typescript/
├── src/                          # TypeScript core
│   ├── __tests__/                # Tests (empty)
│   ├── agents/                   # Agent system
│   │   ├── agentManager.ts
│   │   ├── agentRuntime.ts       # ReAct loop
│   │   ├── heartbeat.ts          # Continuous learning
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── ai/                       # LLM management
│   │   └── llmManager.ts
│   │
│   ├── api/                      # HTTP/WebSocket server
│   │   └── server.ts
│   │
│   ├── browser/                  # Playwright wrapper
│   │   └── engine.ts
│   │
│   ├── chat/                     # Conversation management
│   │   └── chatManager.ts
│   │
│   ├── code-analysis/            # Code parsing (REGEX)
│   │   ├── codeParser.ts         # ⚠️ Regex-based
│   │   ├── ragChain.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── computer-use/             # Desktop automation
│   │   ├── orchestrator.ts       # ⚠️ VSCode hard dependency
│   │   ├── autonomousAgent.ts
│   │   ├── browserAgent.ts
│   │   ├── digitalOperator.ts
│   │   ├── executionLogger.ts
│   │   ├── goalNotifier.ts
│   │   ├── selfImprovement.ts    # ⚠️ Stubbed
│   │   ├── taskPlanner.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── crawler/                  # Web crawling
│   │   └── index.ts
│   │
│   ├── desktop/                  # Windows control
│   │   ├── windowsControl.ts     # ⚠️ PowerShell exec
│   │   ├── screenCapture.ts      # ⚠️ System.Drawing
│   │   ├── vscodeController.ts
│   │   └── inputSimulator.ts
│   │
│   ├── identity/                 # Device identity
│   │   ├── deviceIdentity.ts
│   │   ├── tokenManager.ts
│   │   └── accessControl.ts
│   │
│   ├── integrations/             # External services
│   │   └── [various]
│   │
│   ├── memory/                   # Storage system
│   │   ├── semanticMemory.ts
│   │   └── sqliteStore.ts
│   │
│   ├── models/                   # LLM routing
│   │   └── modelRouter.ts
│   │
│   ├── plugins/                  # Plugin system
│   │   └── marketing.ts
│   │
│   ├── rag/                      # RAG utilities
│   │   └── [utilities]
│   │
│   ├── research/                 # Research reports
│   │   └── index.ts              # ⚠️ Linear execution
│   │
│   ├── skills/                   # Tool registry
│   │   └── toolRegistry.ts       # 13 tools
│   │
│   ├── tasks/                    # Task management
│   │   ├── taskOrchestrator.ts
│   │   └── cronScheduler.ts
│   │
│   ├── tool-use/                 # Tool utilities
│   │   └── [utilities]
│   │
│   ├── types/                    # Type definitions
│   │   └── [definitions]
│   │
│   ├── utils/                    # Utilities
│   │   ├── logger.ts
│   │   ├── usageTracker.ts
│   │   └── config.ts
│   │
│   ├── vision/                   # Screen analysis
│   │   └── screenAnalyzer.ts     # ⚠️ Incomplete
│   │
│   └── main.ts                   # Entry point
│
├── Code-Assistant-AI/            # Python code analysis
│   ├── src/
│   │   ├── code_assistant.py
│   │   ├── code_parser.py        # ✅ Tree-sitter
│   │   └── vector_store.py
│   ├── main.py
│   └── requirements.txt
│
├── web-ui/                       # Python Gradio UI
│   ├── src/
│   │   └── webui/
│   ├── webui.py
│   └── requirements.txt
│
├── computer_use_ootb/            # Python computer use demo
│   ├── app.py
│   └── requirements.txt
│
├── agency-agents/                # Agent definitions
│   ├── engineering/
│   ├── design/
│   ├── marketing/
│   └── [specialized]/
│
├── data/                         # Runtime data
│   ├── memory/
│   │   ├── vectors/              # ChromaDB
│   │   └── structured.db         # SQLite
│   └── logs/
│
├── dist/                         # Compiled output
├── node_modules/                 # Dependencies
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
└── README.md
```

---

## Verification Summary

### Claims Verified ✅

| # | Claim | Status | Evidence Location |
|---|-------|--------|-------------------|
| 1 | AST is regex-based | ✅ CONFIRMED | `src/code-analysis/codeParser.ts:42` |
| 2 | VSCode hard dependency | ✅ CONFIRMED | `src/computer-use/orchestrator.ts:4-5` |
| 3 | Headless search is linear | ✅ CONFIRMED | `src/research/index.ts:48-78` |
| 4 | Browser uses Playwright | ✅ CONFIRMED | `src/browser/engine.ts:1` |
| 5 | Windows control uses exec | ✅ CONFIRMED | `src/desktop/windowsControl.ts:94-150` |
| 6 | Python has real AST | ✅ CONFIRMED | `Code-Assistant-AI/src/code_parser.py` |
| 7 | Vision system stubbed | ✅ CONFIRMED | `src/vision/screenAnalyzer.ts:104-120` |
| 8 | Learning loop incomplete | ✅ CONFIRMED | `src/computer-use/selfImprovement.ts` |

---

## Recommendations

### Immediate Priorities

1. **Replace regex parser with tree-sitter-wasm**
   - File: `src/code-analysis/codeParser.ts`
   - Package: `web-tree-sitter`
   - Effort: 2-3 days

2. **Interface-out VSCodeController**
   - File: `src/computer-use/orchestrator.ts`
   - Create: `IDEController` interface
   - Effort: 1 day

3. **Add research feedback loop**
   - File: `src/research/index.ts`
   - Add: Result evaluation, query refinement
   - Effort: 2-3 days

4. **Complete vision system**
   - File: `src/vision/screenAnalyzer.ts`
   - Integrate: GPT-4V/Claude Vision APIs
   - Effort: 3-5 days

### Medium-Term

5. **Native desktop bindings**
   - Replace PowerShell exec with `nut.js` or `robotjs`
   - Effort: 1-2 weeks

6. **Error recovery system**
   - Add retry logic, fallback strategies
   - Effort: 1 week

7. **Testing suite**
   - Jest tests for all modules
   - Effort: 2-3 weeks

---

**Document End**
