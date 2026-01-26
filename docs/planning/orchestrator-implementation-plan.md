# Multi-Agent Orchestrator - Implementation Plan

## Overview

Build a Node.js orchestrator that coordinates multiple Claude Code agents working on different projects simultaneously. Includes a web UI for chatting with a Planning Agent, monitoring progress, and handling approvals.

## Directory Structure to Create

```
~/Documents/orchestrator/
├── .claude/
│   └── skills/
│       └── planning.md
├── projects.config.json
├── hooks/
│   ├── on_status_change.sh
│   ├── on_complete.sh
│   ├── on_error.sh
│   ├── send_message.sh
│   ├── on_question.sh
│   └── request_restart.sh
├── src/
│   ├── index.ts
│   ├── core/
│   │   ├── session-manager.ts
│   │   ├── process-manager.ts
│   │   ├── event-watcher.ts
│   │   ├── message-router.ts
│   │   ├── status-monitor.ts
│   │   ├── log-aggregator.ts
│   │   └── approval-queue.ts
│   ├── planning/
│   │   ├── planning-agent.ts
│   │   └── chat-handler.ts
│   └── ui/
│       ├── server.ts
│       └── websocket.ts
├── web/
│   └── (React app)
├── package.json
└── tsconfig.json
```

---

## Phase 1: Foundation

### Task 1.1: Initialize Project

```bash
mkdir -p ~/Documents/orchestrator
cd ~/Documents/orchestrator
npm init -y
npm install typescript ts-node @types/node express socket.io cors
npm install -D @types/express
npx tsc --init
```

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "web"]
}
```

Update `package.json` scripts:
```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### Task 1.2: Create Project Config

Create `projects.config.json`:
```json
{
  "projects": {
    "backend": {
      "path": "~/Documents/backend",
      "devServer": {
        "command": "npm run dev",
        "readyPattern": "listening on.*:3000",
        "env": {}
      },
      "hasE2E": true
    },
    "frontend": {
      "path": "~/Documents/frontend",
      "devServer": {
        "command": "npm run dev",
        "readyPattern": "Local:.*:5173",
        "env": {}
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

### Task 1.3: Create Hook Templates

Create `hooks/on_status_change.sh`:
```bash
#!/bin/bash
set -e

STATUS="$1"
MESSAGE="$2"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

# Validate status
case "$STATUS" in
  IDLE|WORKING|DEBUGGING|FATAL_DEBUGGING|FATAL_RECOVERY|READY|E2E|BLOCKED)
    ;;
  *)
    echo "Invalid status: $STATUS" >&2
    echo "Valid: IDLE, WORKING, DEBUGGING, FATAL_DEBUGGING, FATAL_RECOVERY, READY, E2E, BLOCKED" >&2
    exit 1
    ;;
esac

# Write to outbox
cat > "$SESSION_DIR/outbox/status_$TIMESTAMP.json" <<EOF
{
  "type": "status_update",
  "project": "$PROJECT",
  "status": "$STATUS",
  "message": "$MESSAGE",
  "timestamp": $TIMESTAMP
}
EOF

# Update current status
cat > "$SESSION_DIR/status.json" <<EOF
{
  "status": "$STATUS",
  "message": "$MESSAGE",
  "updated_at": $TIMESTAMP
}
EOF

echo "Status updated: $STATUS"
```

Create `hooks/send_message.sh`:
```bash
#!/bin/bash
set -e

TARGET="$1"
MESSAGE="$2"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

if [ -z "$TARGET" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: send_message.sh <target_project> <message>" >&2
  exit 1
fi

cat > "$SESSION_DIR/outbox/message_$TIMESTAMP.json" <<EOF
{
  "type": "message",
  "from": "$PROJECT",
  "to": "$TARGET",
  "message": "$MESSAGE",
  "timestamp": $TIMESTAMP
}
EOF

echo "Message sent to $TARGET"
```

Create `hooks/on_complete.sh`:
```bash
#!/bin/bash
set -e

SUMMARY="$1"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

cat > "$SESSION_DIR/outbox/complete_$TIMESTAMP.json" <<EOF
{
  "type": "task_complete",
  "project": "$PROJECT",
  "summary": "$SUMMARY",
  "timestamp": $TIMESTAMP
}
EOF

# Also update status to READY
"$SCRIPT_DIR/on_status_change.sh" "READY" "$SUMMARY"
```

Create `hooks/on_error.sh`:
```bash
#!/bin/bash
set -e

ERROR="$1"
SEVERITY="${2:-medium}"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

cat > "$SESSION_DIR/outbox/error_$TIMESTAMP.json" <<EOF
{
  "type": "error_report",
  "project": "$PROJECT",
  "error": "$ERROR",
  "severity": "$SEVERITY",
  "timestamp": $TIMESTAMP
}
EOF

echo "Error reported: $SEVERITY"
```

Create `hooks/on_question.sh`:
```bash
#!/bin/bash
set -e

PROMPT="$1"
TYPE="${2:-approval}"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"
REQUEST_ID="${PROJECT}_req_$TIMESTAMP"

cat > "$SESSION_DIR/outbox/approval_$TIMESTAMP.json" <<EOF
{
  "type": "approval_request",
  "id": "$REQUEST_ID",
  "project": "$PROJECT",
  "prompt": "$PROMPT",
  "approval_type": "$TYPE",
  "timestamp": $TIMESTAMP
}
EOF

# Wait for response
RESPONSE_FILE="/tmp/orchestrator/approval_queue/responses/$REQUEST_ID.json"
echo "Waiting for approval..."

while [ ! -f "$RESPONSE_FILE" ]; do
  sleep 1
done

APPROVED=$(cat "$RESPONSE_FILE" | grep -o '"approved":[^,}]*' | cut -d: -f2 | tr -d ' ')

if [ "$APPROVED" = "true" ]; then
  echo "Approved"
  exit 0
else
  echo "Rejected"
  exit 1
fi
```

Create `hooks/request_restart.sh`:
```bash
#!/bin/bash
set -e

REASON="$1"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

cat > "$SESSION_DIR/outbox/restart_$TIMESTAMP.json" <<EOF
{
  "type": "restart_request",
  "project": "$PROJECT",
  "reason": "$REASON",
  "timestamp": $TIMESTAMP
}
EOF

echo "Restart requested"
```

---

## Phase 2: Core Orchestrator

### Task 2.1: Types Definition

Create `src/types.ts`:
```typescript
export interface ProjectConfig {
  path: string;
  devServer: {
    command: string;
    readyPattern: string;
    env: Record<string, string>;
  };
  hasE2E: boolean;
}

export interface Config {
  projects: Record<string, ProjectConfig>;
  defaults: {
    approvalTimeout: number;
    maxRestarts: number;
    debugEscalationTime: number;
  };
}

export type AgentStatus = 
  | 'IDLE' 
  | 'WORKING' 
  | 'DEBUGGING' 
  | 'FATAL_DEBUGGING' 
  | 'FATAL_RECOVERY' 
  | 'READY' 
  | 'E2E' 
  | 'BLOCKED';

export interface StatusUpdate {
  type: 'status_update';
  project: string;
  status: AgentStatus;
  message: string;
  timestamp: number;
}

export interface Message {
  type: 'message';
  from: string;
  to: string;
  message: string;
  timestamp: number;
}

export interface ApprovalRequest {
  type: 'approval_request';
  id: string;
  project: string;
  prompt: string;
  approval_type: string;
  timestamp: number;
}

export interface ErrorReport {
  type: 'error_report';
  project: string;
  error: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export interface TaskComplete {
  type: 'task_complete';
  project: string;
  summary: string;
  timestamp: number;
}

export interface RestartRequest {
  type: 'restart_request';
  project: string;
  reason: string;
  timestamp: number;
}

export type OutboxEvent = 
  | StatusUpdate 
  | Message 
  | ApprovalRequest 
  | ErrorReport 
  | TaskComplete 
  | RestartRequest;

export interface Session {
  id: string;
  startedAt: number;
  feature: string;
  projects: string[];
  plan?: Plan;
}

export interface Plan {
  feature: string;
  description: string;
  tasks: {
    project: string;
    task: string;
    dependencies: string[];
  }[];
  testPlan: Record<string, string[]>;
}

export interface ProjectState {
  status: AgentStatus;
  message: string;
  updatedAt: number;
  devServerPid?: number;
  agentPid?: number;
}
```

### Task 2.2: Session Manager

Create `src/core/session-manager.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Config, Session } from '../types';

export class SessionManager {
  private config: Config;
  private currentSession: Session | null = null;
  private orchestratorDir: string;

  constructor(config: Config, orchestratorDir: string) {
    this.config = config;
    this.orchestratorDir = orchestratorDir;
  }

  createSession(feature: string, projects: string[]): Session {
    const id = randomUUID().slice(0, 8);
    const session: Session = {
      id,
      startedAt: Date.now(),
      feature,
      projects
    };

    // Create session directories in each project
    for (const projectName of projects) {
      const projectConfig = this.config.projects[projectName];
      if (!projectConfig) continue;

      const projectPath = projectConfig.path.replace('~', process.env.HOME || '');
      const sessionDir = path.join(projectPath, '.orchestrator', `session_${id}`);

      // Create directories
      fs.mkdirSync(path.join(sessionDir, 'outbox'), { recursive: true });
      fs.mkdirSync(path.join(sessionDir, 'logs'), { recursive: true });
      fs.mkdirSync(path.join(sessionDir, 'hooks'), { recursive: true });

      // Copy hooks
      this.deployHooks(sessionDir);

      // Create initial status
      fs.writeFileSync(
        path.join(sessionDir, 'status.json'),
        JSON.stringify({ status: 'IDLE', message: 'Initialized', updated_at: Date.now() })
      );

      // Create empty inbox
      fs.writeFileSync(path.join(sessionDir, 'inbox.txt'), '');

      // Create metadata
      fs.writeFileSync(
        path.join(sessionDir, 'metadata.json'),
        JSON.stringify({
          session_id: id,
          project: projectName,
          started_at: session.startedAt,
          feature
        }, null, 2)
      );
    }

    // Register globally
    const globalDir = '/tmp/orchestrator/sessions';
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'active.json'),
      JSON.stringify(session, null, 2)
    );

    // Create approval queue dirs
    fs.mkdirSync('/tmp/orchestrator/approval_queue/pending', { recursive: true });
    fs.mkdirSync('/tmp/orchestrator/approval_queue/responses', { recursive: true });

    this.currentSession = session;
    return session;
  }

  private deployHooks(sessionDir: string): void {
    const hooksSource = path.join(this.orchestratorDir, 'hooks');
    const hooksDest = path.join(sessionDir, 'hooks');

    const hooks = fs.readdirSync(hooksSource);
    for (const hook of hooks) {
      const src = path.join(hooksSource, hook);
      const dest = path.join(hooksDest, hook);
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, '755');
    }
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  getSessionDir(project: string): string | null {
    if (!this.currentSession) return null;
    const projectConfig = this.config.projects[project];
    if (!projectConfig) return null;
    
    const projectPath = projectConfig.path.replace('~', process.env.HOME || '');
    return path.join(projectPath, '.orchestrator', `session_${this.currentSession.id}`);
  }
}
```

### Task 2.3: Process Manager

Create `src/core/process-manager.ts`:
```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Config, ProjectConfig } from '../types';

interface ProcessInfo {
  process: ChildProcess;
  project: string;
  type: 'devServer' | 'agent';
  startedAt: number;
  ready: boolean;
}

export class ProcessManager extends EventEmitter {
  private config: Config;
  private processes: Map<string, ProcessInfo> = new Map();

  constructor(config: Config) {
    super();
    this.config = config;
  }

  async startDevServer(project: string): Promise<void> {
    const projectConfig = this.config.projects[project];
    if (!projectConfig) throw new Error(`Unknown project: ${project}`);

    const projectPath = projectConfig.path.replace('~', process.env.HOME || '');
    const readyPattern = new RegExp(projectConfig.devServer.readyPattern, 'i');

    return new Promise((resolve, reject) => {
      const proc = spawn('sh', ['-c', projectConfig.devServer.command], {
        cwd: projectPath,
        env: { ...process.env, ...projectConfig.devServer.env },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const info: ProcessInfo = {
        process: proc,
        project,
        type: 'devServer',
        startedAt: Date.now(),
        ready: false
      };

      this.processes.set(`${project}-devServer`, info);

      const onData = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
        const text = data.toString();
        this.emit('log', { project, type: 'devServer', stream, text });

        if (!info.ready && readyPattern.test(text)) {
          info.ready = true;
          this.emit('ready', { project, type: 'devServer' });
          resolve();
        }
      };

      proc.stdout?.on('data', onData('stdout'));
      proc.stderr?.on('data', onData('stderr'));

      proc.on('exit', (code) => {
        this.processes.delete(`${project}-devServer`);
        this.emit('exit', { project, type: 'devServer', code, uptime: Date.now() - info.startedAt });
      });

      proc.on('error', (err) => {
        reject(err);
      });

      // Timeout
      setTimeout(() => {
        if (!info.ready) {
          reject(new Error(`Dev server for ${project} did not become ready in time`));
        }
      }, 60000);
    });
  }

  async startAgent(project: string, sessionDir: string, task: string): Promise<void> {
    const projectConfig = this.config.projects[project];
    if (!projectConfig) throw new Error(`Unknown project: ${project}`);

    const projectPath = projectConfig.path.replace('~', process.env.HOME || '');

    // Claude Code command with task
    const command = `claude --dangerously-skip-permissions -p "${task.replace(/"/g, '\\"')}"`;

    const proc = spawn('sh', ['-c', command], {
      cwd: projectPath,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const info: ProcessInfo = {
      process: proc,
      project,
      type: 'agent',
      startedAt: Date.now(),
      ready: true
    };

    this.processes.set(`${project}-agent`, info);

    proc.stdout?.on('data', (data: Buffer) => {
      this.emit('log', { project, type: 'agent', stream: 'stdout', text: data.toString() });
    });

    proc.stderr?.on('data', (data: Buffer) => {
      this.emit('log', { project, type: 'agent', stream: 'stderr', text: data.toString() });
    });

    proc.on('exit', (code) => {
      this.processes.delete(`${project}-agent`);
      this.emit('exit', { project, type: 'agent', code, uptime: Date.now() - info.startedAt });
    });
  }

  async restartDevServer(project: string): Promise<void> {
    const key = `${project}-devServer`;
    const info = this.processes.get(key);
    
    if (info) {
      info.process.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 2000));
      if (this.processes.has(key)) {
        info.process.kill('SIGKILL');
      }
    }

    await this.startDevServer(project);
  }

  stopAll(): void {
    for (const [key, info] of this.processes) {
      info.process.kill('SIGTERM');
    }
  }

  isRunning(project: string, type: 'devServer' | 'agent'): boolean {
    return this.processes.has(`${project}-${type}`);
  }
}
```

### Task 2.4: Event Watcher

Create `src/core/event-watcher.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { OutboxEvent } from '../types';

export class EventWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private processing: Set<string> = new Set();

  watchProject(project: string, sessionDir: string): void {
    const outboxDir = path.join(sessionDir, 'outbox');
    
    if (!fs.existsSync(outboxDir)) {
      fs.mkdirSync(outboxDir, { recursive: true });
    }

    const watcher = fs.watch(outboxDir, async (eventType, filename) => {
      if (eventType !== 'rename' || !filename || !filename.endsWith('.json')) return;
      
      const filePath = path.join(outboxDir, filename);
      
      // Debounce / prevent double processing
      if (this.processing.has(filePath)) return;
      this.processing.add(filePath);

      // Small delay to ensure file is fully written
      await new Promise(r => setTimeout(r, 50));

      try {
        if (!fs.existsSync(filePath)) return;
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const event: OutboxEvent = JSON.parse(content);
        
        this.emit('event', event);
        
        // Delete processed file
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Error processing event file ${filename}:`, err);
      } finally {
        this.processing.delete(filePath);
      }
    });

    this.watchers.set(project, watcher);
  }

  stopWatching(project: string): void {
    const watcher = this.watchers.get(project);
    if (watcher) {
      watcher.close();
      this.watchers.delete(project);
    }
  }

  stopAll(): void {
    for (const [project, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
```

### Task 2.5: Message Router

Create `src/core/message-router.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { SessionManager } from './session-manager';

export class MessageRouter {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  sendToAgent(project: string, message: string, from: string = 'Orchestrator', type: string = 'message'): void {
    const sessionDir = this.sessionManager.getSessionDir(project);
    if (!sessionDir) {
      console.error(`Cannot send message: no session for ${project}`);
      return;
    }

    const inboxPath = path.join(sessionDir, 'inbox.txt');
    const timestamp = new Date().toISOString();
    
    const formattedMessage = `
─────────────────────────────────
FROM: ${from}
TIME: ${timestamp}
TYPE: ${type}

${message}
─────────────────────────────────
`;

    fs.appendFileSync(inboxPath, formattedMessage);
  }

  broadcast(message: string, from: string = 'Orchestrator'): void {
    const session = this.sessionManager.getCurrentSession();
    if (!session) return;

    for (const project of session.projects) {
      this.sendToAgent(project, message, from);
    }
  }
}
```

### Task 2.6: Status Monitor

Create `src/core/status-monitor.ts`:
```typescript
import { EventEmitter } from 'events';
import { AgentStatus, ProjectState } from '../types';

export class StatusMonitor extends EventEmitter {
  private states: Map<string, ProjectState> = new Map();

  updateStatus(project: string, status: AgentStatus, message: string): void {
    const prev = this.states.get(project);
    const state: ProjectState = {
      status,
      message,
      updatedAt: Date.now(),
      devServerPid: prev?.devServerPid,
      agentPid: prev?.agentPid
    };

    this.states.set(project, state);
    this.emit('statusChange', { project, status, message, previous: prev?.status });

    // Check for special conditions
    if (status === 'READY') {
      this.emit('projectReady', { project, message });
    }

    if (status === 'FATAL_RECOVERY') {
      this.emit('fatalRecovery', { project });
    }

    // Check if all projects are ready
    if (this.allInStatus('READY') || this.allInStatus('IDLE')) {
      this.emit('allReady');
    }
  }

  getStatus(project: string): ProjectState | undefined {
    return this.states.get(project);
  }

  getAllStatuses(): Map<string, ProjectState> {
    return new Map(this.states);
  }

  allInStatus(...statuses: AgentStatus[]): boolean {
    if (this.states.size === 0) return false;
    for (const [_, state] of this.states) {
      if (!statuses.includes(state.status)) return false;
    }
    return true;
  }

  initializeProject(project: string): void {
    this.states.set(project, {
      status: 'IDLE',
      message: 'Initialized',
      updatedAt: Date.now()
    });
  }
}
```

### Task 2.7: Approval Queue

Create `src/core/approval-queue.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { EventEmitter } from 'events';
import { ApprovalRequest } from '../types';

export class ApprovalQueue extends EventEmitter {
  private queue: ApprovalRequest[] = [];
  private processing: boolean = false;
  private rl: readline.Interface;

  constructor() {
    super();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  addRequest(request: ApprovalRequest): void {
    this.queue.push(request);
    this.emit('requestAdded', request);
    
    if (!this.processing) {
      this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const request = this.queue.shift()!;

    this.emit('processing', request);

    const approved = await this.promptUser(request);
    
    // Write response
    const responsePath = `/tmp/orchestrator/approval_queue/responses/${request.id}.json`;
    fs.writeFileSync(responsePath, JSON.stringify({
      approved,
      timestamp: Date.now()
    }));

    this.emit('responded', { request, approved });

    // Process next
    this.processNext();
  }

  private promptUser(request: ApprovalRequest): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log(`║ [${request.project.toUpperCase()}] APPROVAL NEEDED`);
      console.log('╠════════════════════════════════════════════════════════════╣');
      console.log(`║ ${request.prompt}`);
      console.log('╚════════════════════════════════════════════════════════════╝');

      this.rl.question('Approve? (y/n): ', (answer) => {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  close(): void {
    this.rl.close();
  }
}
```

---

## Phase 3: UI Server

### Task 3.1: Express + Socket.io Server

Create `src/ui/server.ts`:
```typescript
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import path from 'path';

export function createUIServer(port: number = 3456) {
  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: { origin: '*' }
  });

  app.use(cors());
  app.use(express.json());

  // Serve static React build (later)
  app.use(express.static(path.join(__dirname, '../../web/dist')));

  // API endpoints
  app.get('/api/status', (req, res) => {
    // Will be connected to StatusMonitor
    res.json({ status: 'ok' });
  });

  // Socket.io events
  io.on('connection', (socket) => {
    console.log('UI client connected');

    socket.on('chat', (message) => {
      // Route to Planning Agent
      io.emit('chat', { from: 'user', message });
    });

    socket.on('approve', ({ id, approved }) => {
      // Handle approval from UI
    });

    socket.on('disconnect', () => {
      console.log('UI client disconnected');
    });
  });

  return { app, server, io, start: () => server.listen(port, () => {
    console.log(`UI server running at http://localhost:${port}`);
  })};
}
```

---

## Phase 4: Main Orchestrator

### Task 4.1: Main Entry Point

Create `src/index.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './types';
import { SessionManager } from './core/session-manager';
import { ProcessManager } from './core/process-manager';
import { EventWatcher } from './core/event-watcher';
import { MessageRouter } from './core/message-router';
import { StatusMonitor } from './core/status-monitor';
import { ApprovalQueue } from './core/approval-queue';
import { createUIServer } from './ui/server';

const ORCHESTRATOR_DIR = __dirname.replace('/src', '').replace('/dist', '');

async function main() {
  // Load config
  const configPath = path.join(ORCHESTRATOR_DIR, 'projects.config.json');
  const config: Config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Initialize components
  const sessionManager = new SessionManager(config, ORCHESTRATOR_DIR);
  const processManager = new ProcessManager(config);
  const eventWatcher = new EventWatcher();
  const messageRouter = new MessageRouter(sessionManager);
  const statusMonitor = new StatusMonitor();
  const approvalQueue = new ApprovalQueue();

  // Start UI
  const ui = createUIServer(3456);

  // Wire up events
  processManager.on('log', ({ project, type, stream, text }) => {
    ui.io.emit('log', { project, type, stream, text, timestamp: Date.now() });
  });

  processManager.on('exit', ({ project, type, code, uptime }) => {
    console.log(`[${project}] ${type} exited with code ${code} after ${uptime}ms`);
    
    if (type === 'devServer' && code !== 0 && uptime < 10000) {
      // Quick crash - may need auto-restart logic
    }
  });

  eventWatcher.on('event', (event) => {
    console.log(`[Event] ${event.type} from ${event.project || 'unknown'}`);
    ui.io.emit('event', event);

    switch (event.type) {
      case 'status_update':
        statusMonitor.updateStatus(event.project, event.status, event.message);
        break;
      
      case 'message':
        messageRouter.sendToAgent(event.to, event.message, event.from);
        break;
      
      case 'approval_request':
        approvalQueue.addRequest(event);
        ui.io.emit('approval', event);
        break;
      
      case 'task_complete':
        // Will trigger E2E flow
        break;
      
      case 'restart_request':
        processManager.restartDevServer(event.project);
        break;
    }
  });

  statusMonitor.on('statusChange', ({ project, status, message }) => {
    ui.io.emit('status', { project, status, message });
  });

  statusMonitor.on('projectReady', async ({ project, message }) => {
    // TODO: Ask Planning Agent for E2E prompt
    console.log(`[${project}] Ready for E2E testing`);
  });

  // Handle UI chat
  ui.io.on('connection', (socket) => {
    socket.on('chat', async (message) => {
      // TODO: Route to Planning Agent
      console.log(`[Chat] User: ${message}`);
    });

    socket.on('startSession', async ({ feature, projects }) => {
      const session = sessionManager.createSession(feature, projects);
      
      // Initialize status for each project
      for (const project of projects) {
        statusMonitor.initializeProject(project);
        const sessionDir = sessionManager.getSessionDir(project);
        if (sessionDir) {
          eventWatcher.watchProject(project, sessionDir);
        }
      }

      socket.emit('sessionCreated', session);
    });

    socket.on('startExecution', async ({ plan }) => {
      const session = sessionManager.getCurrentSession();
      if (!session) return;

      // Start dev servers
      for (const project of session.projects) {
        try {
          await processManager.startDevServer(project);
          statusMonitor.updateStatus(project, 'IDLE', 'Dev server ready');
        } catch (err) {
          console.error(`Failed to start ${project} dev server:`, err);
        }
      }

      // Start agents with tasks from plan
      for (const task of plan.tasks) {
        const sessionDir = sessionManager.getSessionDir(task.project);
        if (sessionDir) {
          await processManager.startAgent(task.project, sessionDir, task.task);
          statusMonitor.updateStatus(task.project, 'WORKING', 'Starting task');
        }
      }
    });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    processManager.stopAll();
    eventWatcher.stopAll();
    approvalQueue.close();
    process.exit(0);
  });

  // Start
  ui.start();
  console.log('Orchestrator ready. Open http://localhost:3456');
}

main().catch(console.error);
```

---

## Phase 5: Planning Skill

### Task 5.1: Create Planning Skill

Create `.claude/skills/planning.md`:
```markdown
# Planning Skill

You are the Planning Agent. This skill is ALWAYS active.

## Your Role

1. **Planning Phase**: Chat with user, create detailed plans
2. **Execution Phase**: Monitor agents, generate E2E prompts, coordinate

## Reading Project Config

```bash
cat ~/Documents/orchestrator/projects.config.json
```

## Creating Plans

Structure plans as JSON:
```json
{
  "feature": "Feature name",
  "description": "What we're building",
  "tasks": [
    {
      "project": "backend",
      "task": "Detailed implementation task...",
      "dependencies": []
    }
  ],
  "testPlan": {
    "backend": ["Test scenario 1", "Test scenario 2"]
  }
}
```

## Generating E2E Prompts

When a project reports READY:

1. Read their E2E skill:
   ```bash
   cat ~/Documents/{project}/.claude/skills/e2e-testing.md
   ```

2. Generate prompt combining:
   - What was implemented
   - Test scenarios from plan
   - E2E skill instructions

3. Send via hook:
   ```bash
   ./hooks/send_e2e_prompt.sh "{project}" "{prompt}"
   ```

## Communication Hooks

Located at: `.orchestrator/session_*/hooks/`

- `send_chat.sh "message"` - Reply to user
- `save_plan.sh plan.json` - Save approved plan
- `send_message.sh "project" "message"` - Instruct agent
- `send_e2e_prompt.sh "project" "prompt"` - Trigger E2E
```

---

## Phase 6: React Web UI

### Task 6.1: Initialize React App

```bash
cd ~/Documents/orchestrator
npm create vite@latest web -- --template react-ts
cd web
npm install socket.io-client
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Task 6.2: Create Main Components

Create basic React components:
- `App.tsx` - Main layout with phases
- `PlanningChat.tsx` - Chat interface
- `ProjectStatus.tsx` - Status cards
- `LogViewer.tsx` - Live logs
- `ApprovalPanel.tsx` - Approval requests

(Detailed React code can be generated in next iteration)

---

## Execution Order

1. Phase 1: Foundation (project setup, config, hooks)
2. Phase 2: Core (all managers and monitors)
3. Phase 3: UI Server (Express + Socket.io)
4. Phase 4: Main orchestrator (wire everything)
5. Phase 5: Planning skill
6. Phase 6: React UI

## Testing the System

1. Start orchestrator: `npm run dev`
2. Open http://localhost:3456
3. Create a test session
4. Watch logs and status updates
5. Test approval flow

---

## Notes for Claude Code

- Use TypeScript throughout
- Handle errors gracefully
- Add logging for debugging
- Keep components loosely coupled
- Test each phase before moving on
