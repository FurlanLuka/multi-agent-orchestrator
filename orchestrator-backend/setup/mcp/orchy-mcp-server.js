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
              summary: {
                type: 'string',
                description: 'Brief summary of what was implemented (files changed, key functions added, etc.)'
              }
            },
            required: ['summary']
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
        },
        {
          name: 'request_user_input',
          description: 'Request input from user, show a confirmation dialog, or set a GitHub Actions secret. Use for: (1) collecting credentials, API keys, env vars (type: "input"), (2) informing user about manual steps needed and getting confirmation (type: "confirmation"), or (3) setting GitHub repository secrets (type: "github_secret" - only for workspaces with GitHub integration enabled).',
          inputSchema: {
            type: 'object',
            properties: {
              inputs: {
                type: 'array',
                description: 'Array of inputs to request OR a single confirmation dialog',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['input', 'confirmation', 'github_secret'],
                      description: 'Type of input: "input" for text fields (default), "confirmation" for yes/no dialog, "github_secret" for GitHub Actions secrets'
                    },
                    name: { type: 'string', description: 'Variable name for input type (e.g., GOOGLE_CLIENT_ID) or secret name for github_secret' },
                    label: { type: 'string', description: 'Display label for input field OR title for confirmation dialog' },
                    description: { type: 'string', description: 'Help text for input OR detailed message for confirmation (supports markdown)' },
                    sensitive: { type: 'boolean', description: 'If true, mask input (for passwords/secrets). Only for type: "input"' },
                    required: { type: 'boolean', description: 'If true, user must provide a value. Only for type: "input"' },
                    repo: { type: 'string', description: 'Repository in "owner/repo" format. Required for type: "github_secret"' }
                  },
                  required: ['label']
                }
              }
            },
            required: ['inputs']
          }
        },
        // ═══════════════════════════════════════════════════════════════
        // Multi-Stage Planning Tools (6-stage workflow)
        // ═══════════════════════════════════════════════════════════════
        {
          name: 'submit_refined_feature',
          description: 'Stage 1 completion: Submit refined feature after Socratic Q&A dialogue. Blocks until user approves or requests changes. Returns { status: "approved" } or { status: "refine", feedback: "..." }.',
          inputSchema: {
            type: 'object',
            properties: {
              refinedDescription: { type: 'string', description: 'The refined, clarified feature description after Q&A' },
              keyRequirements: { type: 'array', items: { type: 'string' }, description: 'Key requirements extracted from the dialogue' }
            },
            required: ['refinedDescription', 'keyRequirements']
          }
        },
        {
          name: 'submit_technical_spec',
          description: 'Stage 5 completion: Submit API contracts and architecture after project exploration. Blocks until user approves or requests changes. Returns { status: "approved" } or { status: "refine", feedback: "..." }.',
          inputSchema: {
            type: 'object',
            properties: {
              apiContracts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    endpoint: { type: 'string' },
                    method: { type: 'string' },
                    request: { type: 'object' },
                    response: { type: 'object' },
                    providedBy: { type: 'string' },
                    consumedBy: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['endpoint', 'method', 'providedBy']
                },
                description: 'API contracts between projects'
              },
              architectureDecisions: { type: 'array', items: { type: 'string' }, description: 'Key architecture decisions' },
              executionOrder: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    project: { type: 'string' },
                    dependsOn: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['project', 'dependsOn']
                },
                description: 'Project execution order with dependencies'
              }
            },
            required: ['apiContracts', 'executionOrder']
          }
        },
        {
          name: 'get_deployment_instructions',
          description: 'Get comprehensive deployment automation instructions. Call this when user requests deployment (e.g., "deploy to X", "add deployment", "set up CI/CD"). Returns detailed guide for all supported providers including Vercel, Netlify, Hetzner, AWS, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              provider: {
                type: 'string',
                description: 'Optional: specific provider to get instructions for (vercel, netlify, hetzner, digitalocean, aws, railway, fly). If omitted, returns full guide with all providers.'
              }
            }
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
    const summary = params.arguments?.summary || '';

    // Call orchestrator endpoint (blocks until verification completes)
    // Orchestrator determines the current task from its own state
    const result = await signalTaskComplete(summary);

    // Parse result and add clear stop instructions for escalate/all_complete
    let responseText = result;
    try {
      const parsed = JSON.parse(result);
      if (parsed.status === 'escalate') {
        responseText = `STOP: ${JSON.stringify(parsed)}\n\n**You must stop working immediately.** The orchestrator has escalated this task. Do not continue to other tasks. Wait for user intervention.`;
      } else if (parsed.status === 'all_complete') {
        responseText = `COMPLETE: ${JSON.stringify(parsed)}\n\n**All tasks are done.** Stop working. Do not do any more work.`;
      }
    } catch {
      // Not JSON, use as-is
    }

    respond(id, {
      content: [{ type: 'text', text: responseText }]
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
  else if (method === 'tools/call' && params?.name === 'request_user_input') {
    const inputs = params.arguments?.inputs || [];

    if (inputs.length === 0) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'No inputs specified' }) }]
      });
      return;
    }

    // Call orchestrator endpoint (blocks until user provides values)
    const result = await requestUserInput(inputs);

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  // ═══════════════════════════════════════════════════════════════
  // Multi-Stage Planning Tool Handlers
  // ═══════════════════════════════════════════════════════════════
  else if (method === 'tools/call' && params?.name === 'submit_refined_feature') {
    const refinedDescription = params.arguments?.refinedDescription || '';
    const keyRequirements = params.arguments?.keyRequirements || [];

    const result = await submitRefinedFeature(refinedDescription, keyRequirements);

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'submit_technical_spec') {
    const apiContracts = params.arguments?.apiContracts || [];
    const architectureDecisions = params.arguments?.architectureDecisions || [];
    const executionOrder = params.arguments?.executionOrder || [];

    const result = await submitTechnicalSpec(apiContracts, architectureDecisions, executionOrder);

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'get_deployment_instructions') {
    const provider = params.arguments?.provider || null;
    const instructions = getDeploymentInstructions(provider);

    respond(id, {
      content: [{ type: 'text', text: instructions }]
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

function signalTaskComplete(summary) {
  // Don't send taskIndex - orchestrator knows which task is "working" for this project
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
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

function requestUserInput(inputs) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      inputs
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/user-input`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 600000  // 10 minute timeout for user input
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        // Body contains JSON with user-provided values
        resolve(body || JSON.stringify({ error: 'No response from user' }));
      });
    });

    req.on('error', () => resolve(JSON.stringify({ error: 'Could not reach orchestrator' })));
    req.on('timeout', () => {
      req.destroy();
      resolve(JSON.stringify({ error: 'User input timeout' }));
    });

    req.write(postData);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// Multi-Stage Planning HTTP Functions
// ═══════════════════════════════════════════════════════════════

function submitRefinedFeature(refinedDescription, keyRequirements) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      refinedDescription,
      keyRequirements
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/submit-refined-feature`);

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

function submitTechnicalSpec(apiContracts, architectureDecisions, executionOrder) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      project: PROJECT,
      apiContracts,
      architectureDecisions,
      executionOrder
    });

    const url = new URL(`${ORCHESTRATOR_URL}/api/submit-technical-spec`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 600000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
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

// ═══════════════════════════════════════════════════════════════
// Deployment Instructions (returned by get_deployment_instructions tool)
// ═══════════════════════════════════════════════════════════════

function getDeploymentInstructions(provider) {
  const fullGuide = `# DEPLOYMENT AUTOMATION GUIDE

## WORKFLOW OVERVIEW

1. **Analyze Codebase** - Detect frameworks, database needs, app type
2. **Recommend Provider** - Based on app type (see table below)
3. **Ask Clarifying Questions** - Provider choice, domain, database options
4. **Check Provider Docs** - Use WebSearch to verify current instance types/APIs
5. **Generate Config** - Everything in \`.github/\` folder

## CRITICAL: CLOUD PROVIDER VERIFICATION (MANDATORY)

**Cloud provider specs change frequently.** Instance types, pricing, and APIs are updated regularly.

**BEFORE generating ANY deployment config, you MUST:**
1. Use WebSearch to verify current instance types: "hetzner cloud instance types 2026" or "digitalocean droplet sizes 2026"
2. Never use hardcoded instance types from templates without verification
3. The current year is 2026 - always include this in search queries for up-to-date results
4. If WebSearch is unavailable, ask the user to confirm the instance type before proceeding

**Example WebSearch queries:**
- "hetzner cloud server types pricing 2026"
- "digitalocean droplet sizes specs 2026"
- "aws ec2 instance types 2026"

## PROVIDER RECOMMENDATION

| App Type | Recommended Provider | Why |
|----------|---------------------|-----|
| Static site (React, Vue) | Cloudflare Pages / Vercel | Free, global CDN |
| Next.js (SSR) | Vercel | Built for Next.js |
| Frontend + simple API | Vercel + Functions | All-in-one |
| Full-stack + database | Hetzner / DigitalOcean | Cost-effective |
| Microservices | Railway / Fly.io | Easy multi-service |
| Enterprise | AWS | Flexibility, scale |

## DEPLOYMENT CATEGORIES

### CATEGORY 1: Platform CLI (No Terraform)
Vercel, Netlify, Cloudflare Pages, Railway, Fly.io
- Simple CLI-based deployment
- Platform handles state internally
- Just need API token

### CATEGORY 2: Cloud Providers (Terraform)
Hetzner, DigitalOcean, AWS, GCP
- Use Terraform for infrastructure
- Terraform Cloud for state management
- Can provision VPS, databases, load balancers

## PROVIDER CONFIGS

### Vercel (Next.js, React, static)
\`\`\`yaml
# Secrets: VERCEL_TOKEN
- name: Deploy to Vercel
  env:
    VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
  run: |
    npm i -g vercel
    vercel pull --yes --environment=production
    vercel build --prod
    vercel deploy --prebuilt --prod
\`\`\`

### Netlify (Static, JAMstack)
\`\`\`yaml
# Secrets: NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID
- name: Deploy to Netlify
  env:
    NETLIFY_AUTH_TOKEN: \${{ secrets.NETLIFY_AUTH_TOKEN }}
    NETLIFY_SITE_ID: \${{ secrets.NETLIFY_SITE_ID }}
  run: |
    npm i -g netlify-cli
    netlify deploy --prod --dir=dist
\`\`\`

### Cloudflare Pages (Static + edge)
\`\`\`yaml
# Secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
- name: Deploy to Cloudflare
  env:
    CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  run: |
    npm i -g wrangler
    wrangler pages deploy dist --project-name=\${{ github.event.repository.name }}
\`\`\`

### Railway (Full-stack, easy)
\`\`\`yaml
# Secrets: RAILWAY_TOKEN
- name: Deploy to Railway
  env:
    RAILWAY_TOKEN: \${{ secrets.RAILWAY_TOKEN }}
  run: |
    npm i -g @railway/cli
    railway up --detach
\`\`\`

### Fly.io (Containers, global)
\`\`\`yaml
# Secrets: FLY_API_TOKEN
- name: Deploy to Fly.io
  env:
    FLY_API_TOKEN: \${{ secrets.FLY_API_TOKEN }}
  run: |
    curl -L https://fly.io/install.sh | sh
    flyctl deploy --remote-only
\`\`\`

### Hetzner/DigitalOcean/AWS (Terraform)
\`\`\`yaml
# Secrets: TF_API_TOKEN, HETZNER_API_TOKEN (or provider-specific)
- name: Deploy via Terraform
  env:
    TF_TOKEN_app_terraform_io: \${{ secrets.TF_API_TOKEN }}
    TF_VAR_hcloud_token: \${{ secrets.HETZNER_API_TOKEN }}
  run: |
    cd .github/infrastructure
    terraform init
    terraform apply -auto-approve
\`\`\`

## DATABASE OPTIONS

**Detection:** Look for Prisma, TypeORM, Drizzle, SQLAlchemy, pg/mysql drivers

| Provider | Managed DB | Self-hosted | SQLite |
|----------|-----------|-------------|--------|
| Hetzner | - | Docker PostgreSQL | ✅ |
| DigitalOcean | Managed PostgreSQL/MySQL | Docker | ✅ |
| AWS | RDS, Aurora | Docker on EC2 | ✅ |
| Railway | Built-in PostgreSQL | - | ✅ |

## TERRAFORM STRUCTURE (VPS deployments)

\`\`\`
.github/
  workflows/deploy.yml
  infrastructure/
    main.tf
    variables.tf
    outputs.tf
\`\`\`

Example main.tf for Hetzner:
\`\`\`hcl
terraform {
  cloud {
    organization = "your-org"
    workspaces { name = "app-production" }
  }
  required_providers {
    hcloud = { source = "hetznercloud/hcloud", version = "~> 1.45" }
  }
}

variable "hcloud_token" { sensitive = true }
variable "github_token" { sensitive = true }
variable "github_repository" {}

provider "hcloud" { token = var.hcloud_token }

resource "tls_private_key" "deploy" { algorithm = "ED25519" }
resource "hcloud_ssh_key" "deploy" {
  name = "deploy-key"
  public_key = tls_private_key.deploy.public_key_openssh
}

resource "hcloud_server" "app" {
  name = "app-server"
  # PLACEHOLDER - Use WebSearch "hetzner instance types 2026" to find current valid types
  server_type = "VERIFY_WITH_WEBSEARCH"
  image = "ubuntu-22.04"
  location = "fsn1"
  ssh_keys = [hcloud_ssh_key.deploy.id]
  user_data = <<-EOF
    #cloud-config
    packages: [docker.io]
    runcmd:
      - systemctl enable docker && systemctl start docker
  EOF
}

resource "null_resource" "deploy_app" {
  triggers = { always_run = timestamp() }
  connection {
    type = "ssh"
    user = "root"
    private_key = tls_private_key.deploy.private_key_openssh
    host = hcloud_server.app.ipv4_address
  }
  provisioner "remote-exec" {
    inline = [
      "echo '\${var.github_token}' | docker login ghcr.io -u github --password-stdin",
      "docker pull ghcr.io/\${var.github_repository}:latest",
      "docker stop app || true && docker rm app || true",
      "docker run -d --name app --restart always -p 3000:3000 ghcr.io/\${var.github_repository}:latest"
    ]
  }
}

output "server_ip" { value = hcloud_server.app.ipv4_address }
\`\`\`

## SECRETS AND CONFIGURATION

### CRITICAL: Auto-Generate vs Request

**AUTO-GENERATE these (do NOT ask user):**
- SSH keys - generate with: \`ssh-keygen -t ed25519 -f /tmp/deploy_key -N "" -C "deploy@github-actions"\`
- JWT secrets, session secrets, encryption keys - generate with: \`openssl rand -base64 32\`
- Internal service tokens
- Any cryptographic material

**REQUEST from user (they need to know these or get them from external services):**
- Login credentials (ADMIN_PASSWORD, ADMIN_USERNAME) - user needs to log in!
- External API tokens (HCLOUD_TOKEN, TF_API_TOKEN, VERCEL_TOKEN, etc.)
- Third-party service credentials (OAuth keys, Stripe keys, etc.)
- Organization/account names (TF_CLOUD_ORGANIZATION, TF_WORKSPACE)

### 1. Configuration Values (use type: "input")
Request non-sensitive config values that will be embedded in files:

\`\`\`json
{
  "inputs": [
    {
      "type": "input",
      "name": "TF_CLOUD_ORGANIZATION",
      "label": "Terraform Cloud Organization",
      "description": "Your Terraform Cloud organization name (from app.terraform.io)"
    },
    {
      "type": "input",
      "name": "TF_WORKSPACE",
      "label": "Terraform Workspace Name",
      "description": "Your Terraform Cloud workspace name (create one at app.terraform.io if needed)"
    }
  ]
}
\`\`\`

### 2. GitHub Secrets (use type: "github_secret")
Request sensitive tokens/keys that will be stored in GitHub Secrets:

\`\`\`json
{
  "inputs": [{
    "type": "github_secret",
    "name": "HCLOUD_TOKEN",
    "label": "Hetzner API Token",
    "description": "Go to console.hetzner.cloud → Security → API Tokens → Generate (Read & Write)",
    "repo": "owner/repo"
  }]
}
\`\`\`

**Required by provider:**

| Provider | Config Values | GitHub Secrets |
|----------|--------------|----------------|
| Terraform Cloud | TF_CLOUD_ORGANIZATION, TF_WORKSPACE | TF_API_TOKEN |
| Hetzner | - | HCLOUD_TOKEN |
| Vercel | - | VERCEL_TOKEN |
| Netlify | - | NETLIFY_AUTH_TOKEN |
| AWS | - | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY |

**For Hetzner + Terraform deployments:**
1. TF_CLOUD_ORGANIZATION (config) - request from user
2. TF_WORKSPACE (config) - request from user
3. TF_API_TOKEN (secret) - request from user
4. HCLOUD_TOKEN (secret) - request from user
5. SSH_PRIVATE_KEY (secret) - AUTO-GENERATE, store in GitHub secrets
6. SSH_PUBLIC_KEY - AUTO-GENERATE, use in Terraform config
7. ADMIN_PASSWORD (secret) - request from user (they need to log in!)

## KEY PRINCIPLES

1. **ALWAYS VERIFY INSTANCE TYPES** - MANDATORY: Use WebSearch with year 2026 (e.g., "hetzner instance types 2026") BEFORE generating any deployment config. Never trust hardcoded values.
2. **Everything in .github/** - Self-contained deployment
3. **Idempotent** - Safe to run repeatedly
4. **Instructions with secrets** - Show step-by-step for each secret request
5. **Current year is 2026** - Always include this in search queries for up-to-date documentation
`;

  // If specific provider requested, filter to just that section
  if (provider) {
    const providerLower = provider.toLowerCase();
    const providerSections = {
      'vercel': 'Vercel',
      'netlify': 'Netlify',
      'cloudflare': 'Cloudflare',
      'railway': 'Railway',
      'fly': 'Fly.io',
      'fly.io': 'Fly.io',
      'hetzner': 'Hetzner',
      'digitalocean': 'DigitalOcean',
      'aws': 'AWS',
      'gcp': 'GCP'
    };

    if (providerSections[providerLower]) {
      return `# ${providerSections[providerLower]} Deployment Instructions\n\n` +
        `See full guide for details. Key points:\n` +
        `- Use WebSearch to verify current instance types/APIs\n` +
        `- Request secrets via request_user_input with instructions\n` +
        `- Put all config in .github/ folder\n\n` +
        fullGuide;
    }
  }

  return fullGuide;
}
