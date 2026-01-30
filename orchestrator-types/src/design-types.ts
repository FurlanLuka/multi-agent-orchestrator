// ═══════════════════════════════════════════════════════════════
// Designer Agent Types
// Types for the design-first workflow with iterative design generation
// ═══════════════════════════════════════════════════════════════

/**
 * Design phases in the Designer Agent workflow
 */
export type DesignPhase =
  | 'discovery'       // Full chat conversation to understand project
  | 'summary'         // Show summary of discovery, user can proceed or continue
  | 'theme'           // Generate and iterate on theme (colors + typography colors)
  | 'components'      // Generate and iterate on component styles
  | 'mockups'         // Generate full-page mockups
  | 'pages'           // Managing pages (add more, view, refine)
  | 'complete';       // Design saved

/**
 * A single page in the design (e.g., landing-page.html, about.html)
 */
export interface DesignPage {
  id: string;              // Unique identifier
  name: string;            // Display name (e.g., "Landing Page", "About")
  filename: string;        // File name (e.g., "landing-page.html", "about.html")
  path?: string;           // Full path to saved file
  createdAt: number;       // Timestamp
}

/**
 * Theme mode preference
 */
export type ThemeMode = 'light' | 'dark' | 'both';

/**
 * Categories for design references
 */
export type DesignCategory =
  | 'blog'
  | 'landing_page'
  | 'ecommerce'
  | 'dashboard'
  | 'chat_messaging'
  | 'documentation'
  | 'saas_marketing'
  | 'portfolio';

/**
 * Design session state
 */
export interface DesignSession {
  id: string;
  startedAt: number;
  phase: DesignPhase;

  // Discovery results
  context?: string;           // What the user is building (conversation summary)
  category?: DesignCategory;  // Selected category
  themeMode?: ThemeMode;      // Light/dark/both

  // Selected options from each phase
  selectedTheme?: {
    colors: DesignTokensColors;
    typographyColors: DesignTokensTypography['colors'];
  };
  selectedComponents?: DesignTokensComponents;

  // Artifact paths (for chaining context between phases)
  artifactPaths?: {
    theme?: string;           // Path to theme.html
    components?: string;      // Path to components.html
  };

  // Pages (multiple mockups, each saved with its own name)
  pages: DesignPage[];

  // Final output
  designName?: string;
  savedPath?: string;
}

// ═══════════════════════════════════════════════════════════════
// Design Tokens (Library-Agnostic Output Format)
// ═══════════════════════════════════════════════════════════════

/**
 * Color scale (10 shades from light to dark)
 * Index 0 = lightest (50), Index 9 = darkest (900)
 */
export type ColorScale = [string, string, string, string, string, string, string, string, string, string];

/**
 * Theme colors - comprehensive color system
 */
export interface DesignTokensColors {
  // Brand colors with full scales
  primary: ColorScale;        // Main brand color (10 shades)
  neutral: ColorScale;        // Neutral gray scale (10 shades) - for text, borders, backgrounds

  // Surface colors
  background: string;         // Page background
  surface: string;            // Cards, modals, elevated elements
  surfaceElevated: string;    // Higher elevation surfaces
  border: string;             // Default border color

  // Semantic/state colors
  success: string;
  warning: string;
  error: string;
  info: string;

  // Semantic backgrounds (for badges, alerts)
  successBg: string;
  warningBg: string;
  errorBg: string;
  infoBg: string;
}

/**
 * Typography tokens - includes fonts and text colors
 */
export interface DesignTokensTypography {
  // Font families
  fontFamilyBase: string;
  fontFamilyHeading?: string;
  fontFamilyMono?: string;

  // Font sizes
  fontSizes: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl'?: string;
  };

  // Font weights
  fontWeights: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };

  // Line heights
  lineHeights: {
    tight: number;
    normal: number;
    relaxed: number;
  };

  // Text colors
  colors: {
    heading: string;          // Headings (h1-h6)
    body: string;             // Main paragraph text
    muted: string;            // Secondary/helper text
    link: string;             // Link default color
    linkHover: string;        // Link hover color
    onPrimary: string;        // Text on primary background
    onSecondary: string;      // Text on secondary background
    disabled: string;         // Disabled state text
  };
}

/**
 * Spacing tokens
 */
export interface DesignTokensSpacing {
  1: string;
  2: string;
  3: string;
  4: string;
  6: string;
  8: string;
  12: string;
  16?: string;
}

/**
 * Effect tokens (shadows, radii)
 */
export interface DesignTokensEffects {
  radii: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

/**
 * Component style guidelines
 */
export interface DesignTokensComponents {
  cards: {
    background: string;
    border: string;
    borderRadius: string;
    shadow: string;
    shadowHover: string;
    padding: string;
  };
  buttons: {
    primaryBackground: string;
    primaryText: string;
    secondaryBackground: string;
    secondaryBorder: string;
    borderRadius: string;
    padding: string;
  };
  inputs: {
    border: string;
    borderRadius: string;
    focusBorder: string;
    focusBackground: string;
  };
  badges: {
    borderRadius: string;
    padding: string;
  };
}

/**
 * Complete design tokens (output format)
 */
export interface DesignTokens {
  name: string;
  createdAt: number;
  context: string;
  themeMode: ThemeMode;

  colors: DesignTokensColors;
  typography: DesignTokensTypography;
  spacing: DesignTokensSpacing;
  effects: DesignTokensEffects;
  components: DesignTokensComponents;

  // Additional usage notes from the agent
  usageNotes?: string[];
}

// ═══════════════════════════════════════════════════════════════
// Preview Options (for overlay display)
// ═══════════════════════════════════════════════════════════════

/**
 * Theme option for preview (colors + typography colors)
 */
export interface ThemeOption {
  id: string;
  name: string;
  description: string;
  colors: DesignTokensColors;
  typographyColors: DesignTokensTypography['colors'];
  // Pre-rendered HTML using theme-template.html
  previewHtml: string;
}

/**
 * @deprecated Use ThemeOption instead
 */
export type PaletteOption = ThemeOption;

/**
 * Component style option for preview
 */
export interface ComponentStyleOption {
  id: string;
  name: string;
  description: string;
  components: DesignTokensComponents;
  typography: DesignTokensTypography;
  effects: DesignTokensEffects;
  // Pre-rendered HTML using components-template.html
  previewHtml: string;
}

/**
 * Full mockup option for preview
 */
export interface MockupOption {
  id: string;
  name: string;           // e.g., "Minimal", "Magazine", "Grid"
  description: string;
  styleName?: string;     // Reference to style from design-references.json
  // Draft index - references draft saved via save_mockup_draft()
  // Frontend fetches HTML from /api/designer/draft/:draftIndex
  draftIndex?: number;
  // Full HTML mockup (agent-generated) - DEPRECATED: use draftIndex instead
  // Only used as fallback if draftIndex is not provided
  previewHtml?: string;
}

// ═══════════════════════════════════════════════════════════════
// Design Reference Library Types
// ═══════════════════════════════════════════════════════════════

/**
 * Single reference site
 */
export interface DesignReference {
  name: string;
  url: string;
  notes?: string;
}

/**
 * Style within a category
 */
export interface DesignStyle {
  name: string;
  description: string;
  characteristics: string[];
  references: DesignReference[];
}

/**
 * Category in the reference library
 */
export interface DesignCategoryConfig {
  description: string;
  styles: DesignStyle[];
}

/**
 * Full reference library structure
 */
export interface DesignReferenceLibrary {
  categories: Record<DesignCategory, DesignCategoryConfig>;
}

// ═══════════════════════════════════════════════════════════════
// MCP Tool Types (for designer-mcp-server)
// ═══════════════════════════════════════════════════════════════

/**
 * Request user input tool parameters
 */
export interface RequestUserInputParams {
  placeholder?: string;
}

/**
 * Show category selector tool result
 */
export interface CategorySelectorResult {
  category: DesignCategory;
}

/**
 * Show theme preview tool parameters
 */
export interface ShowThemePreviewParams {
  options: ThemeOption[];
}

/**
 * @deprecated Use ShowThemePreviewParams instead
 */
export type ShowPalettePreviewParams = ShowThemePreviewParams;

/**
 * Show component preview tool parameters
 */
export interface ShowComponentPreviewParams {
  options: ComponentStyleOption[];
}

/**
 * Show mockup preview tool parameters
 */
export interface ShowMockupPreviewParams {
  options: MockupOption[];
}

/**
 * Preview selection result (used by palette and component previews)
 */
export interface PreviewSelectionResult {
  selected?: number;      // Index of selected option (0-based)
  feedback?: string;      // User feedback for refinement
}

/**
 * Mockup selection result (has additional "feeling lucky" option)
 */
export interface MockupSelectionResult {
  selected?: number;      // Index of selected option (0-based) - saves page and shows pages panel
  refine?: number;        // Index of option to refine - goes to chat, then shows popup again
  feelingLucky?: boolean; // Generate 3 new variants
  pageName?: string;      // Name for the page when selecting (e.g., "Landing Page")
  autoSaved?: boolean;    // True if page was auto-saved by backend (no need to call save_page)
}

/**
 * Save design tool parameters
 */
export interface SaveDesignParams {
  name: string;
  tokens: DesignTokens;
  guidelines: string;     // Markdown component guidelines
}

/**
 * Save design tool result
 */
export interface SaveDesignResult {
  path: string;
}

// ═══════════════════════════════════════════════════════════════
// WebSocket Event Types
// ═══════════════════════════════════════════════════════════════

/**
 * Agent message event (chat message from designer agent)
 */
export interface DesignAgentMessageEvent {
  content: string;
}

/**
 * Unlock input event (agent called request_user_input)
 */
export interface DesignUnlockInputEvent {
  placeholder?: string;
}

/**
 * Show category selector event
 */
export interface DesignShowCategorySelectorEvent {
  categories: Array<{
    id: DesignCategory;
    name: string;
    description: string;
  }>;
}

/**
 * Show preview event (theme, component, or mockup)
 */
export interface DesignShowPreviewEvent {
  type: 'theme' | 'component' | 'mockup';
  options: ThemeOption[] | ComponentStyleOption[] | MockupOption[];
}

/**
 * Design complete event
 */
export interface DesignCompleteEvent {
  designPath: string;
  designName: string;
}

/**
 * Phase update event
 */
export interface DesignPhaseUpdateEvent {
  phase: DesignPhase;
  step: number;  // 1-6 for progress indicator
}

/**
 * Discovery summary event - shows summary with proceed/continue buttons
 */
export interface DesignDiscoverySummaryEvent {
  summary: string;
}

/**
 * Generating event - agent is generating theme/components/mockups
 */
export interface DesignGeneratingEvent {
  type: 'theme' | 'component' | 'mockup';
  message?: string;  // Optional loading message
}

/**
 * User message event (client → server)
 */
export interface DesignUserMessageEvent {
  content: string;
}

/**
 * Category selected event (client → server)
 */
export interface DesignCategorySelectedEvent {
  category: DesignCategory;
}

/**
 * Option selected event (client → server)
 */
export interface DesignOptionSelectedEvent {
  index: number;
}

/**
 * Feedback submitted event (client → server)
 */
export interface DesignFeedbackSubmittedEvent {
  feedback: string;
}

/**
 * Show pages panel event - displays the right-side panel with page list
 */
export interface DesignShowPagesPanelEvent {
  pages: DesignPage[];
}

/**
 * Page added event - a new page was added to the session
 */
export interface DesignPageAddedEvent {
  page: DesignPage;
}

/**
 * View page event (client → server) - user clicked to view a page
 */
export interface DesignViewPageEvent {
  pageId: string;
}

/**
 * Add page request event (client → server) - user wants to add a new page
 */
export interface DesignAddPageRequestEvent {
  description?: string;  // Optional description of what page to generate
}

/**
 * Mockup selection event (client → server) - for mockup-specific actions
 */
export interface DesignMockupSelectionEvent {
  action: 'select' | 'refine' | 'feeling_lucky';
  index?: number;        // For select/refine
  pageName?: string;     // For select - name of the page
}

// ═══════════════════════════════════════════════════════════════
// Saved Design Types (for design library)
// ═══════════════════════════════════════════════════════════════

/**
 * Summary of a saved design (for library list)
 */
export interface SavedDesignSummary {
  name: string;
  path: string;
  createdAt: number;
  context: string;
  themeMode: ThemeMode;
  category?: DesignCategory;
}

/**
 * Full saved design data
 */
export interface SavedDesign {
  tokens: DesignTokens;
  guidelines: string;       // Markdown component guidelines
  markdownContent: string;  // Full .md file content
}

// ═══════════════════════════════════════════════════════════════
// Design Library Types (folder-based storage)
// ═══════════════════════════════════════════════════════════════

/**
 * Saved design folder summary (for library list)
 */
export interface SavedDesignFolder {
  name: string;              // Folder name (design name)
  path: string;              // Full path to folder
  createdAt: number;         // Timestamp
  hasTheme: boolean;         // Has theme.html
  hasComponents: boolean;    // Has components.html
  pages: string[];           // Page filenames (e.g., ['landing-page.html', 'about.html'])
}

/**
 * Full design folder contents (for detail modal)
 */
export interface SavedDesignFolderContents extends SavedDesignFolder {
  themeHtml?: string;                    // Contents of theme.html (preview with template)
  themeCss?: string;                     // Contents of theme.css (raw CSS variables)
  componentsHtml?: string;               // Contents of components.html
  pageHtmls: Record<string, string>;     // Filename -> HTML content
  agentsMarkdown: string;                // Contents of AGENTS.md
}
