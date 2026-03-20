# UI Rules - OpenBro247 Frontend & HUD Development Standards

## Overview
This document defines the rules and standards for developing the OpenBro247 user interface, including the Next.js dashboard and Tauri v2 HUD overlay.

---

## 1. Dashboard Architecture Rules

### 1.1 Next.js Standards
- **RULE-UI-001**: App Router MUST be used (not Pages Router)
- **RULE-UI-002**: Server Components MUST be preferred for data fetching
- **RULE-UI-003**: Client Components MUST be marked with 'use client'
- **RULE-UI-004**: Streaming MUST be used for long-running operations
- **RULE-UI-005**: Error boundaries MUST be implemented for all routes

### 1.2 Component Structure
- **RULE-UI-010**: Components MUST be organized by feature, not type
- **RULE-UI-011**: Each component MUST have a single responsibility
- **RULE-UI-012**: Components MUST be composable and reusable
- **RULE-UI-013**: Props MUST be typed with TypeScript interfaces
- **RULE-UI-014**: Components MUST have default exports

### 1.3 State Management
- **RULE-UI-020**: Local state MUST use useState for simple cases
- **RULE-UI-021**: Complex state MUST use useReducer
- **RULE-UI-022**: Global state MUST use React Context or Zustand
- **RULE-UI-023**: Server state MUST use React Query or SWR
- **RULE-UI-024**: Form state MUST use React Hook Form

---

## 2. Tauri v2 HUD Rules

### 2.1 Overlay Window
- **RULE-HUD-001**: HUD MUST be a transparent overlay window
- **RULE-HUD-002**: Window MUST ignore cursor events (click-through)
- **RULE-HUD-003**: Window MUST be always-on-top
- **RULE-HUD-004**: Window MUST support configurable opacity
- **RULE-HUD-005**: Window MUST be resizable and draggable

### 2.2 HUD Components
- **RULE-HUD-010**: HUD MUST display agent status indicators
- **RULE-HUD-011**: HUD MUST show current task progress
- **RULE-HUD-012**: HUD MUST provide quick action buttons
- **RULE-HUD-013**: HUD MUST display notifications
- **RULE-HUD-014**: HUD MUST show memory/skill usage stats

### 2.3 HUD Performance
- **RULE-HUD-020**: HUD MUST use <30MB memory
- **RULE-HUD-021**: HUD MUST render at 60fps
- **RULE-HUD-022**: HUD MUST not block main thread
- **RULE-HUD-023**: HUD MUST update asynchronously
- **RULE-HUD-024**: HUD MUST support hot-reload in development

### 2.4 HUD Integration
- **RULE-HUD-030**: HUD MUST connect to backend via WebSocket
- **RULE-HUD-031**: HUD MUST receive real-time agent updates
- **RULE-HUD-032**: HUD MUST send commands to backend
- **RULE-HUD-033**: HUD MUST persist user preferences
- **RULE-HUD-034**: HUD MUST support multiple monitor setups

---

## 3. Design System Rules

### 3.1 Typography
- **RULE-DESIGN-001**: Font family MUST be Inter or system fonts
- **RULE-DESIGN-002**: Font sizes MUST use rem units
- **RULE-DESIGN-003**: Line heights MUST be 1.5 for body text
- **RULE-DESIGN-004**: Font weights MUST be limited to 400, 500, 600, 700
- **RULE-DESIGN-005**: Text colors MUST meet WCAG AA contrast ratios

### 3.2 Colors
- **RULE-DESIGN-010**: Primary color MUST be #3B82F6 (blue)
- **RULE-DESIGN-011**: Success color MUST be #10B981 (green)
- **RULE-DESIGN-012**: Warning color MUST be #F59E0B (amber)
- **RULE-DESIGN-013**: Error color MUST be #EF4444 (red)
- **RULE-DESIGN-014**: Neutral colors MUST use gray scale

### 3.3 Spacing
- **RULE-DESIGN-020**: Spacing MUST use 4px base unit
- **RULE-DESIGN-021**: Padding MUST be consistent within components
- **RULE-DESIGN-022**: Margins MUST use spacing scale (4, 8, 12, 16, 24, 32, 48)
- **RULE-DESIGN-023**: Gaps in flex/grid MUST use spacing scale
- **RULE-DESIGN-024**: Component spacing MUST be documented

### 3.4 Layout
- **RULE-DESIGN-030**: Grid system MUST be 12-column
- **RULE-DESIGN-031**: Breakpoints MUST be: sm(640), md(768), lg(1024), xl(1280)
- **RULE-DESIGN-032**: Max content width MUST be 1280px
- **RULE-DESIGN-033**: Sidebar width MUST be 280px
- **RULE-DESIGN-034**: Header height MUST be 64px

---

## 4. Component Library Rules

### 4.1 Button Component
- **RULE-COMP-001**: Buttons MUST have variants: primary, secondary, ghost, danger
- **RULE-COMP-002**: Buttons MUST have sizes: sm, md, lg
- **RULE-COMP-003**: Buttons MUST support loading state
- **RULE-COMP-004**: Buttons MUST support disabled state
- **RULE-COMP-005**: Buttons MUST have hover and focus states

### 4.2 Input Component
- **RULE-COMP-010**: Inputs MUST support labels
- **RULE-COMP-011**: Inputs MUST support error messages
- **RULE-COMP-012**: Inputs MUST support helper text
- **RULE-COMP-013**: Inputs MUST support icons
- **RULE-COMP-014**: Inputs MUST support validation

### 4.3 Card Component
- **RULE-COMP-020**: Cards MUST have header, body, footer sections
- **RULE-COMP-021**: Cards MUST support hover effects
- **RULE-COMP-022**: Cards MUST support click actions
- **RULE-COMP-023**: Cards MUST support loading skeleton
- **RULE-COMP-024**: Cards MUST support empty state

### 4.4 Modal Component
- **RULE-COMP-030**: Modals MUST trap focus
- **RULE-COMP-031**: Modals MUST close on escape key
- **RULE-COMP-032**: Modals MUST close on backdrop click
- **RULE-COMP-033**: Modals MUST support different sizes
- **RULE-COMP-034**: Modals MUST prevent body scroll

### 4.5 Table Component
- **RULE-COMP-040**: Tables MUST support sorting
- **RULE-COMP-041**: Tables MUST support filtering
- **RULE-COMP-042**: Tables MUST support pagination
- **RULE-COMP-043**: Tables MUST support row selection
- **RULE-COMP-044**: Tables MUST support column resizing

---

## 5. Dashboard Pages Rules

### 5.1 Agents Page
- **RULE-PAGE-001**: MUST display list of all agents
- **RULE-PAGE-002**: MUST show agent status (active, idle, error)
- **RULE-PAGE-003**: MUST allow creating new agents
- **RULE-PAGE-004**: MUST allow editing agent configuration
- **RULE-PAGE-005**: MUST show agent execution history

### 5.2 Tasks Page
- **RULE-PAGE-010**: MUST display task queue
- **RULE-PAGE-011**: MUST show task status and progress
- **RULE-PAGE-012**: MUST allow creating new tasks
- **RULE-PAGE-013**: MUST show task dependencies
- **RULE-PAGE-014**: MUST allow task cancellation

### 5.3 Skills Page
- **RULE-PAGE-020**: MUST display available skills
- **RULE-PAGE-021**: MUST show skill usage statistics
- **RULE-PAGE-022**: MUST allow skill installation
- **RULE-PAGE-023**: MUST show skill dependencies
- **RULE-PAGE-024**: MUST allow skill configuration

### 5.4 Memory Page
- **RULE-PAGE-030**: MUST display memory statistics
- **RULE-PAGE-031**: MUST allow memory search
- **RULE-PAGE-032**: MUST show memory types breakdown
- **RULE-PAGE-033**: MUST allow memory cleanup
- **RULE-PAGE-034**: MUST show memory usage trends

### 5.5 Settings Page
- **RULE-PAGE-040**: MUST display LLM provider configuration
- **RULE-PAGE-041**: MUST display API key management
- **RULE-PAGE-042**: MUST display agent defaults
- **RULE-PAGE-043**: MUST display notification preferences
- **RULE-PAGE-044**: MUST display system information

---

## 6. Real-Time Updates Rules

### 6.1 WebSocket Integration
- **RULE-RT-001**: Dashboard MUST connect to WebSocket server
- **RULE-RT-002**: Connection MUST auto-reconnect on disconnect
- **RULE-RT-003**: Messages MUST be typed and validated
- **RULE-RT-004**: Updates MUST be optimistic where appropriate
- **RULE-RT-005**: Connection status MUST be displayed

### 6.2 Event Handling
- **RULE-RT-010**: Agent status changes MUST update in real-time
- **RULE-RT-011**: Task progress MUST update in real-time
- **RULE-RT-012**: New messages MUST appear immediately
- **RULE-RT-013**: Errors MUST be displayed immediately
- **RULE-RT-014**: Notifications MUST be shown immediately

### 6.3 Data Synchronization
- **RULE-RT-020**: Local state MUST sync with server state
- **RULE-RT-021**: Conflicts MUST be resolved automatically
- **RULE-RT-022**: Offline changes MUST be queued
- **RULE-RT-023**: Sync status MUST be displayed
- **RULE-RT-024**: Data freshness MUST be indicated

---

## 7. Accessibility Rules

### 7.1 Keyboard Navigation
- **RULE-A11Y-001**: All interactive elements MUST be keyboard accessible
- **RULE-A11Y-002**: Tab order MUST be logical
- **RULE-A11Y-003**: Focus indicators MUST be visible
- **RULE-A11Y-004**: Skip links MUST be provided
- **RULE-A11Y-005**: Keyboard shortcuts MUST be documented

### 7.2 Screen Reader Support
- **RULE-A11Y-010**: All images MUST have alt text
- **RULE-A11Y-011**: Form inputs MUST have labels
- **RULE-A11Y-012**: ARIA labels MUST be used appropriately
- **RULE-A11Y-013**: Live regions MUST announce updates
- **RULE-A11Y-014**: Page titles MUST be descriptive

### 7.3 Visual Accessibility
- **RULE-A11Y-020**: Color contrast MUST meet WCAG AA
- **RULE-A11Y-021**: Text MUST be resizable to 200%
- **RULE-A11Y-022**: Animations MUST be disableable
- **RULE-A11Y-023**: Motion MUST respect prefers-reduced-motion
- **RULE-A11Y-024**: Focus indicators MUST be high contrast

---

## 8. Performance Rules

### 8.1 Loading Performance
- **RULE-PERF-001**: First Contentful Paint MUST be <1.5s
- **RULE-PERF-002**: Largest Contentful Paint MUST be <2.5s
- **RULE-PERF-003**: Time to Interactive MUST be <3.5s
- **RULE-PERF-004**: Cumulative Layout Shift MUST be <0.1
- **RULE-PERF-005**: First Input Delay MUST be <100ms

### 8.2 Runtime Performance
- **RULE-PERF-010**: Components MUST be memoized when appropriate
- **RULE-PERF-011**: Lists MUST use virtualization for large datasets
- **RULE-PERF-012**: Images MUST be lazy loaded
- **RULE-PERF-013**: Code MUST be split by route
- **RULE-PERF-014**: Bundle size MUST be monitored

### 8.3 Caching
- **RULE-PERF-020**: API responses MUST be cached
- **RULE-PERF-021**: Static assets MUST use CDN
- **RULE-PERF-022**: Service worker MUST be implemented
- **RULE-PERF-023**: Cache invalidation MUST be automatic
- **RULE-PERF-024**: Cache size MUST be limited

---

## 9. Testing Rules

### 9.1 Unit Testing
- **RULE-TEST-001**: Components MUST have unit tests
- **RULE-TEST-002**: Hooks MUST have unit tests
- **RULE-TEST-003**: Utilities MUST have unit tests
- **RULE-TEST-004**: Test coverage MUST be >80%
- **RULE-TEST-005**: Tests MUST use React Testing Library

### 9.2 Integration Testing
- **RULE-TEST-010**: Pages MUST have integration tests
- **RULE-TEST-011**: Forms MUST have integration tests
- **RULE-TEST-012**: API calls MUST be mocked
- **RULE-TEST-013**: User interactions MUST be tested
- **RULE-TEST-014**: Error states MUST be tested

### 9.3 E2E Testing
- **RULE-TEST-020**: Critical user flows MUST have E2E tests
- **RULE-TEST-021**: Tests MUST use Playwright
- **RULE-TEST-022**: Tests MUST be runnable in CI/CD
- **RULE-TEST-023**: Tests MUST capture screenshots on failure
- **RULE-TEST-024**: Tests MUST be parallelizable

---

## 10. Documentation Rules

### 10.1 Component Documentation
- **RULE-DOC-001**: Components MUST have Storybook stories
- **RULE-DOC-002**: Props MUST be documented
- **RULE-DOC-003**: Usage examples MUST be provided
- **RULE-DOC-004**: Variants MUST be demonstrated
- **RULE-DOC-005**: Accessibility notes MUST be included

### 10.2 Page Documentation
- **RULE-DOC-010**: Pages MUST have route documentation
- **RULE-DOC-011**: Data requirements MUST be documented
- **RULE-DOC-012**: User flows MUST be documented
- **RULE-DOC-013**: Error handling MUST be documented
- **RULE-DOC-014**: Performance considerations MUST be documented

---

## 11. Security Rules

### 11.1 Authentication
- **RULE-SEC-001**: Auth tokens MUST be stored securely
- **RULE-SEC-002**: Tokens MUST be refreshed automatically
- **RULE-SEC-003**: Logout MUST clear all tokens
- **RULE-SEC-004**: Session timeout MUST be enforced
- **RULE-SEC-005**: Multi-tab logout MUST be synchronized

### 11.2 Data Protection
- **RULE-SEC-010**: Sensitive data MUST NOT be stored in localStorage
- **RULE-SEC-011**: API keys MUST NOT be exposed to client
- **RULE-SEC-012**: XSS prevention MUST be implemented
- **RULE-SEC-013**: CSRF protection MUST be implemented
- **RULE-SEC-014**: Content Security Policy MUST be configured

---

## 12. Internationalization Rules

### 12.1 Text Handling
- **RULE-I18N-001**: All user-facing text MUST be translatable
- **RULE-I18N-002**: Text MUST use i18n keys
- **RULE-I18N-003**: Pluralization MUST be supported
- **RULE-I18N-004**: Date/time formatting MUST be locale-aware
- **RULE-I18N-005**: Number formatting MUST be locale-aware

### 12.2 Layout
- **RULE-I18N-010**: Layout MUST support RTL languages
- **RULE-I18N-011**: Text expansion MUST be accommodated
- **RULE-I18N-012**: Icons MUST be locale-neutral
- **RULE-I18N-013**: Images with text MUST be avoided
- **RULE-I18N-014**: Font support MUST include CJK characters

---

## Enforcement

These rules are enforced through:
1. **ESLint Configuration**: Custom rules for UI standards
2. **TypeScript Compiler**: Strict type checking
3. **Storybook**: Visual component documentation
4. **Playwright**: E2E testing
5. **Lighthouse**: Performance auditing
6. **Code Review**: Manual review against these rules

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-20  
**Status**: Active
