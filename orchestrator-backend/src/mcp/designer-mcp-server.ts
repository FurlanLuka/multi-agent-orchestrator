import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Dependencies injected from the Express server for designer tools.
 */
export interface DesignerMcpDeps {
  onRequestInput: (sessionId: string, placeholder: string) => Promise<string>;
  onShowCategories: (sessionId: string) => Promise<string>;
  onStartThemeGeneration: (sessionId: string) => any;
  onShowThemePreview: (sessionId: string, options: any[]) => Promise<any>;
  onStartMockupGeneration: (sessionId: string) => any;
  onShowMockupPreview: (sessionId: string, options: any[], pageName?: string) => Promise<any>;
  onShowPagesPanel: (sessionId: string) => any;
  onGetPages: (sessionId: string) => any;
  onShowCatalogPreview: (sessionId: string, pageId: string, catalogName: string) => any;
  onSaveDesignFolder: (sessionId: string, designName: string) => Promise<any>;
}

/**
 * Creates a configured McpServer for designer tools.
 */
export function createDesignerMcpServer(
  deps: DesignerMcpDeps,
  sessionId: string
): McpServer {
  const server = new McpServer({
    name: 'designer-agent',
    version: '2.0.0',
  });

  // Tool 1: request_user_input
  server.registerTool(
    'request_user_input',
    {
      description: 'Unlock the chat input field so the user can type a response.',
      inputSchema: {
        placeholder: z.string().optional().describe('Optional placeholder text'),
      },
    },
    async ({ placeholder }) => {
      const message = await deps.onRequestInput(sessionId, placeholder || '');
      return { content: [{ type: 'text' as const, text: message }] };
    }
  );

  // Tool 2: show_category_selector
  server.registerTool(
    'show_category_selector',
    {
      description: 'Display category selection cards for the user to choose what they are building.',
    },
    async () => {
      const result = await deps.onShowCategories(sessionId);
      return { content: [{ type: 'text' as const, text: result }] };
    }
  );

  // Tool 3: start_theme_generation
  server.registerTool(
    'start_theme_generation',
    {
      description: `Start theme generation phase. Returns paths for you to use with Read/Write tools.

WORKFLOW:
1. Call this tool to get paths
2. Read the template: Read(templatePath)
3. Generate 3 theme variations as CSS variables only (:root { ... })
4. Write each to the output directory
5. Call show_theme_preview() to display options

IMPORTANT: Only write CSS variables, not full HTML.`,
    },
    async () => {
      const result = deps.onStartThemeGeneration(sessionId);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  // Tool 4: show_theme_preview
  server.registerTool(
    'show_theme_preview',
    {
      description: `Display theme options to the user. Returns { selected, autoSaved }, { refine, cssPath }, or { feedback }.`,
      inputSchema: {
        options: z.array(z.object({
          id: z.string().describe('Unique identifier'),
          name: z.string().describe('Display name'),
          description: z.string().describe('Brief description'),
        })).describe('Metadata for each theme option'),
      },
    },
    async ({ options }) => {
      if (!Array.isArray(options)) {
        return { content: [{ type: 'text' as const, text: 'options must be an array' }] };
      }
      const result = await deps.onShowThemePreview(sessionId, options);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  // Tool 5: start_mockup_generation
  server.registerTool(
    'start_mockup_generation',
    {
      description: `Start mockup generation phase. Returns themePath, outputDir, existingPages.`,
    },
    async () => {
      const result = deps.onStartMockupGeneration(sessionId);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  // Tool 6: show_mockup_preview
  server.registerTool(
    'show_mockup_preview',
    {
      description: `Display mockup options to the user. Returns { selected, pageName, autoSaved }, { refine, htmlPath }, or { feelingLucky }.`,
      inputSchema: {
        pageName: z.string().describe('The actual page name (e.g., "Dashboard", "Pricing")'),
        options: z.array(z.object({
          id: z.string(),
          name: z.string().describe('Style variation name'),
          description: z.string().describe('Description of this style variation'),
        })).describe('Metadata for each mockup style variation'),
      },
    },
    async ({ pageName, options }) => {
      if (!Array.isArray(options)) {
        return { content: [{ type: 'text' as const, text: 'options must be an array' }] };
      }
      const result = await deps.onShowMockupPreview(sessionId, options, pageName);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  // Tool 7: show_pages_panel
  server.registerTool(
    'show_pages_panel',
    {
      description: 'Show the pages panel on the right side of chat.',
    },
    async () => {
      const result = deps.onShowPagesPanel(sessionId);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  // Tool 8: get_pages
  server.registerTool(
    'get_pages',
    {
      description: 'Get the list of all pages saved in the current session.',
    },
    async () => {
      const result = deps.onGetPages(sessionId);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  // Tool 9: show_catalog_preview
  server.registerTool(
    'show_catalog_preview',
    {
      description: 'Tell the frontend to show a catalog preview for a page.',
      inputSchema: {
        pageId: z.string().describe('The page ID to show the catalog for'),
        catalogName: z.string().describe('The catalog filename'),
      },
    },
    async ({ pageId, catalogName }) => {
      if (!pageId || !catalogName) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Missing required fields' }) }] };
      }
      const result = deps.onShowCatalogPreview(sessionId, pageId, catalogName);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  // Tool 10: save_design_folder
  server.registerTool(
    'save_design_folder',
    {
      description: 'Save the completed design to a named folder in the designs library.',
      inputSchema: {
        name: z.string().describe('Design name (used for folder name)'),
      },
    },
    async ({ name }) => {
      if (!name) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Missing required field: name' }) }] };
      }
      const result = await deps.onSaveDesignFolder(sessionId, name);
      return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  return server;
}
