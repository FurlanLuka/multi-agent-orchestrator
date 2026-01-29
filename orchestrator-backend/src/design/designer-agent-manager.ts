import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  DesignSession,
  DesignPhase,
  DesignCategory,
  DesignPage,
  ThemeMode,
  DesignTokens,
  PaletteOption,
  ComponentStyleOption,
  MockupOption,
  MockupSelectionResult,
  ChatStreamEvent,
  ContentBlock,
} from '@orchy/types';
import { spawnWithShellEnv } from '../utils/shell-env';
import { getCacheDir, getConfigDir, ensureDesignSessionDir, getDesignArtifactPath } from '../config/paths';
import { getDesignerSystemPrompt } from './design-prompts';

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

  // Pending response resolvers (for MCP tool calls)
  private pendingUserInput: ((message: string) => void) | null = null;
  private pendingCategorySelection: ((category: DesignCategory) => void) | null = null;
  private pendingPreviewSelection: ((result: { selected?: number; feedback?: string }) => void) | null = null;
  private pendingMockupSelection: ((result: MockupSelectionResult) => void) | null = null;
  private pendingSummaryResponse: ((result: 'proceed' | 'continue') => void) | null = null;

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

    // Emit session started event
    this.emit('sessionStarted', this.session);

    // Start the Claude process with MCP
    await this.spawnDesignerAgent(category);

    return this.session;
  }

  /**
   * End the current design session
   */
  async endSession(): Promise<void> {
    const sessionId = this.session?.id;

    if (this.currentProcess) {
      console.log('[DesignerAgent] Ending session, killing process');
      this.currentProcess.kill('SIGTERM');
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
          args: [mcpServerPath]
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
   */
  private async spawnDesignerAgent(category?: DesignCategory): Promise<void> {
    if (!this.session) {
      throw new Error('No active session');
    }

    const systemPrompt = getDesignerSystemPrompt(category);
    const mcpConfigPath = this.generateDesignerMcpConfig();

    const args = [
      '-p', systemPrompt,
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
        this.emit('sessionEnded');
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

    let newPhase: DesignPhase | null = null;

    switch (toolName) {
      case 'show_category_selector':
        newPhase = 'discovery';
        break;
      case 'show_theme_preview':
        newPhase = 'theme';
        break;
      case 'show_component_preview':
        newPhase = 'components';
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
      components: 4,
      mockups: 5,
      pages: 6,
      complete: 7,
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
   * Handle show_component_preview MCP tool call
   */
  async handleShowComponentPreview(options: ComponentStyleOption[]): Promise<{ selected?: number; feedback?: string }> {
    return new Promise((resolve) => {
      this.pendingPreviewSelection = resolve;

      // Emit show preview event
      this.emit('showPreview', {
        type: 'component',
        options
      });
    });
  }

  /**
   * Called when user selects a preview option (for theme/component previews)
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
  emitGenerating(type: 'palette' | 'component' | 'mockup', message?: string): void {
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
   * Handle saving selected components (HTML only)
   * Called when user selects a component style option
   * The HTML should include the CSS variables from theme.html
   */
  async handleSaveSelectedComponents(
    componentOption: { html: string; styleName?: string }
  ): Promise<{ componentsHtmlPath: string }> {
    // Save components HTML
    const componentsHtmlPath = this.saveArtifact('components.html', componentOption.html);

    // Update session
    if (this.session) {
      if (!this.session.artifactPaths) {
        this.session.artifactPaths = {};
      }
      this.session.artifactPaths.components = componentsHtmlPath;
    }

    return { componentsHtmlPath };
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
  async handleShowMockupPreview(options: MockupOption[]): Promise<MockupSelectionResult> {
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
   * Called when user selects a mockup option (Select button)
   */
  onMockupSelected(index: number, pageName: string): void {
    if (this.pendingMockupSelection) {
      const resolve = this.pendingMockupSelection;
      this.pendingMockupSelection = null;
      resolve({ selected: index, pageName });
    }
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
}
