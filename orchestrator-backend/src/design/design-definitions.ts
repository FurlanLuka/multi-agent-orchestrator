import { DesignCategory } from '@orchy/types';

/**
 * Design Definitions - Predefined components and sections for design generation
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
};

// ═══════════════════════════════════════════════════════════════
// Component Style Approaches
// ═══════════════════════════════════════════════════════════════

export interface StyleApproach {
  id: string;
  name: string;
  description: string;
  characteristics: string[];
}

/**
 * Visually distinct style approaches for component generation
 * The LLM picks 3 from these to create truly different options
 */
export const COMPONENT_STYLE_APPROACHES: StyleApproach[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean and understated with plenty of breathing room',
    characteristics: [
      'No shadows',
      'Thin 1px borders',
      'Generous whitespace',
      'Subtle hover states',
      'Restrained use of color',
    ],
  },
  {
    id: 'elevated',
    name: 'Elevated',
    description: 'Layered depth with soft shadows and floating elements',
    characteristics: [
      'Soft drop shadows (shadow-md to shadow-lg)',
      'Floating cards effect',
      'Depth layering',
      'Subtle border-radius',
      'Background elevation changes',
    ],
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'High contrast with thick borders and chunky elements',
    characteristics: [
      'Thick 2-3px borders',
      'High contrast colors',
      'Chunky buttons and inputs',
      'Strong visual weight',
      'Prominent hover states',
    ],
  },
  {
    id: 'soft',
    name: 'Soft',
    description: 'Gentle curves and pastel-tinted backgrounds',
    characteristics: [
      'Very rounded corners (lg to full)',
      'Pastel background tints',
      'Gentle color transitions',
      'Rounded pills for tags/badges',
      'Soft gradients optional',
    ],
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'Modern glassmorphism with blur effects and transparency',
    characteristics: [
      'backdrop-blur effects',
      'Semi-transparent backgrounds (bg-opacity)',
      'Frosted glass appearance',
      'Subtle borders for definition',
      'Light reflections via gradients',
    ],
  },
];

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
 * Get component list as formatted string for prompts
 */
export function getComponentListForPrompt(category: DesignCategory): string {
  const components = getComponentsForCategory(category);
  return components
    .map((c) => {
      let line = `- ${c.name}: ${c.description}`;
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
  return sections.map((s) => `- ${s.name}: ${s.description}`).join('\n');
}

/**
 * Get style approaches as formatted string for prompts
 */
export function getStyleApproachesForPrompt(): string {
  return COMPONENT_STYLE_APPROACHES.map(
    (s) => `**${s.name}**: ${s.description}\n  - ${s.characteristics.join('\n  - ')}`
  ).join('\n\n');
}
