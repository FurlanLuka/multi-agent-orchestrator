#!/usr/bin/env node
/**
 * MCP server that handles permission prompts from Claude CLI.
 * Forwards to orchestrator via HTTP, waits for user response.
 *
 * This server implements the MCP protocol and is used with Claude CLI's
 * --permission-prompt-tool flag to allow live permission approval via
 * the orchestrator UI.
 */

const http = require('http');
const readline = require('readline');

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3456';
const PROJECT = process.env.ORCHESTRATOR_PROJECT || 'unknown';
const TASK_INDEX = process.env.ORCHESTRATOR_TASK_INDEX || '0';

// Read JSON-RPC messages from stdin (one per line)
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);
    await handleMessage(msg);
  } catch (err) {
    // Ignore parse errors
  }
});

async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    respond(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'orchestrator-permission', version: '1.0.0' }
    });
  }
  else if (method === 'tools/list') {
    respond(id, {
      tools: [
        {
          name: 'orchestrator_permission',
          description: 'Handle permission prompts by forwarding to orchestrator UI',
          inputSchema: {
            type: 'object',
            properties: {
              tool_name: { type: 'string', description: 'The tool requesting permission' },
              input: { type: 'object', description: 'The tool input' }
            },
            required: ['tool_name']
          }
        },
        {
          name: 'ask_planning_question',
          description: 'Ask the user clarifying questions during planning. Use this when requirements are ambiguous, multiple valid approaches exist, or you need domain-specific information not in the code. Questions are shown one at a time. Supports text input, single-select, and multi-select question types.',
          inputSchema: {
            type: 'object',
            properties: {
              questions: {
                type: 'array',
                description: 'Array of questions to ask (shown one at a time)',
                items: {
                  type: 'object',
                  properties: {
                    question: { type: 'string', description: 'The question to ask' },
                    context: { type: 'string', description: 'Why you need this information' },
                    type: {
                      type: 'string',
                      enum: ['text', 'select_one', 'select_many'],
                      description: 'Question type: text (free input), select_one (pick one option), select_many (pick multiple). Default: text. All select types include a custom input option.'
                    },
                    options: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Predefined options for select_one/select_many. A "Custom" option is always added automatically.'
                    }
                  },
                  required: ['question']
                }
              }
            },
            required: ['questions']
          }
        },
        {
          name: 'task_complete',
          description: 'Signal task completion and request verification. Call this after implementing each task. Returns next task, fix instructions, or completion status.',
          inputSchema: {
            type: 'object',
            properties: {
              taskIndex: {
                type: 'number',
                description: 'The index of the completed task (0-based)'
              },
              summary: {
                type: 'string',
                description: 'Brief summary of what was implemented (files changed, key functions added, etc.)'
              }
            },
            required: ['taskIndex', 'summary']
          }
        },
        {
          name: 'exploration_complete',
          description: 'Signal that codebase exploration and Q&A is complete. Returns Phase 2 instructions for plan generation. Call this AFTER you have thoroughly explored all relevant code and asked any clarifying questions. The response will contain instructions for generating the implementation plan.',
          inputSchema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'Summary of discoveries: technologies found, patterns identified, API contracts defined, execution order determined, and any considerations. This summary is included in Phase 2 prompt.'
              }
            },
            required: ['summary']
          }
        },
        {
          name: 'submit_plan_for_approval',
          description: 'Submit the generated plan for user approval. Blocks until user approves or requests changes. Returns { status: "approved" } or { status: "refine", feedback: "..." }. If refinement is requested, revise the plan based on feedback and submit again.',
          inputSchema: {
            type: 'object',
            properties: {
              plan: {
                type: 'object',
                description: 'The complete plan JSON to submit for approval'
              }
            },
            required: ['plan']
          }
        }
      ]
    });
  }
  else if (method === 'tools/call' && params?.name === 'orchestrator_permission') {
    const toolName = params.arguments?.tool_name || 'unknown';
    const toolInput = params.arguments?.input || {};

    // Ask orchestrator (blocks until user responds)
    const result = await askOrchestrator(toolName, toolInput);

    // Return JSON response in the format Claude expects for permission prompt tools
    let response;
    if (result === 'allow') {
      response = {
        behavior: 'allow',
        updatedInput: toolInput  // Pass through the original input
      };
    } else {
      response = {
        behavior: 'deny',
        message: 'User denied permission via orchestrator UI'
      };
    }

    respond(id, {
      content: [{ type: 'text', text: JSON.stringify(response) }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'ask_planning_question') {
    const questions = params.arguments?.questions || [];

    if (questions.length === 0) {
      respond(id, {
        content: [{ type: 'text', text: 'No questions provided' }]
      });
      return;
    }

    // Call orchestrator endpoint (blocks until all questions are answered)
    const answers = await askPlanningQuestions(questions);

    respond(id, {
      content: [{ type: 'text', text: answers }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'task_complete') {
    const taskIndex = params.arguments?.taskIndex;
    const summary = params.arguments?.summary || '';

    if (taskIndex === undefined || taskIndex === null) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'taskIndex is required' }) }]
      });
      return;
    }

    // Call orchestrator endpoint (blocks until verification completes)
    const result = await signalTaskComplete(taskIndex, summary);

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'exploration_complete') {
    const summary = params.arguments?.summary || '';

    // Call orchestrator endpoint (blocks until Phase 2 prompt is generated)
    const phase2Prompt = await signalExplorationComplete(summary);

    // Return Phase 2 prompt as tool result - agent continues with full context preserved
    respond(id, {
      content: [{ type: 'text', text: phase2Prompt }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'submit_plan_for_approval') {
    const plan = params.arguments?.plan || {};

    // Call orchestrator endpoint (blocks until user approves or requests changes)
    const result = await submitPlanForApproval(plan);

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'notifications/initialized') {
    // No response needed for notifications
  }
  else if (id) {
    // Unknown method with id - send empty result
    respond(id, {});
  }
}

function respond(id, result) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  console.log(response);
}

function askOrchestrator(toolName, toolInput) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      taskIndex: parseInt(TASK_INDEX, 10),
      toolName,
      toolInput
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/permission-prompt`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 600000  // 10 minute timeout
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve(body.trim() || 'deny');
      });
    });

    req.on('error', () => resolve('deny'));
    req.on('timeout', () => {
      req.destroy();
      resolve('deny');
    });

    req.write(postData);
    req.end();
  });
}

function askPlanningQuestions(questions) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      taskIndex: parseInt(TASK_INDEX, 10),
      questions  // Array of { question, context }
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/planning-questions`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 300000  // 5 minute timeout for multiple questions
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve(body || 'No response provided');
      });
    });

    req.on('error', () => resolve('Error: Could not reach orchestrator'));
    req.on('timeout', () => {
      req.destroy();
      resolve('No response - proceeding with defaults');
    });

    req.write(postData);
    req.end();
  });
}

function signalTaskComplete(taskIndex, summary) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      taskIndex: taskIndex,
      summary: summary
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/task-complete`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 600000  // 10 minute timeout for verification
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve(body || JSON.stringify({ status: 'escalate', escalationReason: 'No response from orchestrator' }));
      });
    });

    req.on('error', () => resolve(JSON.stringify({ status: 'escalate', escalationReason: 'Could not reach orchestrator' })));
    req.on('timeout', () => {
      req.destroy();
      resolve(JSON.stringify({ status: 'escalate', escalationReason: 'Verification timeout' }));
    });

    req.write(postData);
    req.end();
  });
}

function signalExplorationComplete(summary) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      summary
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/exploration-complete`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60000  // 1 minute timeout for Phase 2 prompt generation
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        // Body contains the Phase 2 prompt - agent will continue with this
        resolve(body || 'Error: No response from orchestrator. Please generate a plan based on your exploration.');
      });
    });

    req.on('error', () => resolve('Error: Could not reach orchestrator. Please generate a plan based on your exploration.'));
    req.on('timeout', () => {
      req.destroy();
      resolve('Error: Timeout. Please generate a plan based on your exploration.');
    });

    req.write(postData);
    req.end();
  });
}

function submitPlanForApproval(plan) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      plan
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/plan-approval`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 600000  // 10 minute timeout for user approval
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        // Body contains JSON: { status: 'approved' } or { status: 'refine', feedback: '...' }
        resolve(body || JSON.stringify({ status: 'approved' }));
      });
    });

    req.on('error', () => resolve(JSON.stringify({ status: 'approved', note: 'Could not reach orchestrator - auto-approving' })));
    req.on('timeout', () => {
      req.destroy();
      resolve(JSON.stringify({ status: 'approved', note: 'Approval timeout - auto-approving' }));
    });

    req.write(postData);
    req.end();
  });
}
