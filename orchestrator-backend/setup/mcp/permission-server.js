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
      tools: [{
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
      }]
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
