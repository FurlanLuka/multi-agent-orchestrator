#!/usr/bin/env node
/**
 * MCP server for the Designer Agent workflow.
 * Provides tools for UI control during the design process:
 * - request_user_input: Unlock chat input for user response
 * - show_category_selector: Display category selection cards
 * - show_theme_preview: Display theme options overlay (colors + typography colors)
 * - show_component_preview: Display component style options overlay
 * - show_mockup_preview: Display full-page mockup options overlay
 * - save_design: Save the final design to filesystem
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
      serverInfo: { name: 'designer-agent', version: '1.0.0' }
    });
  }
  else if (method === 'tools/list') {
    respond(id, {
      tools: [
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
          name: 'start_generating',
          description: 'Signal that you are starting to generate design options. Call this BEFORE you start generating themes, components, or mockups. This shows a loading indicator to the user.',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['theme', 'component', 'mockup'],
                description: 'What type of design you are generating'
              }
            },
            required: ['type']
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
        {
          name: 'show_theme_preview',
          description: 'Display a full-screen overlay with theme options. Each option shows primary/neutral color scales, typography colors, and surface colors. The user can select one or provide feedback for refinement.',
          inputSchema: {
            type: 'object',
            properties: {
              options: {
                type: 'array',
                description: 'Array of theme options to display',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique identifier for this option' },
                    name: { type: 'string', description: 'Display name (e.g., "Ocean Breeze")' },
                    description: { type: 'string', description: 'Brief description of the theme' },
                    colors: {
                      type: 'object',
                      description: 'Theme color tokens',
                      properties: {
                        primary: { type: 'array', description: 'Array of 10 hex colors for primary scale (light to dark)', items: { type: 'string' } },
                        neutral: { type: 'array', description: 'Array of 10 hex colors for neutral gray scale (light to dark)', items: { type: 'string' } },
                        background: { type: 'string', description: 'Page background color' },
                        surface: { type: 'string', description: 'Card/modal background color' },
                        surfaceElevated: { type: 'string', description: 'Elevated surface color' },
                        border: { type: 'string', description: 'Default border color' },
                        success: { type: 'string' },
                        warning: { type: 'string' },
                        error: { type: 'string' },
                        info: { type: 'string' },
                        successBg: { type: 'string' },
                        warningBg: { type: 'string' },
                        errorBg: { type: 'string' },
                        infoBg: { type: 'string' }
                      },
                      required: ['primary', 'neutral', 'background', 'surface', 'border', 'success', 'warning', 'error', 'info']
                    },
                    typographyColors: {
                      type: 'object',
                      description: 'Text color tokens',
                      properties: {
                        heading: { type: 'string', description: 'Heading text color' },
                        body: { type: 'string', description: 'Body text color' },
                        muted: { type: 'string', description: 'Muted/neutral text color' },
                        link: { type: 'string', description: 'Link color' },
                        linkHover: { type: 'string', description: 'Link hover color' },
                        onPrimary: { type: 'string', description: 'Text on primary background' },
                        onSecondary: { type: 'string', description: 'Text on neutral background' },
                        disabled: { type: 'string', description: 'Disabled text color' }
                      },
                      required: ['heading', 'body', 'muted', 'link', 'linkHover', 'onPrimary', 'onSecondary', 'disabled']
                    },
                    previewHtml: { type: 'string', description: 'Pre-rendered HTML preview using theme-template.html' }
                  },
                  required: ['id', 'name', 'description', 'colors', 'typographyColors', 'previewHtml']
                }
              }
            },
            required: ['options']
          }
        },
        {
          name: 'show_component_preview',
          description: 'Display a full-screen overlay with component style options. Each option shows buttons, inputs, cards, and badges with different styling. The user can select one or provide feedback for refinement.',
          inputSchema: {
            type: 'object',
            properties: {
              options: {
                type: 'array',
                description: 'Array of component style options to display',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique identifier for this option' },
                    name: { type: 'string', description: 'Display name (e.g., "Rounded Modern")' },
                    description: { type: 'string', description: 'Brief description of the style' },
                    components: { type: 'object', description: 'Component style tokens' },
                    typography: { type: 'object', description: 'Typography tokens' },
                    effects: { type: 'object', description: 'Effect tokens (shadows, radii)' },
                    previewHtml: { type: 'string', description: 'Pre-rendered HTML preview using components-template.html' }
                  },
                  required: ['id', 'name', 'description', 'previewHtml']
                }
              }
            },
            required: ['options']
          }
        },
        {
          name: 'show_mockup_preview',
          description: 'Display a full-screen overlay with full-page mockup options. IMPORTANT: Call save_mockup_draft() for each option FIRST to save the HTML, then pass draftIndex in options instead of previewHtml. User has 3 actions: Select (auto-saves page, shows pages panel), Refine (goes back to chat), or "Feeling Lucky" (regenerate). Returns: { selected: index, pageName: string, autoSaved: true } OR { refine: index } OR { feelingLucky: true }. When autoSaved=true, the page was already saved - just respond conversationally, no need to call save_page().',
          inputSchema: {
            type: 'object',
            properties: {
              options: {
                type: 'array',
                description: 'Array of mockup options to display',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique identifier for this option' },
                    name: { type: 'string', description: 'Layout style name (e.g., "Minimal", "Magazine")' },
                    description: { type: 'string', description: 'Brief description of this layout style' },
                    styleName: { type: 'string', description: 'Reference to style from design-references.json' },
                    draftIndex: { type: 'number', description: 'Index of the draft saved via save_mockup_draft(). Frontend fetches HTML from /api/designer/draft/:index' },
                    previewHtml: { type: 'string', description: 'DEPRECATED: Use draftIndex instead. Full HTML mockup (only used if draftIndex not provided)' }
                  },
                  required: ['id', 'name', 'description']
                }
              }
            },
            required: ['options']
          }
        },
        {
          name: 'save_design',
          description: 'Save the completed design to a markdown file in the designs/ directory. Call this when the user has approved all design choices.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Design name (used for filename, e.g., "my-blog-design" -> designs/my-blog-design.md)'
              },
              tokens: {
                type: 'object',
                description: 'Complete design tokens object with colors, typography, spacing, effects, and components'
              },
              guidelines: {
                type: 'string',
                description: 'Markdown content with component guidelines and usage notes'
              }
            },
            required: ['name', 'tokens', 'guidelines']
          }
        },
        {
          name: 'save_selected_artifact',
          description: 'Save the selected artifact (theme or components) to the session folder. Call this when the user selects an option to persist it for the next phase. The HTML should contain CSS variables in a :root block that serve as design tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['theme', 'components'],
                description: 'Type of artifact being saved (theme or components)'
              },
              html: {
                type: 'string',
                description: 'The HTML content of the selected option (should include CSS variables in :root)'
              }
            },
            required: ['type', 'html']
          }
        },
        {
          name: 'save_page',
          description: 'Save a page (mockup) with a specific name. Called when user selects a mockup option. The page is saved as {name}.html in the session folder and added to the pages list.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Display name for the page (e.g., "Landing Page", "About", "Pricing")'
              },
              html: {
                type: 'string',
                description: 'The HTML content of the page (should include CSS variables in :root)'
              }
            },
            required: ['name', 'html']
          }
        },
        {
          name: 'show_pages_panel',
          description: 'Show the pages panel on the right side of chat. This displays all saved pages and allows the user to view them or add new pages.',
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
        {
          name: 'get_page_html',
          description: 'Get the HTML content of a specific page by its ID.',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: {
                type: 'string',
                description: 'The ID of the page to retrieve'
              }
            },
            required: ['pageId']
          }
        },
        {
          name: 'save_mockup_draft',
          description: 'Save a mockup draft to the session folder during generation. Returns the draft filename. Call this for each mockup option BEFORE calling show_mockup_preview. The drafts are used for fast auto-save when user selects.',
          inputSchema: {
            type: 'object',
            properties: {
              html: {
                type: 'string',
                description: 'The full HTML content of the mockup'
              },
              index: {
                type: 'number',
                description: 'The index of this mockup option (0, 1, 2, etc.)'
              }
            },
            required: ['html', 'index']
          }
        },
        {
          name: 'load_previous_artifacts',
          description: 'DEPRECATED: Use get_design_tokens instead. Loads full HTML artifacts which is wasteful.',
          inputSchema: {
            type: 'object',
            properties: {
              artifacts: {
                type: 'array',
                description: 'Array of artifact filenames to load',
                items: { type: 'string' }
              }
            },
            required: ['artifacts']
          }
        },
        {
          name: 'get_design_tokens',
          description: 'Get the CSS variables from saved theme.html as a compact string. Use this instead of load_previous_artifacts - it returns only the :root CSS block (~2k chars vs 15k for full HTML). Call this before generating components or mockups.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ]
    });
  }
  else if (method === 'tools/call' && params?.name === 'request_user_input') {
    const placeholder = params.arguments?.placeholder || '';

    const result = await callDesignerEndpoint('/api/designer/request-input', {
      sessionId: SESSION_ID,
      placeholder
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'start_generating') {
    const type = params.arguments?.type || 'palette';

    const result = await callDesignerEndpoint('/api/designer/start-generating', {
      sessionId: SESSION_ID,
      type
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'show_category_selector') {
    const result = await callDesignerEndpoint('/api/designer/show-categories', {
      sessionId: SESSION_ID
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'show_theme_preview') {
    const options = params.arguments?.options || [];

    const result = await callDesignerEndpoint('/api/designer/show-theme', {
      sessionId: SESSION_ID,
      options
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'show_component_preview') {
    const options = params.arguments?.options || [];

    const result = await callDesignerEndpoint('/api/designer/show-components', {
      sessionId: SESSION_ID,
      options
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'show_mockup_preview') {
    const options = params.arguments?.options || [];

    const result = await callDesignerEndpoint('/api/designer/show-mockups', {
      sessionId: SESSION_ID,
      options
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'save_design') {
    const { name, tokens, guidelines } = params.arguments || {};

    if (!name || !tokens || !guidelines) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required fields: name, tokens, guidelines' }) }]
      });
      return;
    }

    const result = await callDesignerEndpoint('/api/designer/save-design', {
      sessionId: SESSION_ID,
      name,
      tokens,
      guidelines
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'save_selected_artifact') {
    const { type, html } = params.arguments || {};

    if (!type || !html) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required fields: type, html' }) }]
      });
      return;
    }

    const result = await callDesignerEndpoint('/api/designer/save-artifact', {
      sessionId: SESSION_ID,
      type,
      html
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'load_previous_artifacts') {
    const { artifacts } = params.arguments || {};

    if (!artifacts || !Array.isArray(artifacts)) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required field: artifacts (array)' }) }]
      });
      return;
    }

    const result = await callDesignerEndpoint('/api/designer/load-artifacts', {
      sessionId: SESSION_ID,
      artifacts
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'save_page') {
    const { name, html } = params.arguments || {};

    if (!name || !html) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required fields: name, html' }) }]
      });
      return;
    }

    const result = await callDesignerEndpoint('/api/designer/save-page', {
      sessionId: SESSION_ID,
      name,
      html
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'show_pages_panel') {
    const result = await callDesignerEndpoint('/api/designer/show-pages-panel', {
      sessionId: SESSION_ID
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'get_pages') {
    const result = await callDesignerEndpoint('/api/designer/get-pages', {
      sessionId: SESSION_ID
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'get_page_html') {
    const { pageId } = params.arguments || {};

    if (!pageId) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required field: pageId' }) }]
      });
      return;
    }

    const result = await callDesignerEndpoint('/api/designer/get-page-html', {
      sessionId: SESSION_ID,
      pageId
    });

    respond(id, {
      content: [{ type: 'text', text: result }]
    });
  }
  else if (method === 'tools/call' && params?.name === 'save_mockup_draft') {
    const { html, index } = params.arguments || {};

    if (html === undefined || index === undefined) {
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required fields: html, index' }) }]
      });
      return;
    }

    const result = await callDesignerEndpoint('/api/designer/save-mockup-draft', {
      sessionId: SESSION_ID,
      html,
      index
    });

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
