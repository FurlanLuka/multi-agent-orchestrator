import { DesignReferenceLibrary } from '@orchy/types';

export const designReferences: DesignReferenceLibrary = {
  categories: {
    blog: {
      description: "Personal blogs, company blogs, newsletters",
      styles: [
        {
          name: "Minimal",
          description: "Typography-focused, lots of whitespace, clean reading experience",
          characteristics: ["single column", "large type", "minimal navigation", "focus on content"],
          references: [
            { name: "iA Writer Blog", url: "https://ia.net/topics", notes: "Ultra-minimal, focus on content" },
            { name: "Dan Abramov", url: "https://overreacted.io", notes: "Dev blog, simple but distinctive" },
            { name: "Gwern", url: "https://gwern.net", notes: "Long-form essays, typographic focus" }
          ]
        },
        {
          name: "Magazine",
          description: "Image-heavy, grid layouts, editorial feel",
          characteristics: ["multi-column grid", "featured images", "category sections", "author bylines"],
          references: [
            { name: "The Verge", url: "https://theverge.com", notes: "Bold colors, strong grid" },
            { name: "Smashing Magazine", url: "https://smashingmagazine.com", notes: "Tech editorial style" },
            { name: "Aeon", url: "https://aeon.co", notes: "Long-form essays with elegant typography" }
          ]
        },
        {
          name: "Portfolio",
          description: "Project showcases, case study focused",
          characteristics: ["project cards", "case study layouts", "work samples", "visual hierarchy"],
          references: [
            { name: "Lynn Fisher", url: "https://lynnandtonic.com", notes: "Creative portfolio blog" },
            { name: "Josh Comeau", url: "https://joshwcomeau.com", notes: "Interactive dev blog" }
          ]
        }
      ]
    },
    landing_page: {
      description: "Product launches, marketing pages, conversion-focused",
      styles: [
        {
          name: "Hero-focused",
          description: "Large hero section, clear CTA, scrolling features",
          characteristics: ["full-width hero", "primary CTA above fold", "feature sections", "social proof"],
          references: [
            { name: "Linear", url: "https://linear.app", notes: "Clean, product-focused hero" },
            { name: "Stripe", url: "https://stripe.com", notes: "Animated, sophisticated" },
            { name: "Vercel", url: "https://vercel.com", notes: "Developer-focused, dark theme" }
          ]
        },
        {
          name: "Feature Grid",
          description: "Multiple features prominently displayed",
          characteristics: ["bento grid", "icon + text cards", "comparison sections", "visual features"],
          references: [
            { name: "Notion", url: "https://notion.so", notes: "Feature blocks with illustrations" },
            { name: "Raycast", url: "https://raycast.com", notes: "Feature grid with screenshots" }
          ]
        },
        {
          name: "Testimonial-heavy",
          description: "Social proof focused, customer stories",
          characteristics: ["quote carousels", "logo walls", "case study links", "trust badges"],
          references: [
            { name: "Webflow", url: "https://webflow.com", notes: "Customer success stories" },
            { name: "Slack", url: "https://slack.com", notes: "Enterprise social proof" }
          ]
        }
      ]
    },
    ecommerce: {
      description: "Online stores, product catalogs, shopping experiences",
      styles: [
        {
          name: "Grid Catalog",
          description: "Product grid with filters, sort options",
          characteristics: ["product cards", "filter sidebar", "quick view", "pagination"],
          references: [
            { name: "Shopify Dawn", url: "https://themes.shopify.com/themes/dawn", notes: "Modern default theme" },
            { name: "Apple Store", url: "https://apple.com/store", notes: "Premium product presentation" }
          ]
        },
        {
          name: "Featured Products",
          description: "Hero products, curated collections",
          characteristics: ["large product images", "featured sections", "collections", "lifestyle imagery"],
          references: [
            { name: "Allbirds", url: "https://allbirds.com", notes: "Clean, sustainable brand" },
            { name: "Glossier", url: "https://glossier.com", notes: "Lifestyle-focused beauty" }
          ]
        },
        {
          name: "Boutique",
          description: "Luxury feel, minimal products, editorial style",
          characteristics: ["large imagery", "minimal UI", "editorial layouts", "exclusive feel"],
          references: [
            { name: "Aesop", url: "https://aesop.com", notes: "Luxury minimal aesthetic" },
            { name: "SSENSE", url: "https://ssense.com", notes: "Fashion-forward editorial" }
          ]
        }
      ]
    },
    dashboard: {
      description: "Admin panels, analytics, data management interfaces",
      styles: [
        {
          name: "Sidebar Navigation",
          description: "Fixed sidebar, collapsible menu, main content area",
          characteristics: ["sidebar nav", "breadcrumbs", "data tables", "action buttons"],
          references: [
            { name: "Stripe Dashboard", url: "https://dashboard.stripe.com", notes: "Clean data presentation" },
            { name: "GitHub", url: "https://github.com", notes: "Dense but organized" }
          ]
        },
        {
          name: "Top Navigation",
          description: "Horizontal nav, tabs, full-width content",
          characteristics: ["horizontal tabs", "full-width layout", "card sections", "statistics"],
          references: [
            { name: "Vercel Dashboard", url: "https://vercel.com/dashboard", notes: "Project-focused" },
            { name: "Netlify", url: "https://app.netlify.com", notes: "Site management" }
          ]
        },
        {
          name: "Data-dense",
          description: "Maximum information density, tables and charts",
          characteristics: ["data tables", "charts", "filters", "bulk actions"],
          references: [
            { name: "Airtable", url: "https://airtable.com", notes: "Spreadsheet-like density" },
            { name: "Retool", url: "https://retool.com", notes: "Internal tools style" }
          ]
        },
        {
          name: "Minimal/Focused",
          description: "Single-purpose, clean interface, reduced chrome",
          characteristics: ["minimal sidebar", "focus mode", "clean typography", "whitespace"],
          references: [
            { name: "Linear", url: "https://linear.app", notes: "Issue tracking, minimal" },
            { name: "Things", url: "https://culturedcode.com/things", notes: "Task management" }
          ]
        }
      ]
    },
    chat_messaging: {
      description: "Chat interfaces, messaging apps, support widgets",
      styles: [
        {
          name: "Slack-style",
          description: "Channels, threads, rich messages",
          characteristics: ["channel sidebar", "message threads", "reactions", "file uploads"],
          references: [
            { name: "Slack", url: "https://slack.com", notes: "Team messaging standard" },
            { name: "Discord", url: "https://discord.com", notes: "Community-focused" }
          ]
        },
        {
          name: "iMessage-style",
          description: "Bubble conversations, minimal chrome",
          characteristics: ["chat bubbles", "timestamps", "read receipts", "typing indicators"],
          references: [
            { name: "iMessage", url: "https://apple.com/ios/messages", notes: "Consumer messaging" },
            { name: "WhatsApp", url: "https://whatsapp.com", notes: "Simple messaging" }
          ]
        },
        {
          name: "Support Widget",
          description: "Embedded chat, help interface",
          characteristics: ["floating widget", "conversation view", "quick replies", "agent info"],
          references: [
            { name: "Intercom", url: "https://intercom.com", notes: "Customer support" },
            { name: "Zendesk", url: "https://zendesk.com", notes: "Help desk" }
          ]
        }
      ]
    },
    documentation: {
      description: "Technical docs, API references, knowledge bases",
      styles: [
        {
          name: "Sidebar TOC",
          description: "Sidebar table of contents, main content",
          characteristics: ["sidebar navigation", "on-page TOC", "code blocks", "version switcher"],
          references: [
            { name: "Stripe Docs", url: "https://stripe.com/docs", notes: "Gold standard API docs" },
            { name: "Tailwind Docs", url: "https://tailwindcss.com/docs", notes: "Clean utility docs" }
          ]
        },
        {
          name: "Search-focused",
          description: "Prominent search, quick access",
          characteristics: ["search bar", "quick links", "categories", "recent pages"],
          references: [
            { name: "Algolia DocSearch", url: "https://docsearch.algolia.com", notes: "Search-first docs" },
            { name: "Vercel Docs", url: "https://vercel.com/docs", notes: "Clean search-focused" }
          ]
        },
        {
          name: "API Reference",
          description: "Endpoint listings, request/response examples",
          characteristics: ["endpoint list", "code examples", "try it out", "response schemas"],
          references: [
            { name: "Stripe API Reference", url: "https://stripe.com/docs/api", notes: "Interactive API docs" },
            { name: "Twilio API", url: "https://twilio.com/docs/api", notes: "Comprehensive reference" }
          ]
        }
      ]
    },
    saas_marketing: {
      description: "SaaS product marketing, pricing pages, enterprise",
      styles: [
        {
          name: "Pricing-focused",
          description: "Pricing tiers, feature comparison",
          characteristics: ["pricing cards", "feature tables", "toggle monthly/annual", "enterprise CTA"],
          references: [
            { name: "Notion Pricing", url: "https://notion.so/pricing", notes: "Clean tier comparison" },
            { name: "Slack Pricing", url: "https://slack.com/pricing", notes: "Enterprise tiers" }
          ]
        },
        {
          name: "Demo-first",
          description: "Interactive demo, video showcases",
          characteristics: ["video hero", "interactive demo", "use case sections", "customer quotes"],
          references: [
            { name: "Figma", url: "https://figma.com", notes: "Design tool marketing" },
            { name: "Miro", url: "https://miro.com", notes: "Collaboration focus" }
          ]
        },
        {
          name: "Enterprise",
          description: "Trust signals, security, compliance",
          characteristics: ["security badges", "compliance certifications", "case studies", "contact sales"],
          references: [
            { name: "Okta", url: "https://okta.com", notes: "Enterprise security" },
            { name: "Datadog", url: "https://datadoghq.com", notes: "Enterprise observability" }
          ]
        }
      ]
    },
    portfolio: {
      description: "Personal portfolios, agency sites, creative showcases",
      styles: [
        {
          name: "Project Cards",
          description: "Grid of project thumbnails, hover effects",
          characteristics: ["project grid", "hover previews", "category filters", "thumbnail images"],
          references: [
            { name: "Dribbble", url: "https://dribbble.com", notes: "Design portfolio grid" },
            { name: "Behance", url: "https://behance.net", notes: "Creative portfolios" }
          ]
        },
        {
          name: "Case Study",
          description: "In-depth project documentation",
          characteristics: ["process documentation", "before/after", "results metrics", "long-form"],
          references: [
            { name: "Pentagram", url: "https://pentagram.com", notes: "Agency case studies" },
            { name: "IDEO", url: "https://ideo.com", notes: "Design thinking cases" }
          ]
        },
        {
          name: "Bento Grid",
          description: "Mixed-size tiles, creative layouts",
          characteristics: ["varied card sizes", "creative arrangement", "mixed content", "visual interest"],
          references: [
            { name: "Apple Services", url: "https://apple.com/services", notes: "Bento-style layout" },
            { name: "Read.cv", url: "https://read.cv", notes: "Modern portfolio bento" }
          ]
        }
      ]
    }
  }
};
