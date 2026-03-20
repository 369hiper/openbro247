# Engine Rules - OpenBro247 Core Development Standards

## Overview
This document defines the rules and standards for developing the OpenBro247 engine core, including agent runtime, skill execution, LLM integration, and orchestration systems.

---

## 1. Agent Runtime Rules

### 1.1 ReAct Loop Implementation
- **RULE-AGENT-001**: Every agent MUST implement the ReAct (Reason-Action-Observation) loop
- **RULE-AGENT-002**: The loop MUST support configurable max iterations (default: 20)
- **RULE-AGENT-003**: Each iteration MUST log reasoning, action, and observation
- **RULE-AGENT-004**: The loop MUST support early termination on goal completion
- **RULE-AGENT-005**: Error recovery MUST be attempted before loop termination

### 1.2 Agent State Management
- **RULE-AGENT-010**: Agent state MUST be serializable to JSON
- **RULE-AGENT-011**: State MUST include: goal, context, history, memory references
- **RULE-AGENT-012**: State MUST support checkpointing at configurable intervals
- **RULE-AGENT-013**: State MUST be recoverable from checkpoints
- **RULE-AGENT-014**: State transitions MUST be atomic

### 1.3 Agent Communication
- **RULE-AGENT-020**: Inter-agent messages MUST use typed message protocol
- **RULE-AGENT-021**: Messages MUST include: sender, recipient, type, payload, timestamp
- **RULE-AGENT-022**: Message delivery MUST be guaranteed (at-least-once)
- **RULE-AGENT-023**: Agents MUST handle message timeouts gracefully
- **RULE-AGENT-024**: Shared state MUST use blackboard pattern with locks

### 1.4 Agent Types
- **RULE-AGENT-030**: Supervisor agents MUST NOT execute tools directly
- **RULE-AGENT-031**: Worker agents MUST report status to supervisor
- **RULE-AGENT-032**: Critic agents MUST provide structured feedback
- **RULE-AGENT-033**: Memory agents MUST handle knowledge retrieval
- **RULE-AGENT-034**: Tool agents MUST validate inputs before execution

---

## 2. Skill Execution Engine Rules

### 2.1 Skill Definition
- **RULE-SKILL-001**: Skills MUST be defined in SKILL.md format
- **RULE-SKILL-002**: Skill definitions MUST include: name, description, tools, examples
- **RULE-SKILL-003**: Skills MUST declare dependencies explicitly
- **RULE-SKILL-004**: Skills MUST specify input/output schemas
- **RULE-SKILL-005**: Skills MUST include error handling strategies

### 2.2 Skill Loading
- **RULE-SKILL-010**: Skills MUST be loaded from filesystem at runtime
- **RULE-SKILL-011**: Skill loading MUST support hot-reload
- **RULE-SKILL-012**: Skill versions MUST be tracked and managed
- **RULE-SKILL-013**: Skill dependencies MUST be resolved before execution
- **RULE-SKILL-014**: Invalid skills MUST be logged and skipped

### 2.3 Skill Execution
- **RULE-SKILL-020**: Skill execution MUST be sandboxed
- **RULE-SKILL-021**: Skills MUST have configurable timeouts
- **RULE-SKILL-022**: Skill execution MUST be interruptible
- **RULE-SKILL-023**: Skill results MUST be validated against output schema
- **RULE-SKILL-024**: Skill failures MUST provide detailed error context

### 2.4 Skill Learning
- **RULE-SKILL-030**: Successful executions MUST be recorded for learning
- **RULE-SKILL-031**: Failed executions MUST be analyzed for improvement
- **RULE-SKILL-032**: Skill metrics MUST be tracked (success rate, duration)
- **RULE-SKILL-033**: Skills MUST support feedback incorporation
- **RULE-SKILL-034**: Learned improvements MUST be versioned

---

## 3. LLM Integration Rules

### 3.1 Tool Calling
- **RULE-LLM-001**: LLM Manager MUST support native tool calling for all providers
- **RULE-LLM-002**: Tool definitions MUST follow provider-specific schemas
- **RULE-LLM-003**: Tool results MUST be injected back into conversation
- **RULE-LLM-004**: Parallel tool calls MUST be supported
- **RULE-LLM-005**: Tool call errors MUST be handled with retry logic

### 3.2 Provider Management
- **RULE-LLM-010**: Provider failover MUST be automatic
- **RULE-LLM-011**: Provider health MUST be monitored
- **RULE-LLM-012**: Rate limits MUST be respected per provider
- **RULE-LLM-013**: Provider-specific features MUST be abstracted
- **RULE-LLM-014**: Cost tracking MUST be per-provider

### 3.3 Vision Integration
- **RULE-LLM-020**: Vision models MUST be used for screen understanding
- **RULE-LLM-021**: Screenshots MUST be optimized before sending to vision models
- **RULE-LLM-022**: Vision results MUST include confidence scores
- **RULE-LLM-023**: Element coordinates MUST be mapped to screen space
- **RULE-LLM-024**: Vision failures MUST fallback to DOM-based methods

### 3.4 Conversation Management
- **RULE-LLM-030**: Conversation history MUST be managed within context limits
- **RULE-LLM-031**: System prompts MUST be configurable per agent type
- **RULE-LLM-032**: Token usage MUST be tracked and optimized
- **RULE-LLM-033**: Conversation state MUST be persistable
- **RULE-LLM-034**: Multi-turn conversations MUST maintain context

---

## 4. Orchestration Rules

### 4.1 Task Management
- **RULE-ORCH-001**: Tasks MUST be represented as directed acyclic graphs
- **RULE-ORCH-002**: Task dependencies MUST be resolved before execution
- **RULE-ORCH-003**: Tasks MUST support priority levels (critical, high, medium, low)
- **RULE-ORCH-004**: Task timeouts MUST be configurable
- **RULE-ORCH-005**: Task cancellation MUST propagate to dependencies

### 4.2 Multi-Agent Coordination
- **RULE-ORCH-010**: Agent spawning MUST be controlled by supervisor
- **RULE-ORCH-011**: Agent pool size MUST be configurable
- **RULE-ORCH-012**: Agent load MUST be balanced across workers
- **RULE-ORCH-013**: Agent failures MUST trigger supervisor notification
- **RULE-ORCH-014**: Agent resources MUST be cleaned up on termination

### 4.3 Workflow Patterns
- **RULE-ORCH-020**: Sequential patterns MUST execute tasks in order
- **RULE-ORCH-021**: Parallel patterns MUST execute tasks concurrently
- **RULE-ORCH-022**: Map-Reduce patterns MUST handle partial failures
- **RULE-ORCH-023**: Supervisor-Worker patterns MUST support dynamic scaling
- **RULE-ORCH-024**: Reflection patterns MUST support iterative improvement

### 4.4 Error Handling
- **RULE-ORCH-030**: Task failures MUST trigger retry with exponential backoff
- **RULE-ORCH-031**: Critical failures MUST halt dependent tasks
- **RULE-ORCH-032**: Error context MUST be preserved for debugging
- **RULE-ORCH-033**: Recovery strategies MUST be configurable per task type
- **RULE-ORCH-034**: Error metrics MUST be tracked and alerted

---

## 5. Memory System Rules

### 5.1 Memory Types
- **RULE-MEMORY-001**: Episodic memory MUST store time-ordered events
- **RULE-MEMORY-002**: Semantic memory MUST store factual knowledge
- **RULE-MEMORY-003**: Procedural memory MUST store skills and procedures
- **RULE-MEMORY-004**: Working memory MUST store short-term context
- **RULE-MEMORY-005**: Memory types MUST be clearly separated

### 5.2 Memory Operations
- **RULE-MEMORY-010**: Memory storage MUST be atomic
- **RULE-MEMORY-011**: Memory retrieval MUST support similarity search
- **RULE-MEMORY-012**: Memory updates MUST be versioned
- **RULE-MEMORY-013**: Memory deletion MUST be soft-delete with retention
- **RULE-MEMORY-014**: Memory queries MUST be optimized

### 5.3 Memory Consolidation
- **RULE-MEMORY-020**: Related memories MUST be linked
- **RULE-MEMORY-021**: Memory importance MUST be scored
- **RULE-MEMORY-022**: Low-importance memories MUST be archived
- **RULE-MEMORY-023**: Memory summaries MUST be generated for long histories
- **RULE-MEMORY-024**: Memory consistency MUST be maintained

---

## 6. Security Rules

### 6.1 Authentication
- **RULE-SEC-001**: All API endpoints MUST require authentication
- **RULE-SEC-002**: Device identity MUST use Ed25519 keys
- **RULE-SEC-003**: Tokens MUST have configurable expiration
- **RULE-SEC-004**: Token refresh MUST be supported
- **RULE-SEC-005**: Failed authentication MUST be logged

### 6.2 Authorization
- **RULE-SEC-010**: Role-based access control MUST be implemented
- **RULE-SEC-011**: Permissions MUST be scoped to resources
- **RULE-SEC-012**: Permission checks MUST be enforced at API layer
- **RULE-SEC-013**: Admin operations MUST require elevated permissions
- **RULE-SEC-014**: Audit logs MUST record all permission changes

### 6.3 Sandboxing
- **RULE-SEC-020**: Code execution MUST be sandboxed
- **RULE-SEC-021**: File system access MUST be restricted
- **RULE-SEC-022**: Network access MUST be controlled
- **RULE-SEC-023**: Resource usage MUST be limited
- **RULE-SEC-024**: Sandbox escapes MUST be prevented

---

## 7. Performance Rules

### 7.1 Response Time
- **RULE-PERF-001**: Simple queries MUST respond within 2 seconds
- **RULE-PERF-002**: Complex tasks MUST provide progress updates
- **RULE-PERF-003**: Long-running operations MUST be async
- **RULE-PERF-004**: Timeouts MUST be enforced for all operations
- **RULE-PERF-005**: Performance metrics MUST be collected

### 7.2 Resource Usage
- **RULE-PERF-010**: Memory usage MUST be monitored per session
- **RULE-PERF-011**: CPU usage MUST be limited per agent
- **RULE-PERF-012**: Database connections MUST be pooled
- **RULE-PERF-013**: API calls MUST be cached when appropriate
- **RULE-PERF-014**: Resource leaks MUST be detected and reported

### 7.3 Scalability
- **RULE-PERF-020**: Horizontal scaling MUST be supported
- **RULE-PERF-021**: Load balancing MUST be automatic
- **RULE-PERF-022**: Session state MUST be externalized
- **RULE-PERF-023**: Bottlenecks MUST be identified and addressed
- **RULE-PERF-024**: Capacity planning MUST be documented

---

## 8. Testing Rules

### 8.1 Unit Testing
- **RULE-TEST-001**: All public APIs MUST have unit tests
- **RULE-TEST-002**: Test coverage MUST be >80%
- **RULE-TEST-003**: Tests MUST be isolated and independent
- **RULE-TEST-004**: Tests MUST use mocks for external dependencies
- **RULE-TEST-005**: Tests MUST be deterministic

### 8.2 Integration Testing
- **RULE-TEST-010**: Critical paths MUST have integration tests
- **RULE-TEST-011**: Integration tests MUST use test databases
- **RULE-TEST-012**: Integration tests MUST clean up after themselves
- **RULE-TEST-013**: Integration tests MUST be runnable in CI/CD
- **RULE-TEST-014**: Integration tests MUST cover error scenarios

### 8.3 End-to-End Testing
- **RULE-TEST-020**: User workflows MUST have E2E tests
- **RULE-TEST-021**: E2E tests MUST use real browser automation
- **RULE-TEST-022**: E2E tests MUST be runnable in headless mode
- **RULE-TEST-023**: E2E tests MUST capture screenshots on failure
- **RULE-TEST-024**: E2E tests MUST be parallelizable

---

## 9. Documentation Rules

### 9.1 Code Documentation
- **RULE-DOC-001**: All public APIs MUST have JSDoc comments
- **RULE-DOC-002**: Complex algorithms MUST have inline explanations
- **RULE-DOC-003**: Type definitions MUST have descriptions
- **RULE-DOC-004**: Examples MUST be provided for common use cases
- **RULE-DOC-005**: Documentation MUST be kept in sync with code

### 9.2 Architecture Documentation
- **RULE-DOC-010**: System architecture MUST be documented
- **RULE-DOC-011**: Data flow MUST be documented
- **RULE-DOC-012**: API contracts MUST be documented
- **RULE-DOC-013**: Deployment procedures MUST be documented
- **RULE-DOC-014**: Troubleshooting guides MUST be maintained

---

## 10. Code Quality Rules

### 10.1 TypeScript Standards
- **RULE-QUAL-001**: Strict mode MUST be enabled
- **RULE-QUAL-002**: Any type MUST be avoided
- **RULE-QUAL-003**: Interfaces MUST be preferred over type aliases
- **RULE-QUAL-004**: Enums MUST be used for fixed sets of values
- **RULE-QUAL-005**: Generic types MUST be used for reusable components

### 10.2 Error Handling
- **RULE-QUAL-010**: All errors MUST be typed
- **RULE-QUAL-011**: Error messages MUST be descriptive
- **RULE-QUAL-012**: Stack traces MUST be preserved
- **RULE-QUAL-013**: Errors MUST be logged with context
- **RULE-QUAL-014**: User-facing errors MUST be sanitized

### 10.3 Logging
- **RULE-QUAL-020**: Structured logging MUST be used
- **RULE-QUAL-021**: Log levels MUST be appropriate (debug, info, warn, error)
- **RULE-QUAL-022**: Sensitive data MUST NOT be logged
- **RULE-QUAL-023**: Log correlation IDs MUST be used for tracing
- **RULE-QUAL-024**: Logs MUST be aggregated for analysis

---

## Enforcement

These rules are enforced through:
1. **ESLint Configuration**: Automated linting with custom rules
2. **TypeScript Compiler**: Strict type checking
3. **Code Review**: Manual review against these rules
4. **CI/CD Pipeline**: Automated checks in build process
5. **Documentation**: Living documentation updated with changes

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-20  
**Status**: Active
