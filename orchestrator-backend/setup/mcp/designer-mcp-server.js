#!/usr/bin/env node
/**
 * MCP server for the Designer Agent workflow.
 *
 * Zero-HTML Architecture: MCP tools only pass paths and metadata.
 * Claude uses native Read/Write tools for all file operations.
 *
 * Tools:
 * - request_user_input: Unlock chat input for user response
 * - show_category_selector: Display category selection cards
 * - start_theme_generation: Get paths for theme CSS generation
 * - show_theme_preview: Display theme options, auto-saves on selection
 * - start_component_generation: Get paths for component HTML generation
 * - show_component_preview: Display component options, auto-saves on selection
 * - start_mockup_generation: Get paths for mockup HTML generation
 * - show_mockup_preview: Display mockup options, auto-saves on selection
 *
 * This server implements the MCP protocol and communicates with the
 * orchestrator backend via HTTP endpoints.
 */

const http = require('http');
const readline = require('readline');

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3456';
const SESSION_ID = process.env.DESIGNER_SESSION_ID || 'unknown';

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
      serverInfo: { name: 'designer-agent', version: '2.0.0' }
    });
  }
  else if (method === 'tools/list') {
    respond(id, {
      tools: [
        // ═══════════════════════════════════════════════════════════════
        // User Interaction Tools
        // ═══════════════════════════════════════════════════════════════
        {
          name: 'request_user_input',
          description: 'Unlock the chat input field so the user can type a response. Call this whenever you need the user to provide text input. The input will be locked again after the user submits their message.',
          inputSchema: {
            type: 'object',
            properties: {
              placeholder: {
                type: 'string',
                description: 'Optional placeholder text to show in the input field'
              }
            },
            required: []
          }
        },
        {
          name: 'show_category_selector',
          description: 'Display category selection cards for the user to choose what they are building (blog, landing page, dashboard, etc.). Returns the selected category.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },

        // ═══════════════════════════════════════════════════════════════
        // Theme Generation (CSS-only approach)
        // ═══════════════════════════════════════════════════════════════
        {
          name: 'start_theme_generation',
          description: `Start theme generation phase. Returns paths for you to use with Read/Write tools.

WORKFLOW:
1. Call this tool to get paths
2. Read the template: Read(templatePath)
3. Generate 3 theme variations as CSS variables only (:root { ... })
4. Write each to the output directory:
   - Write(outputDir + "/theme-0.css", cssVariables1)
   - Write(outputDir + "/theme-1.css", cssVariables2)
   - Write(outputDir + "/theme-2.css", cssVariables3)
5. Call show_theme_preview() to display options

IMPORTANT: Only write CSS variables, not full HTML. The backend injects your CSS into the template for preview.`,
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'show_theme_preview',
          description: `Display theme options to the user. Backend reads CSS from drafts dir and injects into template.

Returns one of:
- { selected: number, autoSaved: true } - User selected option, already saved to theme.css
- { refine: number, cssPath: string } - User wants to refine. Read the CSS from cssPath, ask what to change, update it
- { feedback: string } - User wants to explain more

When autoSaved=true, just respond conversationally.
When refine is set, use Read(cssPath) to get current CSS, ask user what to change, then Write updated CSS back to same path.`,
          inputSchema: {
            type: 'object',
            properties: {
              options: {
                type: 'array',
                description: 'Metadata for each theme option (names/descriptions only, no HTML)',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique identifier (e.g., "theme-0")' },
                    name: { type: 'string', description: 'Display name (e.g., "Ocean Breeze")' },
                    description: { type: 'string', description: 'Brief description of the theme' }
                  },
                  required: ['id', 'name', 'description']
                }
              }
            },
            required: ['options']
          }
        },

        // ═══════════════════════════════════════════════════════════════
        // Component Generation (HTML approach, uses theme CSS)
        // ═══════════════════════════════════════════════════════════════
        {
          name: 'start_component_generation',
          description: `Start component generation phase. Returns paths for you to use with Read/Write tools.

WORKFLOW:
1. Call this tool to get paths
2. Read the saved theme CSS: Read(themePath)
3. Generate 3 component variations as complete HTML documents
   - Include the theme CSS variables in each HTML's <style>
   - Show buttons, inputs, cards, badges, alerts, etc.
4. Write each to the output directory:
   - Write(outputDir + "/component-0.html", html1)
   - Write(outputDir + "/component-1.html", html2)
   - Write(outputDir + "/component-2.html", html3)
5. Call show_component_preview() to display options`,
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'show_component_preview',
          description: `Display component options to the user. Backend serves HTML directly from drafts dir.

Returns one of:
- { selected: number, autoSaved: true } - User selected, saved to components.html
- { refine: number, htmlPath: string } - User wants to refine. Read HTML from htmlPath, ask what to change, update it
- { feedback: string } - User wants to explain more

When autoSaved=true, just respond conversationally.
When refine is set, use Read(htmlPath) to get current HTML, ask user what to change, then Write updated HTML back.`,
          inputSchema: {
            type: 'object',
            properties: {
              options: {
                type: 'array',
                description: 'Metadata for each component style option',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string', description: 'Style name (e.g., "Rounded Modern")' },
                    description: { type: 'string' }
                  },
                  required: ['id', 'name', 'description']
                }
              }
            },
            required: ['options']
          }
        },

        // ═══════════════════════════════════════════════════════════════
        // Mockup Generation (HTML approach, uses theme + components)
        // ═══════════════════════════════════════════════════════════════
        {
          name: 'start_mockup_generation',
          description: `Start mockup generation phase. Returns paths for you to use with Read/Write tools.

RETURNS:
- themePath: Path to saved theme.css
- componentsPath: Path to saved components.html
- outputDir: Directory to write mockup drafts
- existingPages: Array of previously saved pages (for design consistency)
  Each page has: { name, filename, path }

WORKFLOW:
1. Call this tool to get paths
2. Read the saved theme: Read(themePath)
3. Read the saved components for reference: Read(componentsPath)
4. If existingPages has items, read them too to match the design style
5. Generate 3 full-page mockup variations as complete HTML
   - Include the theme CSS variables
   - Use component patterns from components.html
   - Match the style of existing pages if any
6. Write each to the output directory:
   - Write(outputDir + "/mockup-0.html", html1)
   - Write(outputDir + "/mockup-1.html", html2)
   - Write(outputDir + "/mockup-2.html", html3)
7. Call show_mockup_preview() with pageName (what the page IS, e.g., "Dashboard")`,
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'show_mockup_preview',
          description: `Display mockup options to the user. Backend serves HTML from drafts dir.

Returns one of:
- { selected: number, pageName: string, autoSaved: true } - Saved as page
- { refine: number, htmlPath: string } - User wants to refine. Read HTML from htmlPath, ask what to change, update it
- { feelingLucky: true } - Generate 3 new options

When autoSaved=true, the page is already saved. Just respond conversationally.
When refine is set, use Read(htmlPath) to get current HTML, ask user what to change, then Write updated HTML back.`,
          inputSchema: {
            type: 'object',
            properties: {
              pageName: {
                type: 'string',
                description: 'The actual page name (e.g., "Dashboard", "Pricing", "Landing Page"). This is what the page will be saved as, NOT the style variation name.'
              },
              options: {
                type: 'array',
                description: 'Metadata for each mockup style variation',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string', description: 'Style variation name (e.g., "Minimal", "Card-Heavy", "Data-Dense")' },
                    description: { type: 'string', description: 'Description of this style variation' }
                  },
                  required: ['id', 'name', 'description']
                }
              }
            },
            required: ['pageName', 'options']
          }
        },

        // ═══════════════════════════════════════════════════════════════
        // Pages Management
        // ═══════════════════════════════════════════════════════════════
        {
          name: 'show_pages_panel',
          description: 'Show the pages panel on the right side of chat. Displays all saved pages.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'get_pages',
          description: 'Get the list of all pages saved in the current session.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },

        // ═══════════════════════════════════════════════════════════════
        // Design Completion
        // ═══════════════════════════════════════════════════════════════
        {
          name: 'save_design_folder',
          description: 'Save the completed design to a named folder in the designs library. Copies all artifacts (theme.css, components.html, pages) and generates AGENTS.md.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Design name (used for folder name, e.g., "My Blog Design")'
              }
            },
            required: ['name']
          }
        }
      ]
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Tool Handlers
  // ═══════════════════════════════════════════════════════════════

  else if (method === 'tools/call' && params?.name === 'request_user_input') {
    const placeholder = params.arguments?.placeholder || '';
    const result = await callDesignerEndpoint('/api/designer/request-input', {
      sessionId: SESSION_ID,
      placeholder
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  else if (method === 'tools/call' && params?.name === 'show_category_selector') {
    const result = await callDesignerEndpoint('/api/designer/show-categories', {
      sessionId: SESSION_ID
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  // ═══════════════════════════════════════════════════════════════
  // Theme Generation
  // ═══════════════════════════════════════════════════════════════

  else if (method === 'tools/call' && params?.name === 'start_theme_generation') {
    const result = await callDesignerEndpoint('/api/designer/start-theme-generation', {
      sessionId: SESSION_ID
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  else if (method === 'tools/call' && params?.name === 'show_theme_preview') {
    const options = params.arguments?.options || [];
    const result = await callDesignerEndpoint('/api/designer/show-theme-preview', {
      sessionId: SESSION_ID,
      options
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  // ═══════════════════════════════════════════════════════════════
  // Component Generation
  // ═══════════════════════════════════════════════════════════════

  else if (method === 'tools/call' && params?.name === 'start_component_generation') {
    const result = await callDesignerEndpoint('/api/designer/start-component-generation', {
      sessionId: SESSION_ID
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  else if (method === 'tools/call' && params?.name === 'show_component_preview') {
    const options = params.arguments?.options || [];
    const result = await callDesignerEndpoint('/api/designer/show-component-preview', {
      sessionId: SESSION_ID,
      options
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  // ═══════════════════════════════════════════════════════════════
  // Mockup Generation
  // ═══════════════════════════════════════════════════════════════

  else if (method === 'tools/call' && params?.name === 'start_mockup_generation') {
    const result = await callDesignerEndpoint('/api/designer/start-mockup-generation', {
      sessionId: SESSION_ID
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  else if (method === 'tools/call' && params?.name === 'show_mockup_preview') {
    const options = params.arguments?.options || [];
    const result = await callDesignerEndpoint('/api/designer/show-mockup-preview', {
      sessionId: SESSION_ID,
      options
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  // ═══════════════════════════════════════════════════════════════
  // Pages Management
  // ═══════════════════════════════════════════════════════════════

  else if (method === 'tools/call' && params?.name === 'show_pages_panel') {
    const result = await callDesignerEndpoint('/api/designer/show-pages-panel', {
      sessionId: SESSION_ID
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  else if (method === 'tools/call' && params?.name === 'get_pages') {
    const result = await callDesignerEndpoint('/api/designer/get-pages', {
      sessionId: SESSION_ID
    });
    respond(id, { content: [{ type: 'text', text: result }] });
  }

  // ═══════════════════════════════════════════════════════════════
  // Design Completion
  // ═══════════════════════════════════════════════════════════════

  else if (method === 'tools/call' && params?.name === 'save_design_folder') {
    const { name } = params.arguments || {};
    if (!name) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required field: name' }) }]
      });
      return;
    }
    const result = await callDesignerEndpoint('/api/designer/save-design-folder', {
      sessionId: SESSION_ID,
      designName: name
    });
    respond(id, { content: [{ type: 'text', text: result }] });
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

/**
 * Call a designer endpoint on the orchestrator backend
 * @param {string} endpoint - The API endpoint path
 * @param {object} data - The data to send
 * @returns {Promise<string>} The response body
 */
function callDesignerEndpoint(endpoint, data) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(data);
    const url = new URL(`${ORCHESTRATOR_URL}${endpoint}`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 600000  // 10 minute timeout for user interactions
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve(body || JSON.stringify({ error: 'No response from orchestrator' }));
      });
    });

    req.on('error', (err) => {
      resolve(JSON.stringify({ error: `Could not reach orchestrator: ${err.message}` }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(JSON.stringify({ error: 'Request timeout' }));
    });

    req.write(postData);
    req.end();
  });
}
