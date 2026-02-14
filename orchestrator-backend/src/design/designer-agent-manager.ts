import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import {
  DesignSession,
  DesignPhase,
  DesignCategory,
  DesignPage,
  ThemeMode,
  DesignTokens,
  PaletteOption,
  MockupOption,
  MockupSelectionResult,
  ChatStreamEvent,
  ContentBlock,
  SavedDesignFolder,
  SavedDesignFolderContents,
} from '@orchy/types';
import { spawnWithShellEnv } from '../utils/shell-env';
import { getCacheDir, getConfigDir, ensureDesignSessionDir, getDesignArtifactPath, getDesignTemplatesDir } from '../config/paths';
import { getDesignerSystemPrompt, getDesignerEditModePrompt } from './design-prompts';

/**
 * Session paths for the Zero-HTML MCP Architecture.
 * MCP tools only pass paths - Claude uses native Read/Write for file operations.
 */
interface SessionPaths {
  root: string;           // ~/.orchy-config/design-sessions/{sessionId}/
  drafts: string;         // ~/.orchy-config/design-sessions/{sessionId}/drafts/
  themeTemplate: string;  // ~/.orchy-config/design-sessions/{sessionId}/theme-template.html
}

// Stream JSON message types from Claude CLI
interface StreamJsonContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface StreamJsonMessage {
  type: 'system' | 'assistant' | 'result' | 'error';
  subtype?: string;
  message?: {
    id?: string;
    content?: StreamJsonContentBlock[];
  };
  result?: string;
  is_error?: boolean;
}

/**
 * Designer Agent Manager - handles the design-first workflow
 *
 * This manager spawns a persistent Claude session that guides users through
 * an iterative design process using MCP tools to control the UI.
 *
 * Phases:
 * 1. Discovery - Chat conversation + category selection
 * 2. Preferences - Theme mode (light/dark/both)
 * 3. Palette - Generate and iterate on color palettes
 * 4. Components - Generate and iterate on component styles
 * 5. Mockups - Generate full-page mockups
 * 6. Complete - Save design to filesystem
 */
export class DesignerAgentManager extends EventEmitter {
  private currentProcess: ChildProcess | null = null;
  private session: DesignSession | null = null;

  // Session paths for Zero-HTML MCP Architecture
  private sessionPaths: SessionPaths | null = null;

  // Pending response resolvers (for MCP tool calls)
  private pendingUserInput: ((message: string) => void) | null = null;
  private pendingCategorySelection: ((category: DesignCategory) => void) | null = null;
  private pendingPreviewSelection: ((result: { selected?: number; feedback?: string }) => void) | null = null;
  private pendingMockupSelection: ((result: MockupSelectionResult) => void) | null = null;
  private pendingSummaryResponse: ((result: 'proceed' | 'continue') => void) | null = null;

  // Draft mockup storage - stores HTML during generation for fast selection
  private currentMockupDrafts: string[] = [];

  // Current mockup page name from show_mockup_preview (agent-suggested)
  private currentMockupPageName: string | null = null;

  // Session timeout
  private static readonly SESSION_TIMEOUT = 3600000; // 1 hour

  constructor() {
    super();
  }

  /**
   * Get the current design session
   */
  getSession(): DesignSession | null {
    return this.session;
  }

  /**
   * Start a new design session
   * @param category - Optional pre-selected category
   */
  async startSession(category?: DesignCategory): Promise<DesignSession> {
    // End any existing session first
    if (this.currentProcess || this.session) {
      console.log('[DesignerAgent] Ending previous session before starting new one');
      await this.endSession();
    }

    // Create new session
    const sessionId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.session = {
      id: sessionId,
      startedAt: Date.now(),
      phase: 'discovery',
      category: category,
      pages: [],  // Initialize empty pages array
    };

    console.log(`[DesignerAgent] Starting session: ${sessionId}${category ? ` with category: ${category}` : ''}`);

    // Setup session folder and copy templates (Zero-HTML Architecture)
    this.setupSessionFolder(sessionId);

    // Emit session started event
    this.emit('sessionStarted', this.session);

    // Start the Claude process with MCP
    await this.spawnDesignerAgent(category);

    return this.session;
  }

  /**
   * Setup session folder structure and copy templates.
   * Zero-HTML Architecture: MCP tools only pass paths, Claude uses Read/Write.
   */
  private setupSessionFolder(sessionId: string): void {
    const sessionDir = ensureDesignSessionDir(sessionId);
    const draftsDir = path.join(sessionDir, 'drafts');

    // Create drafts subfolder
    if (!fs.existsSync(draftsDir)) {
      fs.mkdirSync(draftsDir, { recursive: true });
    }

    // Copy theme template from setup directory (handles pkg bundling)
    const templatesDir = getDesignTemplatesDir();
    const themeTemplateSrc = path.join(templatesDir, 'theme-template.html');
    const themeTemplateDest = path.join(sessionDir, 'theme-template.html');

    if (fs.existsSync(themeTemplateSrc)) {
      fs.copyFileSync(themeTemplateSrc, themeTemplateDest);
      console.log(`[DesignerAgent] Copied theme template to: ${themeTemplateDest}`);
    } else {
      console.warn(`[DesignerAgent] Theme template not found at: ${themeTemplateSrc}`);
    }

    // Store paths for MCP tools
    this.sessionPaths = {
      root: sessionDir,
      drafts: draftsDir,
      themeTemplate: themeTemplateDest,
    };

    console.log(`[DesignerAgent] Session folder setup complete: ${sessionDir}`);
  }

  /**
   * Get session paths for MCP tools
   */
  getSessionPaths(): SessionPaths | null {
    return this.sessionPaths;
  }

  /**
   * End the current design session
   */
  async endSession(): Promise<void> {
    const sessionId = this.session?.id;
    const proc = this.currentProcess;

    if (proc) {
      console.log('[DesignerAgent] Ending session, sending SIGTERM');
      proc.kill('SIGTERM');

      // Force kill after 5 seconds if process doesn't respond
      const forceKillTimeout = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          console.log('[DesignerAgent] Process not responding, sending SIGKILL');
          proc.kill('SIGKILL');
        }
      }, 5000);

      proc.once('exit', () => clearTimeout(forceKillTimeout));
      this.currentProcess = null;
    }

    this.session = null;
    this.pendingUserInput = null;
    this.pendingCategorySelection = null;
    this.pendingPreviewSelection = null;
    this.pendingMockupSelection = null;
    this.pendingSummaryResponse = null;

    this.emit('sessionEnded', { sessionId });
  }

  /**
   * Generate MCP config file for the designer agent
   */
  private generateDesignerMcpConfig(): string {
    const cacheDir = getCacheDir();
    const configPath = path.join(cacheDir, 'designer-mcp-config.json');

    // Path to designer MCP server
    const mcpServerPath = this.getDesignerMcpServerPath();

    const config = {
      mcpServers: {
        'designer': {
          command: 'node',
          args: [mcpServerPath],
          env: {
            ORCHESTRATOR_URL: 'http://localhost:3456',
            DESIGNER_SESSION_ID: this.session!.id,
          }
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  /**
   * Get path to the designer MCP server
   */
  private getDesignerMcpServerPath(): string {
    // In development, use source directly
    const isDev = process.env.NODE_ENV === 'development' || process.env.ORCHESTRATOR_DEV === 'true';

    if (isDev) {
      return path.join(__dirname, '..', '..', 'setup', 'mcp', 'designer-mcp-server.js');
    }

    // In production, extract to cache
    const cacheDir = getCacheDir();
    const mcpDir = path.join(cacheDir, 'mcp');
    const extractedPath = path.join(mcpDir, 'designer-mcp-server.js');

    // Ensure directory exists
    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }

    // Copy if needed
    const bundledPath = path.join(__dirname, '..', '..', 'setup', 'mcp', 'designer-mcp-server.js');
    if (!fs.existsSync(extractedPath) || this.needsUpdate(bundledPath, extractedPath)) {
      const content = fs.readFileSync(bundledPath, 'utf-8');
      fs.writeFileSync(extractedPath, content, { mode: 0o755 });
      console.log(`[DesignerAgent] Copied MCP server to: ${extractedPath}`);
    }

    return extractedPath;
  }

  /**
   * Check if extracted file needs update
   */
  private needsUpdate(src: string, dest: string): boolean {
    try {
      const srcContent = fs.readFileSync(src, 'utf-8');
      const destContent = fs.readFileSync(dest, 'utf-8');
      return srcContent !== destContent;
    } catch {
      return true;
    }
  }

  /**
   * Spawn the designer Claude agent with MCP server
   * @param category - Optional pre-selected category to include in prompt
   * @param editContext - Optional edit context for editing existing designs
   */
  private async spawnDesignerAgent(category?: DesignCategory, editContext?: { designName: string; pages: DesignPage[] }): Promise<void> {
    if (!this.session) {
      throw new Error('No active session');
    }

    const systemPrompt = editContext
      ? getDesignerEditModePrompt(editContext.designName, editContext.pages)
      : getDesignerSystemPrompt(category);
    const mcpConfigPath = this.generateDesignerMcpConfig();

    const args = [
      '-p', systemPrompt,
      '--model', 'opus',
      '--output-format', 'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--dangerously-skip-permissions',
      '--mcp-config', mcpConfigPath
    ];

    // Environment variables for MCP server
    const extraEnv = {
      ORCHESTRATOR_URL: 'http://localhost:3456',
      DESIGNER_SESSION_ID: this.session.id,
    };

    const proc = await spawnWithShellEnv('claude', {
      cwd: process.cwd(),
      args: args,
      extraEnv: extraEnv,
    });

    this.currentProcess = proc;
    console.log('[DesignerAgent] Process spawned, PID:', proc.pid);

    // Handle process output
    this.handleProcessOutput(proc);

    // Handle process exit
    proc.on('exit', (code, signal) => {
      console.log(`[DesignerAgent] Process exited (code: ${code}, signal: ${signal})`);
      this.currentProcess = null;

      if (this.session) {
        this.emit('sessionEnded', { sessionId: this.session.id });
      }
    });

    proc.on('error', (err) => {
      console.error('[DesignerAgent] Process error:', err);
      this.currentProcess = null;
      this.emit('error', err);
    });
  }

  /**
   * Handle streaming output from Claude process
   */
  private handleProcessOutput(proc: ChildProcess): void {
    let partialLine = '';
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const contentBlocks: ContentBlock[] = [];

    // Emit message start
    const startEvent: ChatStreamEvent = {
      type: 'message_start',
      messageId,
    };
    this.emit('stream', startEvent);

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = partialLine + chunk.toString();
      const lines = text.split('\n');
      partialLine = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const msg: StreamJsonMessage = JSON.parse(line);

          switch (msg.type) {
            case 'system':
              if (msg.subtype === 'init') {
                console.log('[DesignerAgent] Process initialized');
              }
              break;

            case 'assistant':
              if (msg.message?.content) {
                for (const block of msg.message.content) {
                  let contentBlock: ContentBlock | null = null;

                  if (block.type === 'text' && block.text) {
                    contentBlock = { type: 'text', text: block.text };

                    // Emit agent message event
                    this.emit('agentMessage', block.text);
                  } else if (block.type === 'tool_use' && block.id && block.name) {
                    contentBlock = {
                      type: 'tool_use',
                      id: block.id,
                      name: block.name,
                      input: block.input || {}
                    };

                    // Update phase based on tool calls
                    this.updatePhaseFromTool(block.name);
                  } else if (block.type === 'tool_result' && block.tool_use_id) {
                    contentBlock = {
                      type: 'tool_result',
                      tool_use_id: block.tool_use_id,
                      content: block.content || '',
                      is_error: block.is_error
                    };
                  } else if (block.type === 'thinking' && block.thinking) {
                    contentBlock = { type: 'thinking', thinking: block.thinking };
                  }

                  if (contentBlock) {
                    contentBlocks.push(contentBlock);
                    const blockEvent: ChatStreamEvent = {
                      type: 'content_block',
                      messageId,
                      block: contentBlock
                    };
                    this.emit('stream', blockEvent);
                  }
                }
              }
              break;

            case 'result':
              console.log(`[DesignerAgent] Got result`);
              break;

            case 'error':
              console.error('[DesignerAgent] Error from Claude:', msg);
              const errorEvent: ChatStreamEvent = {
                type: 'error',
                messageId,
                error: 'Claude error'
              };
              this.emit('stream', errorEvent);
              break;
          }
        } catch {
          // Not JSON - skip
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      console.error('[DesignerAgent] STDERR:', text.substring(0, 200));
    });
  }

  /**
   * Update session phase based on tool calls
   */
  private updatePhaseFromTool(toolName: string): void {
    if (!this.session) return;

    // Strip MCP prefix if present (e.g., "mcp__designer__show_theme_preview" → "show_theme_preview")
    const baseName = toolName.replace(/^mcp__designer__/, '');

    let newPhase: DesignPhase | null = null;

    switch (baseName) {
      case 'show_category_selector':
        newPhase = 'discovery';
        break;
      case 'show_theme_preview':
        newPhase = 'theme';
        break;
      case 'show_mockup_preview':
        newPhase = 'mockups';
        break;
      case 'save_design':
        newPhase = 'complete';
        break;
    }

    if (newPhase && newPhase !== this.session.phase) {
      this.session.phase = newPhase;
      this.emit('phaseUpdate', {
        phase: newPhase,
        step: this.getPhaseStep(newPhase)
      });
    }
  }

  /**
   * Get numeric step for a phase (1-7)
   */
  private getPhaseStep(phase: DesignPhase): number {
    const steps: Record<DesignPhase, number> = {
      discovery: 1,
      summary: 2,
      theme: 3,
      mockups: 4,
      pages: 5,
      complete: 6,
    };
    return steps[phase] || 1;
  }

  // ═══════════════════════════════════════════════════════════════
  // HTTP Handlers for MCP Tool Calls
  // These are called by the UI server when the MCP server makes requests
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle request_user_input MCP tool call
   * Emits event to unlock input, returns when user submits message
   */
  async handleRequestUserInput(placeholder?: string): Promise<string> {
    return new Promise((resolve) => {
      this.pendingUserInput = resolve;

      // Emit unlock event to frontend
      this.emit('unlockInput', { placeholder });
    });
  }

  /**
   * Called when user submits a message
   */
  onUserMessage(message: string): void {
    if (this.pendingUserInput) {
      const resolve = this.pendingUserInput;
      this.pendingUserInput = null;

      // Emit lock event
      this.emit('lockInput');

      resolve(message);
    }
  }

  /**
   * Handle show_category_selector MCP tool call
   */
  async handleShowCategorySelector(): Promise<DesignCategory> {
    return new Promise((resolve) => {
      this.pendingCategorySelection = resolve;

      // Emit show categories event
      this.emit('showCategorySelector', {
        categories: this.getCategoryList()
      });
    });
  }

  /**
   * Called when user selects a category
   */
  onCategorySelected(category: DesignCategory): void {
    if (this.pendingCategorySelection) {
      const resolve = this.pendingCategorySelection;
      this.pendingCategorySelection = null;

      if (this.session) {
        this.session.category = category;
      }

      resolve(category);
    }
  }

  /**
   * Handle show_palette_preview MCP tool call
   */
  async handleShowPalettePreview(options: PaletteOption[]): Promise<{ selected?: number; feedback?: string }> {
    return new Promise((resolve) => {
      this.pendingPreviewSelection = resolve;

      // Emit show preview event
      this.emit('showPreview', {
        type: 'palette',
        options
      });
    });
  }

  /**
   * Called when user selects a preview option (for theme previews)
   */
  onOptionSelected(index: number): void {
    if (this.pendingPreviewSelection) {
      const resolve = this.pendingPreviewSelection;
      this.pendingPreviewSelection = null;
      resolve({ selected: index });
    }
  }

  /**
   * Called when user submits feedback for refinement
   */
  onFeedbackSubmitted(feedback: string): void {
    if (this.pendingPreviewSelection) {
      const resolve = this.pendingPreviewSelection;
      this.pendingPreviewSelection = null;
      resolve({ feedback });
    }
  }

  /**
   * Handle show_discovery_summary MCP tool call
   * Shows summary to user, returns 'proceed' or 'continue'
   */
  async handleShowDiscoverySummary(summary: string): Promise<'proceed' | 'continue'> {
    return new Promise((resolve) => {
      this.pendingSummaryResponse = resolve;

      // Update phase
      if (this.session) {
        this.session.phase = 'summary';
      }

      // Emit show summary event
      this.emit('showSummary', { summary });
    });
  }

  /**
   * Called when user clicks "Proceed" from summary
   */
  onProceedFromSummary(): void {
    if (this.pendingSummaryResponse) {
      const resolve = this.pendingSummaryResponse;
      this.pendingSummaryResponse = null;
      resolve('proceed');
    }
  }

  /**
   * Called when user clicks "Continue Iterating" from summary
   */
  onContinueIterating(): void {
    if (this.pendingSummaryResponse) {
      const resolve = this.pendingSummaryResponse;
      this.pendingSummaryResponse = null;

      // Reset phase to discovery
      if (this.session) {
        this.session.phase = 'discovery';
      }

      resolve('continue');
    }
  }

  /**
   * Emit generating state (for loading indicator)
   */
  emitGenerating(type: 'palette' | 'mockup', message?: string): void {
    this.emit('generating', { type, message });
  }

  /**
   * Emit generation complete
   */
  emitGenerationComplete(): void {
    this.emit('generationComplete');
  }

  /**
   * Handle save_design MCP tool call
   */
  async handleSaveDesign(name: string, tokens: DesignTokens, guidelines: string): Promise<{ path: string }> {
    const designsDir = this.getDesignsDir();

    // Ensure designs directory exists
    if (!fs.existsSync(designsDir)) {
      fs.mkdirSync(designsDir, { recursive: true });
    }

    // Generate markdown content
    const markdownContent = this.generateDesignMarkdown(name, tokens, guidelines);

    // Sanitize filename
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const filePath = path.join(designsDir, `${sanitizedName}.md`);

    // Write file
    fs.writeFileSync(filePath, markdownContent, 'utf-8');

    console.log(`[DesignerAgent] Design saved to: ${filePath}`);

    // Update session
    if (this.session) {
      this.session.phase = 'complete';
      this.session.designName = name;
      this.session.savedPath = filePath;
    }

    // Emit complete event
    this.emit('designComplete', {
      designPath: filePath,
      designName: name
    });

    return { path: filePath };
  }

  /**
   * Get the designs directory path
   */
  private getDesignsDir(): string {
    return path.join(getConfigDir(), 'designs');
  }

  /**
   * Generate markdown content for the design file
   */
  private generateDesignMarkdown(name: string, tokens: DesignTokens, guidelines: string): string {
    const lines: string[] = [];

    lines.push(`# ${name}`);
    lines.push('');
    lines.push('## Metadata');
    lines.push(`- Created: ${new Date(tokens.createdAt).toISOString()}`);
    lines.push(`- Context: ${tokens.context}`);
    lines.push(`- Theme: ${tokens.themeMode}`);
    lines.push('');

    // Design Tokens
    lines.push('## Design Tokens');
    lines.push('');

    // Colors
    lines.push('### Colors');
    lines.push('');
    lines.push('#### Primary Scale');
    tokens.colors.primary.forEach((color, i) => {
      const shade = i === 0 ? '50' : `${i}00`;
      lines.push(`- \`--color-primary-${shade}\`: ${color}`);
    });
    lines.push('');

    lines.push('#### Neutral Scale');
    tokens.colors.neutral.forEach((color, i) => {
      const shade = i === 0 ? '50' : `${i}00`;
      lines.push(`- \`--color-neutral-${shade}\`: ${color}`);
    });
    lines.push('');

    lines.push('#### Semantic');
    lines.push(`- \`--color-success\`: ${tokens.colors.success}`);
    lines.push(`- \`--color-error\`: ${tokens.colors.error}`);
    lines.push(`- \`--color-warning\`: ${tokens.colors.warning}`);
    lines.push(`- \`--color-info\`: ${tokens.colors.info}`);
    lines.push('');

    lines.push('#### Surface');
    lines.push(`- \`--color-background\`: ${tokens.colors.background}`);
    lines.push(`- \`--color-surface\`: ${tokens.colors.surface}`);
    lines.push(`- \`--color-surface-elevated\`: ${tokens.colors.surfaceElevated}`);
    lines.push(`- \`--color-border\`: ${tokens.colors.border}`);
    lines.push('');

    // Typography
    lines.push('### Typography');
    lines.push(`- \`--font-family-base\`: ${tokens.typography.fontFamilyBase}`);
    if (tokens.typography.fontFamilyHeading) {
      lines.push(`- \`--font-family-heading\`: ${tokens.typography.fontFamilyHeading}`);
    }
    lines.push(`- \`--font-size-xs\`: ${tokens.typography.fontSizes.xs}`);
    lines.push(`- \`--font-size-sm\`: ${tokens.typography.fontSizes.sm}`);
    lines.push(`- \`--font-size-base\`: ${tokens.typography.fontSizes.base}`);
    lines.push(`- \`--font-size-lg\`: ${tokens.typography.fontSizes.lg}`);
    lines.push(`- \`--font-size-xl\`: ${tokens.typography.fontSizes.xl}`);
    lines.push(`- \`--font-size-2xl\`: ${tokens.typography.fontSizes['2xl']}`);
    lines.push(`- \`--font-weight-normal\`: ${tokens.typography.fontWeights.normal}`);
    lines.push(`- \`--font-weight-medium\`: ${tokens.typography.fontWeights.medium}`);
    lines.push(`- \`--font-weight-semibold\`: ${tokens.typography.fontWeights.semibold}`);
    lines.push(`- \`--font-weight-bold\`: ${tokens.typography.fontWeights.bold}`);
    lines.push(`- \`--line-height-tight\`: ${tokens.typography.lineHeights.tight}`);
    lines.push(`- \`--line-height-normal\`: ${tokens.typography.lineHeights.normal}`);
    lines.push(`- \`--line-height-relaxed\`: ${tokens.typography.lineHeights.relaxed}`);
    lines.push('');

    // Spacing
    lines.push('### Spacing');
    lines.push(`- \`--space-1\`: ${tokens.spacing['1']}`);
    lines.push(`- \`--space-2\`: ${tokens.spacing['2']}`);
    lines.push(`- \`--space-3\`: ${tokens.spacing['3']}`);
    lines.push(`- \`--space-4\`: ${tokens.spacing['4']}`);
    lines.push(`- \`--space-6\`: ${tokens.spacing['6']}`);
    lines.push(`- \`--space-8\`: ${tokens.spacing['8']}`);
    lines.push(`- \`--space-12\`: ${tokens.spacing['12']}`);
    lines.push('');

    // Effects
    lines.push('### Effects');
    lines.push(`- \`--radius-sm\`: ${tokens.effects.radii.sm}`);
    lines.push(`- \`--radius-md\`: ${tokens.effects.radii.md}`);
    lines.push(`- \`--radius-lg\`: ${tokens.effects.radii.lg}`);
    lines.push(`- \`--radius-full\`: ${tokens.effects.radii.full}`);
    lines.push(`- \`--shadow-sm\`: ${tokens.effects.shadows.sm}`);
    lines.push(`- \`--shadow-md\`: ${tokens.effects.shadows.md}`);
    lines.push(`- \`--shadow-lg\`: ${tokens.effects.shadows.lg}`);
    lines.push('');

    // Component Guidelines
    lines.push('## Component Guidelines');
    lines.push('');
    lines.push(guidelines);
    lines.push('');

    // Usage Notes
    if (tokens.usageNotes && tokens.usageNotes.length > 0) {
      lines.push('## Usage Notes');
      for (const note of tokens.usageNotes) {
        lines.push(`- ${note}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get list of categories with display info
   */
  private getCategoryList(): Array<{ id: DesignCategory; name: string; description: string }> {
    return [
      { id: 'blog', name: 'Blog', description: 'Personal blogs, company blogs, newsletters' },
      { id: 'landing_page', name: 'Landing Page', description: 'Product launches, marketing pages' },
      { id: 'ecommerce', name: 'E-commerce', description: 'Online stores, product catalogs' },
      { id: 'dashboard', name: 'Dashboard', description: 'Admin panels, analytics, data management' },
      { id: 'chat_messaging', name: 'Chat / Messaging', description: 'Chat interfaces, support widgets' },
      { id: 'documentation', name: 'Documentation', description: 'Technical docs, API references' },
      { id: 'saas_marketing', name: 'SaaS Marketing', description: 'Pricing pages, feature showcases' },
      { id: 'portfolio', name: 'Portfolio', description: 'Personal portfolios, agency sites' },
    ];
  }

  /**
   * Get list of saved designs
   */
  getSavedDesigns(): Array<{ name: string; path: string; createdAt: number }> {
    const designsDir = this.getDesignsDir();

    if (!fs.existsSync(designsDir)) {
      return [];
    }

    const files = fs.readdirSync(designsDir).filter(f => f.endsWith('.md'));
    const designs: Array<{ name: string; path: string; createdAt: number }> = [];

    for (const file of files) {
      const filePath = path.join(designsDir, file);
      const stats = fs.statSync(filePath);

      // Extract name from first line
      const content = fs.readFileSync(filePath, 'utf-8');
      const firstLine = content.split('\n')[0];
      const name = firstLine.replace(/^#\s*/, '') || file.replace('.md', '');

      designs.push({
        name,
        path: filePath,
        createdAt: stats.birthtimeMs,
      });
    }

    return designs.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ═══════════════════════════════════════════════════════════════
  // Artifact Management Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save an artifact (HTML or JSON) to the session folder
   */
  saveArtifact(artifactName: string, content: string): string {
    if (!this.session) {
      throw new Error('No active session');
    }

    const sessionDir = ensureDesignSessionDir(this.session.id);
    const artifactPath = getDesignArtifactPath(this.session.id, artifactName);

    fs.writeFileSync(artifactPath, content, 'utf-8');
    console.log(`[DesignerAgent] Saved artifact: ${artifactPath}`);

    return artifactPath;
  }

  /**
   * Load an artifact from the session folder
   */
  loadArtifact(artifactName: string): string | null {
    if (!this.session) {
      return null;
    }

    const artifactPath = getDesignArtifactPath(this.session.id, artifactName);

    if (!fs.existsSync(artifactPath)) {
      console.log(`[DesignerAgent] Artifact not found: ${artifactPath}`);
      return null;
    }

    const content = fs.readFileSync(artifactPath, 'utf-8');
    console.log(`[DesignerAgent] Loaded artifact: ${artifactPath} (${content.length} chars)`);
    return content;
  }

  /**
   * Handle saving selected theme (HTML with CSS variables)
   * Called when user selects a theme option
   * The HTML contains CSS variables in :root that serve as the design tokens
   */
  async handleSaveSelectedTheme(
    themeOption: { html: string }
  ): Promise<{ themeHtmlPath: string }> {
    // Save theme HTML (contains CSS variables as the source of truth)
    const themeHtmlPath = this.saveArtifact('theme.html', themeOption.html);

    // Update session
    if (this.session) {
      if (!this.session.artifactPaths) {
        this.session.artifactPaths = {};
      }
      this.session.artifactPaths.theme = themeHtmlPath;
    }

    return { themeHtmlPath };
  }

  /**
   * Handle saving a page (named mockup)
   * Called when user selects a mockup option
   * The HTML should include the CSS variables from theme.html
   */
  async handleSavePage(
    pageOption: { html: string; name: string }
  ): Promise<{ page: DesignPage }> {
    if (!this.session) {
      throw new Error('No active session');
    }

    // Generate filename from page name (e.g., "Landing Page" -> "landing-page.html")
    const filename = pageOption.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '.html';

    // Save page HTML
    const pagePath = this.saveArtifact(filename, pageOption.html);

    // Create page object
    const page: DesignPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: pageOption.name,
      filename,
      path: pagePath,
      createdAt: Date.now(),
    };

    // Add to session pages
    this.session.pages.push(page);

    console.log(`[DesignerAgent] Saved page: ${page.name} -> ${pagePath}`);

    // Emit page added event
    this.emit('pageAdded', { page });

    return { page };
  }

  /**
   * Get all pages in the current session
   */
  getPages(): DesignPage[] {
    return this.session?.pages || [];
  }

  /**
   * Get a specific page by ID
   */
  getPage(pageId: string): DesignPage | null {
    return this.session?.pages.find(p => p.id === pageId) || null;
  }

  /**
   * Get page HTML content by ID
   */
  getPageHtml(pageId: string): string | null {
    const page = this.getPage(pageId);
    if (!page || !page.filename) {
      return null;
    }
    return this.loadArtifact(page.filename);
  }

  /**
   * Handle mockup preview result (Select/Refine/Feeling Lucky)
   */
  async handleShowMockupPreview(options: MockupOption[], pageName?: string): Promise<MockupSelectionResult> {
    // Store the agent-suggested page name for fallback
    this.currentMockupPageName = pageName || (options[0]?.name) || null;

    return new Promise((resolve) => {
      this.pendingMockupSelection = resolve;

      // Emit show preview event with mockup type
      this.emit('showPreview', {
        type: 'mockup',
        options
      });
    });
  }

  /**
   * Get the current mockup's agent-suggested page name
   */
  getCurrentMockupPageName(): string | null {
    return this.currentMockupPageName;
  }

  // ═══════════════════════════════════════════════════════════════
  // Draft Management (Zero-HTML Architecture)
  // - Themes: CSS-only, injected into template for preview
  // - Mockups: Full HTML
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get draft content for preview by type and index.
   * Zero-HTML Architecture:
   * - Theme: Reads CSS file, injects into template, returns combined HTML
   * - Mockup: Returns HTML file directly
   */
  getDraft(type: 'theme' | 'mockup', index: number): string | null {
    if (!this.sessionPaths) {
      console.error('[DesignerAgent] No session paths available');
      return null;
    }

    const draftsDir = this.sessionPaths.drafts;

    if (type === 'theme') {
      // Theme: CSS-only, inject into template
      const cssPath = path.join(draftsDir, `theme-${index}.css`);
      const templatePath = this.sessionPaths.themeTemplate;

      if (!fs.existsSync(cssPath)) {
        console.log(`[DesignerAgent] Theme CSS not found: ${cssPath}`);
        return null;
      }

      if (!fs.existsSync(templatePath)) {
        console.log(`[DesignerAgent] Theme template not found: ${templatePath}`);
        return null;
      }

      const css = fs.readFileSync(cssPath, 'utf-8');
      const template = fs.readFileSync(templatePath, 'utf-8');

      // Inject CSS variables into template
      // The template should have a <style> tag or we inject before </head>
      const injectedHtml = this.injectCssIntoTemplate(template, css);
      console.log(`[DesignerAgent] Injected theme CSS into template (${css.length} chars CSS)`);
      return injectedHtml;

    } else if (type === 'mockup') {
      // Mockup: Full HTML
      const htmlPath = path.join(draftsDir, `mockup-${index}.html`);
      if (!fs.existsSync(htmlPath)) {
        console.log(`[DesignerAgent] Mockup HTML not found: ${htmlPath}`);
        return null;
      }
      return fs.readFileSync(htmlPath, 'utf-8');
    }

    return null;
  }

  /**
   * Inject CSS variables into the template HTML.
   * Looks for <!-- INJECT_CSS --> placeholder or injects before </head>.
   */
  private injectCssIntoTemplate(template: string, css: string): string {
    const cssBlock = `<style>\n${css}\n</style>`;

    // Try placeholder first
    if (template.includes('<!-- INJECT_CSS -->')) {
      return template.replace('<!-- INJECT_CSS -->', cssBlock);
    }

    // Otherwise inject before </head>
    if (template.includes('</head>')) {
      return template.replace('</head>', `${cssBlock}\n</head>`);
    }

    // Fallback: prepend to template
    return cssBlock + '\n' + template;
  }

  /**
   * Auto-save selected draft as the final artifact.
   * Called when user selects an option - instant save, no Claude round-trip.
   */
  autoSaveSelectedDraft(type: 'theme' | 'mockup', index: number, pageName?: string): { path: string; page?: DesignPage } {
    if (!this.sessionPaths || !this.session) {
      throw new Error('No active session');
    }

    const draftsDir = this.sessionPaths.drafts;
    const sessionDir = this.sessionPaths.root;

    if (type === 'theme') {
      // Copy theme CSS to final location
      const srcPath = path.join(draftsDir, `theme-${index}.css`);
      const destPath = path.join(sessionDir, 'theme.css');
      fs.copyFileSync(srcPath, destPath);
      console.log(`[DesignerAgent] Auto-saved theme: ${destPath}`);
      return { path: destPath };

    } else if (type === 'mockup') {
      // Save mockup as a named page
      const srcPath = path.join(draftsDir, `mockup-${index}.html`);
      const html = fs.readFileSync(srcPath, 'utf-8');
      const name = pageName || 'Page';
      const page = this.handleSavePageSync({ html, name });
      console.log(`[DesignerAgent] Auto-saved mockup as page: ${page.name}`);
      return { path: page.path!, page };
    }

    throw new Error(`Unknown draft type: ${type}`);
  }

  /**
   * Save a mockup draft during generation
   * Called by Claude via MCP tool - saves HTML to session folder
   * Returns the draft filename (not full path) for reference
   */
  saveMockupDraft(html: string, index: number): string {
    const filename = `draft-mockup-${index}.html`;
    this.saveArtifact(filename, html);
    this.currentMockupDrafts[index] = filename;
    console.log(`[DesignerAgent] Saved mockup draft: ${filename} (${html.length} chars)`);
    return filename;
  }

  /**
   * Get mockup draft HTML by index
   * Used by API endpoint to serve draft content
   */
  getMockupDraft(index: number): string | null {
    const filename = `draft-mockup-${index}.html`;
    return this.loadArtifact(filename);
  }

  /**
   * Clear all mockup drafts (called when starting new mockup generation)
   */
  clearMockupDrafts(): void {
    this.currentMockupDrafts = [];
    console.log('[DesignerAgent] Cleared mockup drafts');
  }

  /**
   * Called when user selects a mockup option (Select button)
   * Now auto-saves the draft as a page - no Claude round-trip needed!
   */
  onMockupSelected(index: number, pageName: string): void {
    // Auto-save: Copy draft to final page immediately
    const draftHtml = this.getMockupDraft(index);
    if (draftHtml && this.session) {
      try {
        // Use sync version to avoid async complexity
        const page = this.handleSavePageSync({ html: draftHtml, name: pageName });
        console.log(`[DesignerAgent] Auto-saved page: ${page.name} -> ${page.filename}`);

        // Emit pageSaved event so frontend can update pages panel
        this.emit('pageSaved', { page });
      } catch (err) {
        console.error('[DesignerAgent] Failed to auto-save page:', err);
      }
    }

    // Resolve with autoSaved flag so Claude knows not to call save_page
    if (this.pendingMockupSelection) {
      const resolve = this.pendingMockupSelection;
      this.pendingMockupSelection = null;
      resolve({ selected: index, pageName, autoSaved: true });
    }
  }

  /**
   * Synchronous version of handleSavePage for auto-save
   */
  private handleSavePageSync(pageOption: { html: string; name: string }): DesignPage {
    if (!this.session) {
      throw new Error('No active session');
    }

    // Generate filename from page name
    const filename = pageOption.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '.html';

    // Save page HTML
    const pagePath = this.saveArtifact(filename, pageOption.html);

    // Create page object
    const page: DesignPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: pageOption.name,
      filename,
      path: pagePath,
      createdAt: Date.now(),
    };

    // Add to session pages
    this.session.pages.push(page);

    console.log(`[DesignerAgent] Saved page: ${page.name} -> ${pagePath}`);

    return page;
  }

  /**
   * Called when user clicks Refine on a mockup option
   */
  onMockupRefine(index: number): void {
    if (this.pendingMockupSelection) {
      const resolve = this.pendingMockupSelection;
      this.pendingMockupSelection = null;
      resolve({ refine: index });
    }
  }

  /**
   * Called when user clicks "I'm Feeling Lucky"
   */
  onMockupFeelingLucky(): void {
    if (this.pendingMockupSelection) {
      const resolve = this.pendingMockupSelection;
      this.pendingMockupSelection = null;
      resolve({ feelingLucky: true });
    }
  }

  /**
   * Load previous artifacts for chaining context
   * Returns HTML content of requested artifacts
   */
  loadPreviousArtifacts(artifactNames: string[]): Record<string, string | null> {
    const result: Record<string, string | null> = {};

    for (const name of artifactNames) {
      result[name] = this.loadArtifact(name);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // Design Library (Folder-Based Storage)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the designs library directory path
   */
  private getDesignsLibraryDir(): string {
    return path.join(getConfigDir(), 'designs');
  }

  /**
   * Extract CSS variables from HTML content
   * Returns an object with variable names as keys and values
   */
  extractCssVariables(html: string): Record<string, string> {
    const variables: Record<string, string> = {};

    // Find :root { ... } block
    const rootMatch = html.match(/:root\s*\{([^}]+)\}/s);
    if (!rootMatch) return variables;

    const rootContent = rootMatch[1];

    // Extract each --variable: value pair
    const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = varRegex.exec(rootContent)) !== null) {
      const name = match[1].trim();
      const value = match[2].trim();
      variables[name] = value;
    }

    return variables;
  }

  /**
   * Format CSS variables into grouped sections for AGENTS.md
   */
  formatCssVariablesForMarkdown(variables: Record<string, string>): string {
    if (Object.keys(variables).length === 0) {
      return '*No CSS variables found in theme.html*';
    }

    // Group variables by prefix
    const groups: Record<string, Array<{ name: string; value: string }>> = {
      'Colors - Primary': [],
      'Colors - Neutral': [],
      'Colors - Surface': [],
      'Colors - Semantic': [],
      'Typography': [],
      'Spacing': [],
      'Effects': [],
      'Other': [],
    };

    for (const [name, value] of Object.entries(variables)) {
      if (name.startsWith('--primary-')) {
        groups['Colors - Primary'].push({ name, value });
      } else if (name.startsWith('--neutral-')) {
        groups['Colors - Neutral'].push({ name, value });
      } else if (name.includes('background') || name.includes('surface') || name.includes('border')) {
        groups['Colors - Surface'].push({ name, value });
      } else if (name.includes('success') || name.includes('error') || name.includes('warning') || name.includes('info')) {
        groups['Colors - Semantic'].push({ name, value });
      } else if (name.includes('text') || name.includes('font') || name.includes('line-height')) {
        groups['Typography'].push({ name, value });
      } else if (name.startsWith('--space-')) {
        groups['Spacing'].push({ name, value });
      } else if (name.includes('radius') || name.includes('shadow')) {
        groups['Effects'].push({ name, value });
      } else {
        groups['Other'].push({ name, value });
      }
    }

    // Format as markdown
    const lines: string[] = [];
    for (const [groupName, vars] of Object.entries(groups)) {
      if (vars.length === 0) continue;

      lines.push(`#### ${groupName}`);
      lines.push('```css');
      for (const { name, value } of vars) {
        lines.push(`${name}: ${value};`);
      }
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate AGENTS.md content for a design
   */
  generateAgentsMd(designName: string, cssVariables?: Record<string, string>, pageNames?: string[]): string {
    const variablesSection = cssVariables
      ? this.formatCssVariablesForMarkdown(cssVariables)
      : '*Run the design workflow to generate CSS variables*';

    const pagesSection = pageNames && pageNames.length > 0
      ? pageNames.map(p => `- **${p}**`).join('\n')
      : '- *No pages generated yet*';

    return `# ${designName} Design System

## Overview

This folder contains the authoritative design system for this project. Use these files as the source of truth for all UI implementation.

## Files

- **theme.css** - CSS variables (colors, spacing, typography, effects)
- **components.html** - Component catalog (extracted from page mockups)
- **AGENTS.md** - This file (integration instructions)
${pageNames && pageNames.length > 0 ? pageNames.map(p => `- **${p}** - Page mockup (layout + component styles)`).join('\n') : ''}

## How to Use This Design System

### 1. Page Mockups = Main Reference

**The page HTML files are your primary reference.** They show:
- Complete page layouts with \`data-section\` attributes marking each section
- Component instances marked with \`data-component\` attributes
- Color and typography usage via CSS variables
- Spacing and visual hierarchy

When implementing a page or component:
1. Find the relevant page mockup
2. Look for \`data-component="{id}"\` attributes to identify component patterns
3. Look for \`data-section="{id}"\` attributes to identify section structure
4. Study the \`oc-*\` CSS classes for component styling
5. Implement using your framework to match the visual design

### 2. Component Catalog (components.html)

The component catalog provides a clean reference of all components extracted from page mockups:
- Each component is marked with \`data-component="{id}"\`
- Variants are marked with \`data-variant="{variant}"\`
- CSS is organized between \`/* === COMPONENT: {id} === */\` and \`/* === END: {id} === */\` markers

### 3. Structured Markup Conventions

All mockups use consistent structured markup:

**HTML Attributes:**
- \`data-section="{id}"\` — marks page sections (nav, hero, features, footer, etc.)
- \`data-component="{id}"\` — marks component instances (button, card, badge, etc.)
- \`data-variant="{variant}"\` — marks component variants (primary, outline, etc.)

**CSS Classes:**
- \`oc-{id}\` prefix for all component classes (e.g., \`.oc-button\`, \`.oc-card\`)
- BEM-style modifiers: \`.oc-button--primary\`, \`.oc-card__title\`
- Multi-word IDs use kebab-case: \`stat_card\` → \`.oc-stat-card\`

**CSS Organization:**
- Component CSS grouped between \`/* === COMPONENT: {id} === */\` and \`/* === END: {id} === */\`
- Section CSS grouped between \`/* === SECTION: {id} === */\` and \`/* === END: {id} === */\`

**Extracting a Component:**
To extract a specific component (e.g., buttons), search for:
1. CSS: everything between \`/* === COMPONENT: button === */\` and \`/* === END: button === */\`
2. HTML: all elements with \`data-component="button"\`

### 4. Theme Variables

\`theme.css\` contains CSS variables for the design tokens:

${variablesSection}

### 5. Available Pages

${pagesSection}

## Integration by Framework

### Mantine (React)

Map theme.css variables to Mantine theme config:

\`\`\`typescript
// Extract color values from theme.css and create color tuples
const primary: MantineColorsTuple = [
  // 10 shades from --primary-50 to --primary-900
];

export const theme = createTheme({
  colors: { primary },
  primaryColor: 'primary',
  fontFamily: '...', // from --font-family-base
});
\`\`\`

Then reference page mockups when creating components to match styling.

### Plain CSS / CSS Modules

Copy the \`:root { ... }\` block from theme.css to your global stylesheet, then reference the variables.

### Tailwind CSS

Map variables to Tailwind config:

\`\`\`js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--primary-50)',
          // ... map all shades
        }
      }
    }
  }
}
\`\`\`

## Key Principles

1. **Page mockups are authoritative** - Match the visual design exactly
2. **Use theme.css variables** - Never hardcode colors, spacing, or typography
3. **Use structured markup** - Extract components via \`data-component\` attributes and \`oc-*\` CSS classes
4. **Adapt to your framework** - The mockups show the design, implement using your stack's patterns

---
Generated by Orchy Design System
`;
  }

  /**
   * Save design from current session to a named folder
   * Copies artifacts from session folder to permanent library folder
   */
  async handleSaveDesignFolder(designName: string): Promise<{ path: string; folder: SavedDesignFolder }> {
    if (!this.session) {
      throw new Error('No active session');
    }

    const libraryDir = this.getDesignsLibraryDir();

    // Sanitize folder name
    const sanitizedName = designName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const designFolderPath = path.join(libraryDir, sanitizedName);

    // Create design folder
    if (!fs.existsSync(designFolderPath)) {
      fs.mkdirSync(designFolderPath, { recursive: true });
    }

    // Copy artifacts from session to design folder
    const sessionDir = ensureDesignSessionDir(this.session.id);

    // Copy theme.css and generate theme.html from CSS + template (zero-HTML architecture)
    const themeCssSource = path.join(sessionDir, 'theme.css');
    const themeDest = path.join(designFolderPath, 'theme.html');
    const themeCssDest = path.join(designFolderPath, 'theme.css');
    const themeTemplateSource = path.join(sessionDir, 'theme-template.html');
    let hasTheme = false;

    // Always copy theme.css if it exists
    if (fs.existsSync(themeCssSource)) {
      fs.copyFileSync(themeCssSource, themeCssDest);
      hasTheme = true;
      console.log(`[DesignerAgent] Copied theme.css to design folder`);

      // Try to generate theme.html by injecting CSS into template
      if (fs.existsSync(themeTemplateSource)) {
        const themeCss = fs.readFileSync(themeCssSource, 'utf-8');
        const template = fs.readFileSync(themeTemplateSource, 'utf-8');
        const themeHtml = this.injectCssIntoTemplate(template, themeCss);
        fs.writeFileSync(themeDest, themeHtml, 'utf-8');
        console.log(`[DesignerAgent] Generated theme.html from theme.css + template`);
      } else {
        console.log(`[DesignerAgent] Theme template not found, skipping theme.html generation`);
      }
    } else {
      // Fallback: try copying theme.html directly (legacy)
      const themeHtmlSource = path.join(sessionDir, 'theme.html');
      if (fs.existsSync(themeHtmlSource)) {
        fs.copyFileSync(themeHtmlSource, themeDest);
        hasTheme = true;
        console.log(`[DesignerAgent] Copied legacy theme.html`);
      }
    }

    // Clean up old page files before copying new ones
    // This handles renamed/deleted pages
    const existingFiles = fs.readdirSync(designFolderPath);
    const newPageFilenames = new Set(this.session.pages.map(p => p.filename));
    for (const file of existingFiles) {
      if (file.endsWith('.html') &&
          file !== 'theme.html' &&
          !newPageFilenames.has(file)) {
        const oldFilePath = path.join(designFolderPath, file);
        fs.unlinkSync(oldFilePath);
        console.log(`[DesignerAgent] Removed old page file: ${file}`);
      }
    }

    // Copy all page HTML files
    const pages: string[] = [];
    for (const page of this.session.pages) {
      if (page.filename) {
        const pageSource = path.join(sessionDir, page.filename);
        const pageDest = path.join(designFolderPath, page.filename);
        if (fs.existsSync(pageSource)) {
          fs.copyFileSync(pageSource, pageDest);
          pages.push(page.filename);
        }
      }
    }

    // Copy components.html catalog if agent generated it
    const componentsCatalogSource = path.join(sessionDir, 'components.html');
    if (fs.existsSync(componentsCatalogSource)) {
      fs.copyFileSync(componentsCatalogSource, path.join(designFolderPath, 'components.html'));
      console.log(`[DesignerAgent] Copied components.html to design folder`);
    } else {
      console.log(`[DesignerAgent] No components.html found in session (agent may not have generated it)`);
    }

    // Copy per-page catalog files (*-components.html)
    for (const page of this.session.pages) {
      if (page.catalogFilename) {
        const catalogSource = path.join(sessionDir, page.catalogFilename);
        if (fs.existsSync(catalogSource)) {
          fs.copyFileSync(catalogSource, path.join(designFolderPath, page.catalogFilename));
          console.log(`[DesignerAgent] Copied page catalog: ${page.catalogFilename}`);
        }
      }
    }

    // Extract CSS variables from theme.html for AGENTS.md
    let cssVariables: Record<string, string> = {};
    if (hasTheme) {
      const themeHtml = fs.readFileSync(themeDest, 'utf-8');
      cssVariables = this.extractCssVariables(themeHtml);
    }

    // Generate and save AGENTS.md with extracted variables
    const agentsMd = this.generateAgentsMd(designName, cssVariables, pages);
    fs.writeFileSync(path.join(designFolderPath, 'AGENTS.md'), agentsMd, 'utf-8');

    // Write last_updated.txt with current timestamp (for out-of-date detection)
    const timestamp = Date.now().toString();
    fs.writeFileSync(path.join(designFolderPath, 'last_updated.txt'), timestamp, 'utf-8');

    console.log(`[DesignerAgent] Design folder saved to: ${designFolderPath}`);

    // Update session
    this.session.phase = 'complete';
    this.session.designName = designName;
    this.session.savedPath = designFolderPath;

    // Create folder summary
    const folder: SavedDesignFolder = {
      name: designName,
      path: designFolderPath,
      createdAt: Date.now(),
      hasTheme,
      pages,
    };

    // Emit complete event
    this.emit('designComplete', {
      designPath: designFolderPath,
      designName,
    });

    return { path: designFolderPath, folder };
  }

  /**
   * Get list of saved design folders
   */
  getSavedDesignFolders(): SavedDesignFolder[] {
    const libraryDir = this.getDesignsLibraryDir();

    if (!fs.existsSync(libraryDir)) {
      return [];
    }

    const folders: SavedDesignFolder[] = [];
    const entries = fs.readdirSync(libraryDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const folderPath = path.join(libraryDir, entry.name);
      const stats = fs.statSync(folderPath);

      // Check what files exist
      const hasTheme = fs.existsSync(path.join(folderPath, 'theme.html'));

      // Get all page HTML files (exclude theme.html)
      const files = fs.readdirSync(folderPath);
      const pages = files.filter(f =>
        f.endsWith('.html') &&
        f !== 'theme.html' &&
        !f.endsWith('-components.html') &&
        f !== 'components.html'
      );

      // Extract design name from folder name (convert kebab-case to Title Case)
      const displayName = entry.name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      folders.push({
        name: displayName,
        path: folderPath,
        createdAt: stats.birthtimeMs,
        hasTheme,
        pages,
      });
    }

    return folders.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Load full contents of a design folder
   */
  loadDesignFolderContents(designName: string): SavedDesignFolderContents | null {
    const libraryDir = this.getDesignsLibraryDir();

    // Sanitize folder name
    const sanitizedName = designName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const folderPath = path.join(libraryDir, sanitizedName);

    if (!fs.existsSync(folderPath)) {
      return null;
    }

    const stats = fs.statSync(folderPath);

    // Load theme.html (preview) and theme.css (raw variables)
    const themePath = path.join(folderPath, 'theme.html');
    const themeCssPath = path.join(folderPath, 'theme.css');
    const hasTheme = fs.existsSync(themePath);
    const themeHtml = hasTheme ? fs.readFileSync(themePath, 'utf-8') : undefined;
    const themeCss = fs.existsSync(themeCssPath) ? fs.readFileSync(themeCssPath, 'utf-8') : undefined;

    // Load all page HTML files
    const files = fs.readdirSync(folderPath);
    const pages: string[] = [];
    const pageHtmls: Record<string, string> = {};

    for (const file of files) {
      if (file.endsWith('.html') && file !== 'theme.html') {
        // Load all HTML into pageHtmls (including catalogs for later access)
        pageHtmls[file] = fs.readFileSync(path.join(folderPath, file), 'utf-8');
        // Only add actual pages (not component catalogs) to pages list
        if (!file.endsWith('-components.html') && file !== 'components.html') {
          pages.push(file);
        }
      }
    }

    // Load AGENTS.md
    const agentsPath = path.join(folderPath, 'AGENTS.md');
    const agentsMarkdown = fs.existsSync(agentsPath)
      ? fs.readFileSync(agentsPath, 'utf-8')
      : this.generateAgentsMd(designName);

    // Extract display name
    const displayName = sanitizedName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return {
      name: displayName,
      path: folderPath,
      createdAt: stats.birthtimeMs,
      hasTheme,
      pages,
      themeHtml,
      themeCss,
      pageHtmls,
      agentsMarkdown,
    };
  }

  /**
   * Delete a design folder
   */
  deleteDesignFolder(designName: string): boolean {
    const libraryDir = this.getDesignsLibraryDir();

    // Sanitize folder name
    const sanitizedName = designName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const folderPath = path.join(libraryDir, sanitizedName);

    if (!fs.existsSync(folderPath)) {
      return false;
    }

    // Delete folder and contents
    fs.rmSync(folderPath, { recursive: true });
    console.log(`[DesignerAgent] Deleted design folder: ${folderPath}`);

    return true;
  }

  /**
   * Create a ZIP archive stream for a design folder.
   * Returns an archiver instance that can be piped to a response.
   * Excludes internal metadata files like last_updated.txt.
   */
  getDesignFolderZip(designName: string): archiver.Archiver | null {
    const libraryDir = this.getDesignsLibraryDir();

    const sanitizedName = designName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const folderPath = path.join(libraryDir, sanitizedName);

    if (!fs.existsSync(folderPath)) {
      return null;
    }

    const archive = archiver('zip', { zlib: { level: 9 } });

    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      if (file === 'last_updated.txt') continue;
      const filePath = path.join(folderPath, file);
      if (fs.statSync(filePath).isFile()) {
        archive.file(filePath, { name: file });
      }
    }

    archive.finalize();
    return archive;
  }

  // ═══════════════════════════════════════════════════════════════
  // Design Editing Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Load a design from the library for editing
   */
  async loadDesignForEditing(designName: string): Promise<void> {
    // End existing session first
    if (this.session) {
      await this.endSession();
    }

    // Load design contents
    const contents = this.loadDesignFolderContents(designName);
    if (!contents) {
      throw new Error(`Design "${designName}" not found`);
    }

    // Create session
    const sessionId = `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionDir = ensureDesignSessionDir(sessionId);

    // Copy files to session folder
    if (contents.themeCss) {
      fs.writeFileSync(path.join(sessionDir, 'theme.css'), contents.themeCss);
    }

    // Build pages array from design contents
    const pages: DesignPage[] = contents.pages.map(filename => {
      const html = contents.pageHtmls[filename];
      if (html) {
        fs.writeFileSync(path.join(sessionDir, filename), html);
      }

      // Check for matching component catalog
      const catalogFilename = filename.replace('.html', '-components.html');
      const hasCatalog = contents.pageHtmls[catalogFilename] != null;

      // Copy catalog file to session dir if it exists
      if (hasCatalog) {
        fs.writeFileSync(path.join(sessionDir, catalogFilename), contents.pageHtmls[catalogFilename]);
      }

      return {
        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: filename.replace('.html', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        filename,
        path: path.join(sessionDir, filename),
        catalogFilename: hasCatalog ? catalogFilename : undefined,
        createdAt: Date.now(),
      };
    });

    this.session = {
      id: sessionId,
      phase: 'pages',
      pages,
      startedAt: Date.now(),
    };

    // Emit session started event (needed for cleanup on navigation)
    this.emit('sessionStarted', { sessionId });

    // Setup session paths
    this.sessionPaths = {
      root: sessionDir,
      drafts: path.join(sessionDir, 'drafts'),
      themeTemplate: path.join(sessionDir, 'theme-template.html'),
    };

    // Create drafts dir
    if (!fs.existsSync(this.sessionPaths.drafts)) {
      fs.mkdirSync(this.sessionPaths.drafts, { recursive: true });
    }

    // Copy theme template for mockup generation
    const templatesDir = getDesignTemplatesDir();
    const themeTemplateSrc = path.join(templatesDir, 'theme-template.html');
    if (fs.existsSync(themeTemplateSrc)) {
      fs.copyFileSync(themeTemplateSrc, this.sessionPaths.themeTemplate);
    }

    console.log(`[DesignerAgent] Loaded design for editing: ${designName} with ${pages.length} pages`);

    this.emit('designLoaded', { designName, pages });

    // Spawn the designer agent with edit context so it knows about existing pages
    await this.spawnDesignerAgent(undefined, { designName, pages });
  }

  /**
   * Delete a page from the current session
   */
  deletePage(pageId: string): boolean {
    if (!this.session) return false;

    const idx = this.session.pages.findIndex(p => p.id === pageId);
    if (idx === -1) return false;

    const page = this.session.pages[idx];
    if (page.path && fs.existsSync(page.path)) {
      fs.unlinkSync(page.path);
    }
    this.session.pages.splice(idx, 1);

    console.log(`[DesignerAgent] Deleted page: ${page.name}`);
    return true;
  }

  /**
   * Get page HTML for editing
   */
  getPageForEditing(pageId: string): string | null {
    return this.getPageHtml(pageId);
  }

  /**
   * Update a page's catalogFilename
   */
  updatePageCatalog(pageId: string, catalogFilename: string): DesignPage | null {
    if (!this.session) return null;

    const page = this.session.pages.find(p => p.id === pageId);
    if (!page) return null;

    page.catalogFilename = catalogFilename;
    console.log(`[DesignerAgent] Updated page catalog: ${page.name} -> ${catalogFilename}`);
    return page;
  }

  /**
   * Get the catalog HTML for a page by reading from session dir
   */
  getPageCatalogHtml(pageId: string): string | null {
    if (!this.session) return null;

    const page = this.session.pages.find(p => p.id === pageId);
    if (!page?.catalogFilename) return null;

    return this.loadArtifact(page.catalogFilename);
  }

  /**
   * Rename a page (updates page.name, generates new filename, renames file on disk)
   */
  renamePage(pageId: string, newName: string): DesignPage | null {
    if (!this.session) return null;

    const page = this.session.pages.find(p => p.id === pageId);
    if (!page) return null;

    const oldFilename = page.filename;
    const oldPath = page.path;

    // Generate new filename from new name
    const newFilename = newName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '.html';

    // Update page object
    page.name = newName;
    page.filename = newFilename;

    // Rename file on disk if path exists
    if (oldPath && fs.existsSync(oldPath)) {
      const sessionDir = path.dirname(oldPath);
      const newPath = path.join(sessionDir, newFilename);
      fs.renameSync(oldPath, newPath);
      page.path = newPath;
      console.log(`[DesignerAgent] Renamed page file: ${oldFilename} -> ${newFilename}`);
    }

    console.log(`[DesignerAgent] Renamed page: ${page.id} to "${newName}"`);
    return page;
  }
}
