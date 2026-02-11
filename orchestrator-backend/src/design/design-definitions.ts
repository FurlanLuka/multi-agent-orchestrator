import { DesignCategory } from '@orchy/types';

/**
 * Design Definitions - Predefined components, sections, and design approaches
 */

// ═══════════════════════════════════════════════════════════════
// Atomic Component Definitions
// ═══════════════════════════════════════════════════════════════

export interface AtomicComponent {
  id: string;
  name: string;
  description: string;
  variants?: string[];
}

/**
 * Base atomic components available for all categories
 */
export const BASE_ATOMIC_COMPONENTS: AtomicComponent[] = [
  {
    id: 'button',
    name: 'Buttons',
    description: 'Action buttons for user interactions',
    variants: ['primary', 'secondary', 'outline', 'ghost'],
  },
  {
    id: 'input',
    name: 'Inputs',
    description: 'Form input fields',
    variants: ['text', 'textarea', 'select'],
  },
  {
    id: 'card',
    name: 'Cards',
    description: 'Generic container for content',
  },
  {
    id: 'badge',
    name: 'Badges/Tags',
    description: 'Small labels for categorization or status',
  },
  {
    id: 'alert',
    name: 'Alerts/Toasts',
    description: 'Feedback messages for success, warning, error, info',
    variants: ['success', 'warning', 'error', 'info'],
  },
  {
    id: 'avatar',
    name: 'Avatars',
    description: 'User profile images or initials',
  },
  {
    id: 'checkbox',
    name: 'Checkboxes/Toggles',
    description: 'Selection controls',
    variants: ['checkbox', 'toggle'],
  },
];

/**
 * Category-specific atomic components
 */
export const CATEGORY_ATOMIC_COMPONENTS: Record<DesignCategory, AtomicComponent[]> = {
  blog: [
    { id: 'tag_pill', name: 'Tag Pill', description: 'Rounded tag for article categories' },
    { id: 'author_byline', name: 'Author Byline', description: 'Author name, avatar, and date' },
  ],
  ecommerce: [
    { id: 'price_tag', name: 'Price Tag', description: 'Product price display with optional discount' },
    { id: 'rating_stars', name: 'Rating Stars', description: 'Star rating display (1-5)' },
    { id: 'quantity_selector', name: 'Quantity Selector', description: 'Number input with +/- buttons' },
  ],
  dashboard: [
    { id: 'stat_card', name: 'Stat Card', description: 'Metric display with label and trend' },
    { id: 'progress_bar', name: 'Progress Bar', description: 'Visual progress indicator' },
    { id: 'table_row', name: 'Table Row', description: 'Data table row styling' },
    { id: 'status_dot', name: 'Status Dot', description: 'Colored indicator for status' },
  ],
  documentation: [
    { id: 'code_block', name: 'Code Block', description: 'Syntax-highlighted code display' },
    { id: 'callout', name: 'Callout/Admonition', description: 'Note, tip, warning, danger blocks' },
    { id: 'breadcrumb', name: 'Breadcrumb', description: 'Navigation path indicator' },
  ],
  chat_messaging: [
    { id: 'message_bubble', name: 'Message Bubble', description: 'Chat message container' },
    { id: 'typing_indicator', name: 'Typing Indicator', description: 'Animated dots for typing' },
    { id: 'online_status', name: 'Online Status', description: 'User availability indicator' },
  ],
  landing_page: [
    { id: 'testimonial_quote', name: 'Testimonial Quote', description: 'Customer quote with attribution' },
    { id: 'feature_icon_box', name: 'Feature Icon Box', description: 'Feature with icon, title, description' },
  ],
  saas_marketing: [
    { id: 'pricing_toggle', name: 'Pricing Toggle', description: 'Monthly/yearly billing switch' },
    { id: 'feature_check_item', name: 'Feature Check Item', description: 'Feature list item with checkmark' },
  ],
  portfolio: [
    { id: 'project_thumbnail', name: 'Project Thumbnail', description: 'Project preview with hover effect' },
    { id: 'skill_tag', name: 'Skill Tag', description: 'Technology/skill badge' },
  ],
  jam: [],
};

// ═══════════════════════════════════════════════════════════════
// Page Section Definitions
// ═══════════════════════════════════════════════════════════════

export interface PageSection {
  id: string;
  name: string;
  description: string;
}

/**
 * Predefined page sections for mockups by category
 */
export const CATEGORY_PAGE_SECTIONS: Record<DesignCategory, PageSection[]> = {
  blog: [
    { id: 'nav', name: 'Navigation', description: 'Top navigation bar with logo and links' },
    { id: 'hero', name: 'Hero/Featured', description: 'Featured post or welcome header' },
    { id: 'article_grid', name: 'Article Grid', description: 'Grid or list of article previews' },
    { id: 'sidebar', name: 'Sidebar', description: 'Categories, tags, recent posts' },
    { id: 'newsletter_cta', name: 'Newsletter CTA', description: 'Email subscription form' },
    { id: 'footer', name: 'Footer', description: 'Links, copyright, social icons' },
  ],
  ecommerce: [
    { id: 'nav', name: 'Navigation', description: 'Top nav with logo, search, cart icon' },
    { id: 'hero_banner', name: 'Hero Banner', description: 'Promotional banner or featured products' },
    { id: 'product_grid', name: 'Product Grid', description: 'Grid of product cards' },
    { id: 'product_detail', name: 'Product Detail', description: 'Single product with images, price, buy button' },
    { id: 'cart_summary', name: 'Cart Summary', description: 'Mini cart or cart page summary' },
    { id: 'footer', name: 'Footer', description: 'Links, payment icons, trust badges' },
  ],
  dashboard: [
    { id: 'sidebar_nav', name: 'Sidebar Navigation', description: 'Left sidebar with menu items' },
    { id: 'top_bar', name: 'Top Bar', description: 'Header with search, notifications, profile' },
    { id: 'stats_row', name: 'Stats Row', description: 'Row of KPI stat cards' },
    { id: 'data_table', name: 'Data Table', description: 'Sortable, filterable data table' },
    { id: 'chart_area', name: 'Chart Area', description: 'Charts and graphs section' },
    { id: 'activity_feed', name: 'Activity Feed', description: 'Recent activity or notifications list' },
  ],
  documentation: [
    { id: 'sidebar_nav', name: 'Sidebar Navigation', description: 'Left sidebar with section tree' },
    { id: 'breadcrumb_header', name: 'Breadcrumb Header', description: 'Breadcrumb path and page title' },
    { id: 'content_area', name: 'Content Area', description: 'Main documentation content' },
    { id: 'toc_sidebar', name: 'TOC Sidebar', description: 'Right sidebar table of contents' },
    { id: 'footer', name: 'Footer', description: 'Navigation links, edit on GitHub' },
  ],
  chat_messaging: [
    { id: 'conversation_list', name: 'Conversation List', description: 'List of chat conversations' },
    { id: 'chat_header', name: 'Chat Header', description: 'Contact name, status, actions' },
    { id: 'message_area', name: 'Message Area', description: 'Scrollable message history' },
    { id: 'input_area', name: 'Input Area', description: 'Message input with send button' },
  ],
  landing_page: [
    { id: 'nav', name: 'Navigation', description: 'Top nav with logo and CTA button' },
    { id: 'hero', name: 'Hero', description: 'Main headline, subheading, CTA' },
    { id: 'features_grid', name: 'Features Grid', description: 'Feature icons with descriptions' },
    { id: 'social_proof', name: 'Social Proof', description: 'Logos, numbers, or trust indicators' },
    { id: 'testimonials', name: 'Testimonials', description: 'Customer quotes or reviews' },
    { id: 'cta', name: 'CTA Section', description: 'Final call to action' },
    { id: 'footer', name: 'Footer', description: 'Links, legal, social icons' },
  ],
  saas_marketing: [
    { id: 'nav', name: 'Navigation', description: 'Top nav with logo, links, sign up button' },
    { id: 'hero', name: 'Hero', description: 'Product headline, screenshot, CTA' },
    { id: 'features', name: 'Features', description: 'Key feature highlights' },
    { id: 'pricing_table', name: 'Pricing Table', description: 'Pricing tiers comparison' },
    { id: 'testimonials', name: 'Testimonials', description: 'Customer success stories' },
    { id: 'faq', name: 'FAQ', description: 'Frequently asked questions' },
    { id: 'cta', name: 'CTA Section', description: 'Final sign up prompt' },
    { id: 'footer', name: 'Footer', description: 'Product links, legal, social' },
  ],
  portfolio: [
    { id: 'nav', name: 'Navigation', description: 'Simple nav with name and links' },
    { id: 'hero_intro', name: 'Hero/Intro', description: 'Personal introduction and photo' },
    { id: 'project_grid', name: 'Project Grid', description: 'Portfolio of work samples' },
    { id: 'about_section', name: 'About Section', description: 'Bio, skills, experience' },
    { id: 'contact_form', name: 'Contact Form', description: 'Get in touch form' },
    { id: 'footer', name: 'Footer', description: 'Social links, copyright' },
  ],
  jam: [],
};

// ═══════════════════════════════════════════════════════════════
// Design Approaches (merged from StyleApproach + LayoutBlueprint)
// ═══════════════════════════════════════════════════════════════

export interface DesignApproach {
  id: string;
  name: string;
  description: string;
  characteristics: string[];
  containerWidth: 'narrow' | 'medium' | 'wide' | 'full-width';
  navPlacement: 'top-bar' | 'sidebar-left' | 'overlay' | 'minimal' | 'hidden';
}

/**
 * Design approaches per category - conceptual descriptions to inspire structural variety
 * Each category has 4-6 distinct approaches the AI can draw from
 */
export const CATEGORY_DESIGN_APPROACHES: Record<DesignCategory, DesignApproach[]> = {
  blog: [
    {
      id: 'centered-reader',
      name: 'Centered Reader',
      description: 'Typography-focused single column optimized for reading. Articles separated by whitespace or subtle dividers. No sidebar, no grid. Content breathes.',
      characteristics: ['single column', 'generous line-height', 'article separators', 'typography-focused', 'minimal navigation'],
      containerWidth: 'narrow',
      navPlacement: 'minimal',
    },
    {
      id: 'sidebar-navigation',
      name: 'Sidebar Navigation',
      description: 'Fixed left sidebar with categories, tags, and navigation. Main content scrolls independently. Good for blogs with many categories.',
      characteristics: ['fixed sidebar', 'category navigation', 'scrollable content', 'two-panel layout'],
      containerWidth: 'medium',
      navPlacement: 'sidebar-left',
    },
    {
      id: 'magazine-grid',
      name: 'Magazine Grid',
      description: 'Editorial feel with multi-column article grid. Featured article spans wider. Image-heavy with strong visual hierarchy.',
      characteristics: ['multi-column grid', 'featured articles', 'image thumbnails', 'editorial feel', 'category sections'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'timeline-feed',
      name: 'Timeline Feed',
      description: 'Social-feed inspired vertical timeline. Date markers on the side. Narrow and focused, feels like scrolling through updates.',
      characteristics: ['vertical timeline', 'date markers', 'narrow feed', 'social-inspired', 'chronological flow'],
      containerWidth: 'narrow',
      navPlacement: 'top-bar',
    },
    {
      id: 'technical-docs-style',
      name: 'Technical Docs Style',
      description: 'Code-focused with prominent code blocks that break out wider than text. Sticky table of contents on the side. Monospace accents.',
      characteristics: ['wide code blocks', 'sticky TOC', 'monospace accents', 'technical feel', 'syntax highlighting'],
      containerWidth: 'medium',
      navPlacement: 'sidebar-left',
    },
  ],
  landing_page: [
    {
      id: 'full-bleed-cinematic',
      name: 'Full-Bleed Cinematic',
      description: 'Dramatic full-viewport sections stacking vertically. Transparent overlay navigation. Large headlines, centered content, immersive feel.',
      characteristics: ['full-viewport sections', 'transparent nav', 'dramatic typography', 'centered content', 'immersive scroll'],
      containerWidth: 'full-width',
      navPlacement: 'overlay',
    },
    {
      id: 'split-sections',
      name: 'Split Sections',
      description: 'Alternating 50/50 horizontal splits. Content on one side, visual on the other, flipping each section. Strong horizontal rhythm.',
      characteristics: ['50/50 splits', 'alternating sides', 'content and visual pairs', 'horizontal rhythm', 'full-width sections'],
      containerWidth: 'full-width',
      navPlacement: 'top-bar',
    },
    {
      id: 'bento-features',
      name: 'Bento Features',
      description: 'Features displayed in a bento-style grid with tiles of varying sizes. No traditional section order. Playful, modern, tile-based.',
      characteristics: ['bento grid', 'varying tile sizes', 'non-traditional layout', 'playful arrangement', 'rounded tiles'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'narrow-storytelling',
      name: 'Narrow Storytelling',
      description: 'Narrow single column with narrative flow. Reads like a story or letter. No grids, just flowing text and occasional illustrations.',
      characteristics: ['narrative flow', 'single column', 'storytelling approach', 'conversational', 'minimal structure'],
      containerWidth: 'narrow',
      navPlacement: 'minimal',
    },
    {
      id: 'product-showcase',
      name: 'Product Showcase',
      description: 'Hero dominated by product screenshots or demos. Features shown alongside product UI. Demo-first, visual-heavy approach.',
      characteristics: ['product screenshots', 'demo-focused', 'UI showcases', 'visual features', 'product-led'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
  ],
  ecommerce: [
    {
      id: 'catalog-grid',
      name: 'Catalog Grid',
      description: 'Classic shopping layout with filter sidebar and product grid. Sort options, pagination or infinite scroll. Familiar e-commerce pattern.',
      characteristics: ['filter sidebar', 'product grid', 'sort options', 'familiar shopping UX', 'category navigation'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'editorial-shop',
      name: 'Editorial Shop',
      description: 'Magazine-like browsing with large hero products and horizontal scroll rows. Lifestyle imagery, curated collections feel.',
      characteristics: ['large product heroes', 'horizontal scroll', 'lifestyle imagery', 'curated feel', 'editorial layout'],
      containerWidth: 'full-width',
      navPlacement: 'top-bar',
    },
    {
      id: 'single-product-focus',
      name: 'Single Product Focus',
      description: 'Large product display with image gallery. Details prominent, minimal navigation. Great for hero products or limited catalogs.',
      characteristics: ['large product images', 'image gallery', 'prominent details', 'minimal distractions', 'focused UX'],
      containerWidth: 'medium',
      navPlacement: 'minimal',
    },
    {
      id: 'boutique-minimal',
      name: 'Boutique Minimal',
      description: 'Luxury feel with lots of whitespace. Products displayed sparingly with large imagery. Minimal UI chrome, exclusive aesthetic.',
      characteristics: ['generous whitespace', 'large imagery', 'minimal UI', 'luxury feel', 'exclusive aesthetic'],
      containerWidth: 'medium',
      navPlacement: 'minimal',
    },
    {
      id: 'marketplace-dense',
      name: 'Marketplace Dense',
      description: 'High-density product listings like a marketplace. Many products visible at once, compact cards, reviews prominent.',
      characteristics: ['dense listings', 'compact cards', 'reviews visible', 'many products', 'marketplace feel'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
  ],
  dashboard: [
    {
      id: 'classic-sidebar',
      name: 'Classic Sidebar',
      description: 'Traditional dashboard with dark left sidebar and top bar. Stats cards, charts, and tables in the main content area.',
      characteristics: ['dark sidebar', 'top bar', 'stats cards', 'charts', 'data tables'],
      containerWidth: 'full-width',
      navPlacement: 'sidebar-left',
    },
    {
      id: 'top-tabs',
      name: 'Top Tabs',
      description: 'No sidebar, navigation via horizontal tabs. Content width constrained. Cleaner, less chrome, focus on content.',
      characteristics: ['horizontal tabs', 'no sidebar', 'constrained width', 'clean layout', 'tab-based navigation'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'minimal-focus',
      name: 'Minimal Focus',
      description: 'Icon rail plus expandable panel. Minimal chrome, maximum focus on the task. Single-purpose feel.',
      characteristics: ['icon rail', 'expandable panel', 'minimal chrome', 'focused UX', 'single-purpose feel'],
      containerWidth: 'full-width',
      navPlacement: 'sidebar-left',
    },
    {
      id: 'data-dense',
      name: 'Data Dense',
      description: 'Maximum information density. Full viewport tables, compact rows, small font. For power users who need to see lots of data.',
      characteristics: ['high density', 'compact rows', 'full viewport', 'power user focused', 'data-first'],
      containerWidth: 'full-width',
      navPlacement: 'sidebar-left',
    },
    {
      id: 'kanban-board',
      name: 'Kanban Board',
      description: 'Column-based board layout like Trello. Cards move between columns. Horizontal scrolling if many columns.',
      characteristics: ['column layout', 'draggable cards', 'status columns', 'horizontal scroll', 'visual workflow'],
      containerWidth: 'full-width',
      navPlacement: 'top-bar',
    },
  ],
  documentation: [
    {
      id: 'three-column',
      name: 'Three Column',
      description: 'Classic docs layout: left sidebar for navigation, main content, right sidebar for on-page TOC. Comprehensive but structured.',
      characteristics: ['left sidebar nav', 'right TOC', 'three columns', 'comprehensive layout', 'structured navigation'],
      containerWidth: 'full-width',
      navPlacement: 'sidebar-left',
    },
    {
      id: 'centered-single',
      name: 'Centered Single',
      description: 'Clean single-column reading with collapsible sidebar. Focused on content, less visual noise. Good for tutorials.',
      characteristics: ['single column', 'collapsible sidebar', 'focused reading', 'clean layout', 'tutorial-friendly'],
      containerWidth: 'medium',
      navPlacement: 'hidden',
    },
    {
      id: 'api-reference-split',
      name: 'API Reference Split',
      description: 'Split layout with documentation on one side and code examples on the other. Side-by-side learning, code-heavy.',
      characteristics: ['split layout', 'code examples', 'side-by-side', 'API-focused', 'language tabs'],
      containerWidth: 'full-width',
      navPlacement: 'sidebar-left',
    },
    {
      id: 'search-first',
      name: 'Search First',
      description: 'Prominent search bar as the main entry point. Quick links and categories below. Optimized for finding content fast.',
      characteristics: ['prominent search', 'quick links', 'category cards', 'find-first', 'minimal browsing'],
      containerWidth: 'medium',
      navPlacement: 'top-bar',
    },
  ],
  chat_messaging: [
    {
      id: 'three-panel',
      name: 'Three Panel',
      description: 'Slack-style with conversation list, main chat, and details/thread panel. Full-featured messaging interface.',
      characteristics: ['conversation list', 'main chat', 'details panel', 'full-featured', 'desktop-focused'],
      containerWidth: 'full-width',
      navPlacement: 'sidebar-left',
    },
    {
      id: 'centered-bubble',
      name: 'Centered Bubble',
      description: 'Simple iMessage-style centered chat. Bubble messages, minimal chrome. Clean and focused on the conversation.',
      characteristics: ['chat bubbles', 'centered layout', 'minimal chrome', 'mobile-inspired', 'focused conversation'],
      containerWidth: 'narrow',
      navPlacement: 'top-bar',
    },
    {
      id: 'support-widget',
      name: 'Support Widget',
      description: 'Floating widget style with launcher button. Compact, embedded feel. Quick replies, agent info, help articles.',
      characteristics: ['floating widget', 'compact', 'launcher button', 'quick replies', 'help integration'],
      containerWidth: 'narrow',
      navPlacement: 'hidden',
    },
    {
      id: 'ai-chat',
      name: 'AI Chat Interface',
      description: 'Optimized for AI conversations. Thinking indicators, markdown rendering, suggested prompts, response streaming feel.',
      characteristics: ['thinking indicators', 'markdown support', 'suggested prompts', 'streaming feel', 'AI-optimized'],
      containerWidth: 'medium',
      navPlacement: 'minimal',
    },
  ],
  saas_marketing: [
    {
      id: 'section-scroll',
      name: 'Section Scroll',
      description: 'Classic marketing page with distinct sections: hero, features, pricing, testimonials, CTA. Familiar and effective.',
      characteristics: ['distinct sections', 'hero to CTA flow', 'familiar structure', 'conversion-focused', 'section-based'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'product-demo-first',
      name: 'Product Demo First',
      description: 'Lead with product screenshots or interactive demos. Features shown alongside product UI. Demo-driven conversion.',
      characteristics: ['product demos', 'screenshot-heavy', 'interactive elements', 'demo-driven', 'visual proof'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'pricing-focused',
      name: 'Pricing Focused',
      description: 'Pricing table as the hero or near-top. Feature comparison prominent. For products where pricing is the main decision point.',
      characteristics: ['pricing prominent', 'feature comparison', 'tier cards', 'decision-focused', 'comparison tables'],
      containerWidth: 'medium',
      navPlacement: 'top-bar',
    },
    {
      id: 'enterprise-trust',
      name: 'Enterprise Trust',
      description: 'Trust-heavy with security badges, compliance logos, enterprise customer logos. Professional, corporate feel.',
      characteristics: ['security badges', 'customer logos', 'compliance', 'enterprise focus', 'trust signals'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'developer-open-source',
      name: 'Developer / Open Source',
      description: 'GitHub stars, code snippets in hero, contributor-friendly. Terminal aesthetics, developer-focused messaging.',
      characteristics: ['code snippets', 'GitHub integration', 'terminal aesthetic', 'developer-focused', 'open source friendly'],
      containerWidth: 'medium',
      navPlacement: 'top-bar',
    },
  ],
  portfolio: [
    {
      id: 'project-grid',
      name: 'Project Grid',
      description: 'Responsive grid of project thumbnails with hover effects. Filter by category. Classic portfolio layout.',
      characteristics: ['project grid', 'hover effects', 'category filters', 'thumbnail images', 'responsive layout'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
    {
      id: 'case-study-scroll',
      name: 'Case Study Scroll',
      description: 'Long-form case study focus. Narrow content with full-bleed images breaking out. Process documentation, results metrics.',
      characteristics: ['long-form', 'full-bleed images', 'process documentation', 'results metrics', 'narrative flow'],
      containerWidth: 'medium',
      navPlacement: 'minimal',
    },
    {
      id: 'bento-showcase',
      name: 'Bento Showcase',
      description: 'Bento-style grid with mixed tile sizes. About, projects, skills, links as different tiles. Modern CV-like feel.',
      characteristics: ['bento grid', 'mixed tiles', 'about and projects', 'modern CV', 'visual variety'],
      containerWidth: 'wide',
      navPlacement: 'minimal',
    },
    {
      id: 'photography-gallery',
      name: 'Photography Gallery',
      description: 'Image-first with minimal text. Masonry or uniform grid. Lightbox viewing. For visual-heavy portfolios.',
      characteristics: ['image-first', 'masonry grid', 'lightbox viewing', 'minimal text', 'visual focus'],
      containerWidth: 'wide',
      navPlacement: 'minimal',
    },
    {
      id: 'agency-team',
      name: 'Agency / Team',
      description: 'Multiple team members showcased. Services grid, client logos, team photos. Agency or studio feel.',
      characteristics: ['team showcase', 'services grid', 'client logos', 'agency feel', 'multiple people'],
      containerWidth: 'wide',
      navPlacement: 'top-bar',
    },
  ],
  jam: [],
};

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get all components for a category (base + category-specific)
 */
export function getComponentsForCategory(category: DesignCategory): AtomicComponent[] {
  const categoryComponents = CATEGORY_ATOMIC_COMPONENTS[category] || [];
  return [...BASE_ATOMIC_COMPONENTS, ...categoryComponents];
}

/**
 * Get page sections for a category
 */
export function getSectionsForCategory(category: DesignCategory): PageSection[] {
  return CATEGORY_PAGE_SECTIONS[category] || [];
}

/**
 * Get design approaches for a category
 */
export function getDesignApproachesForCategory(category: DesignCategory): DesignApproach[] {
  return CATEGORY_DESIGN_APPROACHES[category] || [];
}

/**
 * Get component list as formatted string for prompts
 */
export function getComponentListForPrompt(category: DesignCategory): string {
  const components = getComponentsForCategory(category);
  return components
    .map((c) => {
      let line = `- **${c.name}** [id: \`${c.id}\`]: ${c.description}`;
      if (c.variants && c.variants.length > 0) {
        line += ` (variants: ${c.variants.join(', ')})`;
      }
      return line;
    })
    .join('\n');
}

/**
 * Get section list as formatted string for prompts
 */
export function getSectionListForPrompt(category: DesignCategory): string {
  const sections = getSectionsForCategory(category);
  return sections.map((s) => `- **${s.name}** [id: \`${s.id}\`]: ${s.description}`).join('\n');
}

/**
 * Get design approaches formatted for prompt injection
 */
export function getDesignApproachesForPrompt(category: DesignCategory): string {
  const approaches = getDesignApproachesForCategory(category);
  if (approaches.length === 0) return '';

  return approaches
    .map(
      (a) =>
        `### ${a.name}\n` +
        `${a.description}\n` +
        `- Container: ${a.containerWidth}\n` +
        `- Nav: ${a.navPlacement}\n` +
        `- Traits: ${a.characteristics.join(', ')}`
    )
    .join('\n\n');
}
