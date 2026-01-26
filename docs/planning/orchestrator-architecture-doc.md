# Multi-Agent Orchestrator - Architecture Reference

## Executive Summary

A system that coordinates multiple Claude Code agents working simultaneously on different parts of a project (backend, frontend, mobile, etc.). A central Node.js orchestrator manages processes, routes messages, handles approvals, and provides a web UI for interacting with a Planning Agent.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 USER                                        │
│                          (via Web UI at :3456)                              │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  │ Chat, Approve, Monitor
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NODE.JS ORCHESTRATOR                              │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │   Web UI    │ │  Planning   │ │   Process   │ │   Event & Message   │   │
│  │   Server    │ │   Agent     │ │   Manager   │ │      System         │   │
│  │             │ │   Manager   │ │             │ │                     │   │
│  │ Express     │ │             │ │ Spawn/Kill  │ │ Watch Outboxes      │   │
│  │ Socket.io   │ │ Chat Relay  │ │ Monitor     │ │ Route Messages      │   │
│  │ React App   │ │ E2E Prompts │ │ Restart     │ │ Track Status        │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘   │
│                                                                             │
└───────┬─────────────────┬─────────────────┬─────────────────┬───────────────┘
        │                 │                 │                 │
        │ Spawns &        │ Spawns &        │ Spawns &        │ Spawns &
        │ Monitors        │ Monitors        │ Monitors        │ Monitors
        ▼                 ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Planning    │ │    Backend    │ │   Frontend    │ │    Mobile     │
│    Agent      │ │    Agent      │ │    Agent      │ │    Agent      │
│               │ │               │ │               │ │               │
│ Claude Code   │ │ Claude Code   │ │ Claude Code   │ │ Claude Code   │
│ + Skills      │ │ + Dev Server  │ │ + Dev Server  │ │ + Dev Server  │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
        │                 │                 │                 │
        │                 ▼                 ▼                 ▼
        │         ┌─────────────────────────────────────────────┐
        │         │              PROJECT FILES                  │
        │         │    Each project has .orchestrator/ dir      │
        └────────►│    with session state, hooks, logs          │
                  └─────────────────────────────────────────────┘
```

---

## 2. Core Concepts

### 2.1 Sessions

A **session** represents one orchestration run for a feature.

```
Session {
  id: "abc123"              // Unique identifier
  feature: "Add OAuth"      // What we're building
  projects: [backend, frontend]  // Involved projects
  plan: Plan                // Approved execution plan
  startedAt: timestamp
}
```

**Lifecycle:**
```
User describes feature
       │
       ▼
Planning Phase (chat with Planning Agent)
       │
       ▼
Plan Approved
       │
       ▼
Session Created (dirs initialized in each project)
       │
       ▼
Execution Phase (agents work, user monitors)
       │
       ▼
All Tests Pass
       │
       ▼
Session Complete
```

### 2.2 Projects

Each managed project has:

```
~/Documents/backend/
├── .claude/
│   └── skills/
│       ├── development.md    # How to develop here
│       └── e2e-testing.md    # How to run E2E tests
├── .orchestrator/
│   └── session_abc123/       # Runtime state (per session)
│       ├── status.json       # Current status
│       ├── inbox.txt         # Messages FROM orchestrator
│       ├── outbox/           # Events TO orchestrator
│       ├── logs/             # Agent and server logs
│       └── hooks/            # Shell scripts for communication
└── src/                      # Project source code
```

### 2.3 Communication Model

**Unidirectional flows:**

```
Agent → Hook → Outbox File → Orchestrator    (Events UP)
Orchestrator → Inbox File → Agent            (Commands DOWN)
Dev Server → Stdout/Stderr → Orchestrator    (Logs UP)
```

**Why hooks?**
- Agents don't write JSON manually (error-prone)
- Standardized message formats
- Easy to extend with new event types
- Shell scripts are simple and universal

---

## 3. Component Deep Dives

### 3.1 Session Manager

**Purpose:** Create and manage orchestration sessions

**Pseudocode:**
```
function createSession(feature, projects):
    id = generateUUID()
    
    for each project in projects:
        projectPath = getProjectPath(project)
        sessionDir = projectPath/.orchestrator/session_{id}/
        
        // Create directories
        mkdir sessionDir/outbox
        mkdir sessionDir/logs
        mkdir sessionDir/hooks
        
        // Deploy hooks (copy from orchestrator/hooks/)
        copyHooks(orchestratorDir/hooks, sessionDir/hooks)
        makeExecutable(sessionDir/hooks/*)
        
        // Initialize state files
        write sessionDir/status.json = {status: "IDLE"}
        write sessionDir/inbox.txt = ""
        write sessionDir/metadata.json = {session_id, project, feature}
    
    // Register globally
    write /tmp/orchestrator/sessions/active.json = session
    
    return session
```

**Key decisions:**
- Session state lives IN each project (not centralized)
- Hooks are copied fresh each session (ensures latest version)
- Global registry is minimal (just active session pointer)

### 3.2 Process Manager

**Purpose:** Spawn, monitor, and manage child processes

**Process types:**
1. **Dev Servers** - Long-running (npm run dev)
2. **Agents** - Claude Code instances with tasks

**Pseudocode:**
```
function startDevServer(project):
    config = getProjectConfig(project)
    
    process = spawn(config.devServer.command, {
        cwd: config.path,
        env: config.devServer.env
    })
    
    process.stdout.on('data', (text) => {
        emit('log', {project, type: 'devServer', text})
        
        // Check for ready signal
        if (text matches config.devServer.readyPattern):
            markReady(project)
    })
    
    process.on('exit', (code) => {
        uptime = now() - startTime
        
        if (uptime < 10 seconds):
            handleQuickCrash(project, code)  // Config error
        else:
            handleNormalCrash(project, code)  // Runtime error
    })
    
    // Timeout if never ready
    setTimeout(() => {
        if not ready:
            emit('error', 'Dev server failed to start')
    }, 60 seconds)


function handleQuickCrash(project, code):
    crashCount[project]++
    
    if (crashCount[project] < 3):
        delay = backoff(crashCount)  // 1s, 5s, 15s
        wait(delay)
        startDevServer(project)  // Auto-retry
    else:
        // Too many crashes, need human/agent help
        setStatus(project, 'FATAL_DEBUGGING')
        sendToAgent(project, "Process crashed 3 times. Please investigate.")


function handleNormalCrash(project, code):
    // Runtime crash - agent should fix
    setStatus(project, 'FATAL_DEBUGGING')
    context = getLast200LogLines(project)
    sendToAgent(project, "Process crashed. Context: {context}")
```

### 3.3 Event Watcher

**Purpose:** Watch outbox directories for agent events

**Pseudocode:**
```
function watchProject(project, sessionDir):
    outboxDir = sessionDir/outbox/
    
    fs.watch(outboxDir, (event, filename) => {
        if (event == 'rename' and filename ends with '.json'):
            // Small delay to ensure file is fully written
            wait(50ms)
            
            content = readFile(outboxDir/filename)
            event = parseJSON(content)
            
            routeEvent(event)
            
            deleteFile(outboxDir/filename)  // Processed
    })


function routeEvent(event):
    switch (event.type):
        case 'status_update':
            statusMonitor.update(event.project, event.status, event.message)
            
        case 'message':
            messageRouter.send(event.to, event.message, from=event.from)
            
        case 'approval_request':
            approvalQueue.add(event)
            
        case 'task_complete':
            handleTaskComplete(event.project, event.summary)
            
        case 'restart_request':
            processManager.restart(event.project)
            
        case 'error_report':
            handleErrorReport(event)
```

### 3.4 Message Router

**Purpose:** Deliver messages between agents and orchestrator

**Pseudocode:**
```
function sendToAgent(project, message, from='Orchestrator', type='message'):
    sessionDir = getSessionDir(project)
    inboxPath = sessionDir/inbox.txt
    
    formatted = """
    ─────────────────────────────────
    FROM: {from}
    TIME: {timestamp}
    TYPE: {type}
    
    {message}
    ─────────────────────────────────
    """
    
    appendToFile(inboxPath, formatted)


function broadcast(message):
    for each project in session.projects:
        sendToAgent(project, message)
```

**Inbox format rationale:**
- Plain text (agents can easily read)
- Clear separators (easy to parse)
- Append-only (no race conditions)
- Human-readable (easy to debug)

### 3.5 Status Monitor

**Purpose:** Track agent states and trigger transitions

**States:**
```
IDLE            → Not working
WORKING         → Executing task
DEBUGGING       → Fixing runtime error
FATAL_DEBUGGING → Fixing crash
FATAL_RECOVERY  → Ready for restart after crash fix
READY           → Task done, awaiting E2E
E2E             → Running E2E tests
BLOCKED         → Waiting on dependency
```

**State machine:**
```
        ┌──────────────────────────────────────────────┐
        ▼                                              │
┌──────┐    task     ┌─────────┐    complete    ┌─────┐
│ IDLE │───────────►│ WORKING │───────────────►│READY│
└──────┘            └────┬────┘                └──┬──┘
   ▲                     │                        │
   │                     │ error                  │ E2E prompt sent
   │                     ▼                        ▼
   │               ┌───────────┐             ┌─────┐
   │               │ DEBUGGING │             │ E2E │
   │               └─────┬─────┘             └──┬──┘
   │                     │ fixed                │
   │                     └──────────────────────┤
   │                                            │
   │              tests pass                    │ tests fail
   └────────────────────────────────────────────┴──► DEBUGGING
```

**Pseudocode:**
```
function updateStatus(project, newStatus, message):
    oldStatus = states[project].status
    states[project] = {status: newStatus, message, updatedAt: now()}
    
    emit('statusChange', {project, oldStatus, newStatus})
    
    // Trigger special actions
    if (newStatus == 'READY'):
        triggerE2EFlow(project)
    
    if (newStatus == 'FATAL_RECOVERY'):
        processManager.restart(project)
    
    // Check global conditions
    if (allProjectsIn('IDLE')):
        emit('allComplete')  // Feature done!


function triggerE2EFlow(project):
    if (projectHasE2E(project)):
        // Ask Planning Agent to generate E2E prompt
        sendToPlanningAgent("""
            Project {project} is READY.
            Generate E2E test prompt based on:
            - Completed task: {task}
            - Test scenarios: {testPlan[project]}
            - E2E skill: {project}/.claude/skills/e2e-testing.md
        """)
```

### 3.6 Approval Queue

**Purpose:** Serialize user approvals (one at a time)

**Why serialize?**
- Multiple simultaneous prompts confuse users
- Need clear context for each decision
- Prevents race conditions

**Pseudocode:**
```
queue = []
processing = false

function addRequest(request):
    queue.push(request)
    
    if (not processing):
        processNext()


function processNext():
    if (queue is empty):
        processing = false
        return
    
    processing = true
    request = queue.shift()
    
    // Show to user (via UI or terminal)
    displayPrompt(request)
    
    // Wait for response
    response = await getUserInput()  // y/n
    
    // Write response for hook to read
    write /tmp/orchestrator/approval_queue/responses/{request.id}.json = {
        approved: response == 'y',
        timestamp: now()
    }
    
    emit('responded', {request, approved})
    
    processNext()  // Continue with queue
```

### 3.7 Planning Agent Manager

**Purpose:** Manage the Planning Agent and relay chat

**Pseudocode:**
```
function startPlanningAgent():
    // Planning Agent is a Claude Code instance
    // with the planning skill always active
    
    agent = spawn('claude', {
        cwd: orchestratorDir,
        args: ['--dangerously-skip-permissions']
    })
    
    agent.stdout.on('data', (text) => {
        // Parse for structured outputs
        if (text contains plan JSON):
            handlePlanProposal(extractPlan(text))
        else:
            // Regular chat response
            emit('chatResponse', text)
    })


function sendChatMessage(userMessage):
    // Write to Planning Agent's inbox
    write planningAgentInbox = """
        FROM: User
        TYPE: chat
        
        {userMessage}
    """


function requestE2EPrompt(project, taskSummary, testScenarios):
    write planningAgentInbox = """
        FROM: Orchestrator
        TYPE: e2e_request
        
        Project {project} is READY.
        Task completed: {taskSummary}
        Test scenarios: {testScenarios}
        
        Generate E2E test prompt using their e2e-testing.md skill.
    """
```

---

## 4. Hook System

### 4.1 Available Hooks

| Hook | Purpose | Arguments |
|------|---------|-----------|
| `on_status_change.sh` | Report status change | status, message |
| `on_complete.sh` | Task finished | summary |
| `on_error.sh` | Report error | error, severity |
| `send_message.sh` | Message another agent | target, message |
| `on_question.sh` | Request approval | prompt, type |
| `request_restart.sh` | Request dev server restart | reason |

### 4.2 Hook Implementation Pattern

```bash
#!/bin/bash
# Generic hook structure

# 1. Parse arguments
ARG1="$1"
ARG2="$2"

# 2. Generate metadata
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT=$(basename "$(dirname "$(dirname "$SESSION_DIR")")")

# 3. Validate inputs
if [ -z "$ARG1" ]; then
    echo "Error: Missing required argument" >&2
    exit 1
fi

# 4. Write to outbox (event to orchestrator)
cat > "$SESSION_DIR/outbox/eventtype_$TIMESTAMP.json" <<EOF
{
  "type": "event_type",
  "project": "$PROJECT",
  "data": "$ARG1",
  "timestamp": $TIMESTAMP
}
EOF

# 5. Optionally update local state
cat > "$SESSION_DIR/status.json" <<EOF
{...}
EOF

# 6. Exit with appropriate code
exit 0
```

### 4.3 Approval Hook (Special Case)

The approval hook **blocks** until response:

```bash
#!/bin/bash
# on_question.sh - blocks until approved/rejected

# ... write to outbox ...

# Wait for response file
RESPONSE_FILE="/tmp/orchestrator/approval_queue/responses/$REQUEST_ID.json"

while [ ! -f "$RESPONSE_FILE" ]; do
    sleep 1
done

# Parse response
APPROVED=$(grep -o '"approved":[^,}]*' "$RESPONSE_FILE" | cut -d: -f2)

if [ "$APPROVED" = "true" ]; then
    exit 0  # Approved
else
    exit 1  # Rejected
fi
```

---

## 5. Skill System

### 5.1 Planning Skill

Location: `orchestrator/.claude/skills/planning.md`

**Responsibilities:**
1. Read project configs to understand system
2. Chat with user to refine requirements
3. Create structured plans
4. Generate E2E prompts when projects are ready
5. Coordinate between agents
6. Analyze test failures

**Key sections:**
```markdown
# Reading Project Config
cat projects.config.json

# Creating Plans
{
  "feature": "...",
  "tasks": [{project, task, dependencies}],
  "testPlan": {project: [scenarios]}
}

# Generating E2E Prompts
1. Read project's e2e-testing.md
2. Combine with test scenarios
3. Send via hook
```

### 5.2 Project Development Skill

Location: `{project}/.claude/skills/development.md`

**Contains:**
- Project structure overview
- Tech stack details
- Development conventions
- Common commands
- Testing approach

### 5.3 Project E2E Skill

Location: `{project}/.claude/skills/e2e-testing.md`

**Contains:**
- Test framework (Playwright, Cypress, etc.)
- How to run tests
- How to write tests
- How to report results
- Example test structure

---

## 6. Web UI Architecture

### 6.1 Technology Stack

```
Backend:  Express + Socket.io
Frontend: React + Tailwind
Protocol: WebSocket for real-time, REST for actions
```

### 6.2 UI Phases

**Phase 1: Planning**
```
┌────────────────────────────────────────────────────┐
│ Chat with Planning Agent                           │
│                                                    │
│ User: Add OAuth with Google and GitHub             │
│                                                    │
│ Planning Agent: I'll break this into tasks...      │
│   Backend: Set up passport.js...                   │
│   Frontend: Add login buttons...                   │
│                                                    │
│ [Send]                          [Approve Plan ✓]  │
└────────────────────────────────────────────────────┘
```

**Phase 2: Execution**
```
┌─────────────────────────────────────────────────────┐
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│ │ Backend  │ │ Frontend │ │  Mobile  │ │   E2E   │ │
│ │ WORKING  │ │ BLOCKED  │ │   IDLE   │ │  IDLE   │ │
│ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ LOGS [Backend ▼]                                ││
│ │ 14:32:01 Installing passport...                 ││
│ │ 14:32:05 Creating auth routes...                ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ ⚠️ APPROVAL: Install bcrypt?  [Yes] [No]        ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 6.3 WebSocket Events

**Server → Client:**
```typescript
// Status updates
socket.emit('status', {project, status, message})

// Log lines
socket.emit('log', {project, type, stream, text, timestamp})

// Chat from Planning Agent
socket.emit('chat', {from: 'planning', message})

// Approval needed
socket.emit('approval', {id, project, prompt})

// Session created
socket.emit('sessionCreated', {id, feature, projects})
```

**Client → Server:**
```typescript
// User chat message
socket.emit('chat', {message})

// Start new session
socket.emit('startSession', {feature, projects})

// Approve plan and start execution
socket.emit('startExecution', {plan})

// Respond to approval
socket.emit('approve', {id, approved: true/false})
```

---

## 7. Complete Flow Example

### 7.1 User Adds OAuth Feature

```
1. USER opens http://localhost:3456
   
2. USER types: "Add OAuth login with Google"

3. ORCHESTRATOR routes to Planning Agent

4. PLANNING AGENT:
   - Reads projects.config.json
   - Analyzes requirements
   - Responds with plan proposal

5. USER refines through chat

6. USER clicks "Approve Plan"

7. ORCHESTRATOR:
   - Creates session (abc123)
   - Creates .orchestrator/session_abc123/ in each project
   - Deploys hooks
   - Starts dev servers
   - Waits for ready signals

8. ORCHESTRATOR starts agents:
   - Backend agent with task from plan
   - Frontend agent with task from plan

9. BACKEND AGENT:
   - Calls on_status_change.sh "WORKING" "Starting OAuth"
   - Implements passport.js
   - Calls on_question.sh "Install bcrypt?" "approval"
   - (blocks waiting)

10. ORCHESTRATOR:
    - Detects approval request
    - Shows in UI
    - USER approves

11. BACKEND AGENT:
    - Continues implementation
    - Calls on_complete.sh "OAuth endpoints done"
    - Status → READY

12. ORCHESTRATOR:
    - Detects READY status
    - Asks Planning Agent for E2E prompt

13. PLANNING AGENT:
    - Reads backend's e2e-testing.md
    - Generates specific E2E prompt
    - Sends via hook

14. ORCHESTRATOR:
    - Sends E2E prompt to backend agent
    - Status → E2E

15. BACKEND AGENT:
    - Runs Playwright tests
    - Tests pass
    - Calls on_status_change.sh "IDLE" "E2E passed"

16. Meanwhile FRONTEND completes same flow

17. ORCHESTRATOR detects all IDLE → Feature complete! 🎉
```

---

## 8. Error Handling

### 8.1 Dev Server Crash

```
Dev server exits with code 1
         │
         ▼
    Check uptime
         │
    ┌────┴────┐
    │         │
  < 10s    >= 10s
    │         │
    ▼         ▼
Quick      Normal
Crash      Crash
    │         │
    ▼         ▼
Auto-     Send to
retry     agent
(max 3)   for fix
    │         │
    ▼         ▼
Still     Agent
fails?    fixes
    │         │
    ▼         ▼
Send to   Reports
agent     FATAL_RECOVERY
    │         │
    └────┬────┘
         │
         ▼
    Restart dev server
```

### 8.2 Agent Error

```
Agent encounters error
         │
         ▼
Agent calls on_error.sh
         │
         ▼
Orchestrator receives
         │
         ▼
    Check severity
         │
    ┌────┴────┐
    │         │
 low/med    high/
    │      critical
    │         │
    ▼         ▼
Log only  Alert user
          in UI
```

### 8.3 E2E Test Failure

```
E2E tests fail
         │
         ▼
Agent reports DEBUGGING
         │
         ▼
Orchestrator notifies
Planning Agent
         │
         ▼
Planning Agent analyzes
         │
         ▼
Sends guidance to
project agent
         │
         ▼
Agent fixes and
reports READY
         │
         ▼
E2E flow restarts
```

---

## 9. Configuration Reference

### 9.1 projects.config.json

```json
{
  "projects": {
    "backend": {
      "path": "~/Documents/backend",
      "devServer": {
        "command": "npm run dev",
        "readyPattern": "listening on.*:3000",
        "env": {"NODE_ENV": "development"}
      },
      "hasE2E": true
    }
  },
  "defaults": {
    "approvalTimeout": 300000,
    "maxRestarts": 3,
    "debugEscalationTime": 120000
  }
}
```

### 9.2 Session Metadata

```json
{
  "session_id": "abc123",
  "project": "backend",
  "started_at": 1705934823000,
  "feature": "Add OAuth authentication",
  "orchestrator_pid": 12345
}
```

### 9.3 Status File

```json
{
  "status": "WORKING",
  "message": "Implementing OAuth endpoints",
  "updated_at": 1705934900000
}
```

---

## 10. Security Considerations

1. **Process Isolation**: Each agent runs in its own project directory
2. **Approval Gates**: Sensitive operations require user approval
3. **No Shared Secrets**: Env vars stay with their projects
4. **Session Cleanup**: Old sessions can be purged
5. **Read-Only Config**: Agents can't modify orchestrator config

---

## 11. Extensibility Points

1. **New Hooks**: Add new shell scripts for new event types
2. **New Projects**: Add to projects.config.json
3. **Custom Skills**: Add .claude/skills/*.md to any project
4. **UI Plugins**: Socket.io allows new event types
5. **Process Types**: ProcessManager can spawn other processes

---

## 12. Troubleshooting

### Common Issues

**Agent not receiving messages:**
- Check inbox.txt exists and is writable
- Verify agent is checking inbox periodically

**Hooks not working:**
- Check executable permissions (chmod +x)
- Verify session directory path

**Dev server won't start:**
- Check readyPattern matches actual output
- Verify command works manually

**Status not updating:**
- Check outbox/ directory exists
- Verify orchestrator is watching

### Debug Commands

```bash
# Check session state
cat ~/Documents/backend/.orchestrator/session_*/status.json

# View inbox
cat ~/Documents/backend/.orchestrator/session_*/inbox.txt

# List outbox (should be empty if processing)
ls ~/Documents/backend/.orchestrator/session_*/outbox/

# Check active session
cat /tmp/orchestrator/sessions/active.json

# View logs
tail -f ~/Documents/backend/.orchestrator/session_*/logs/*.log
```
