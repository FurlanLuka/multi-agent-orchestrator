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
            { name: "iA Writer Blog", url: "https://ia.net/topics", notes: "Ultra-minimal single column with narrow container. No sidebar, no grid. Navigation is just a logo and a few text links. Articles separated by generous whitespace. Typography-driven design with large body text and generous line-height. Almost no color outside of text. Footer is a single line of links." },
            { name: "Dan Abramov", url: "https://overreacted.io", notes: "Dark background, narrow centered container. Zero images, zero cards, zero grid — just a list of article titles with dates like a directory listing. Article pages have enormous line-height, code blocks break out slightly wider than text. Navigation is just the blog name as a link. Single accent color for links." },
            { name: "Gwern", url: "https://gwern.net", notes: "Long-form essays with extreme typographic care. Serif body text with sidenotes displayed in the margin on wide screens instead of footnotes. Table of contents as a sticky right sidebar on desktop. Very long pages with internal anchor links. Minimal chrome — no header images, no cards, no grid layouts. Academic, scholarly feel." }
          ]
        },
        {
          name: "Magazine",
          description: "Image-heavy, grid layouts, editorial feel",
          characteristics: ["multi-column grid", "featured images", "category sections", "author bylines"],
          references: [
            { name: "The Verge", url: "https://theverge.com", notes: "Bold, colorful editorial design. Full-width layout with no max-width container. Asymmetric grid where featured story takes more space than sidebar stories. Heavy use of category color coding. Large hero images, thick sans-serif headlines. Sticky top nav with search. Cards have minimal chrome — just image, headline, and byline." },
            { name: "Smashing Magazine", url: "https://smashingmagazine.com", notes: "Tech editorial with strong accent color. Article grid uses multiple columns with featured article spanning more space. Each card has: large thumbnail, category tag, title, excerpt, author avatar and name. Left sidebar on article pages with table of contents. Code blocks are prominent with syntax highlighting. Rounded corners on cards." },
            { name: "Aeon", url: "https://aeon.co", notes: "Elegant long-form essays. Clean serif typography with moderate content width on article pages. Homepage uses a multi-column grid with large featured image spanning full width. Muted earth tones, minimal UI chrome. Article headers have full-bleed hero images. Subtle animations on scroll. Very generous vertical spacing between articles." }
          ]
        },
        {
          name: "Portfolio Blog",
          description: "Project showcases, case study focused",
          characteristics: ["project cards", "case study layouts", "work samples", "visual hierarchy"],
          references: [
            { name: "Lynn Fisher", url: "https://lynnandtonic.com", notes: "Creative, playful personal site that redesigns annually. Projects displayed as large image cards in a loose grid. Bold colors, hand-drawn elements, personality-driven. Navigation is minimal — just a few text links. Strong use of hover effects on project thumbnails. Footer is personal and conversational." },
            { name: "Josh Comeau", url: "https://joshwcomeau.com", notes: "Interactive developer blog with custom components embedded in articles. Dark mode default with moderate content width. Articles have animated code snippets and interactive demos inline. Left-aligned layout with generous margins. Playful design touches — confetti on page load, spring animations. Category tags are colorful pills. Multi-column grid for article listing." }
          ]
        },
        {
          name: "Dev Blog / Technical",
          description: "Sidebar table of contents, code blocks, wide breakout code sections",
          characteristics: ["sidebar TOC", "syntax-highlighted code", "wide code breakouts", "technical typography"],
          references: [
            { name: "Stripe Blog", url: "https://stripe.com/blog", notes: "Clean, corporate-yet-approachable. Moderate width for listing, narrower for article body. Article pages have a sticky right-side TOC. Code blocks break out wider than body text. Subtle gradient accents. Cards on listing page are minimal: title, date, category tag, few images. Dark code blocks with custom syntax theme." },
            { name: "Vercel Blog", url: "https://vercel.com/blog", notes: "Dark theme option prominent. Moderate article width. Code blocks are the star — large, well-formatted with file name tabs. Inline code uses a subtle background highlight. Article listing is a simple vertical stack, no grid. Each entry: date, title, excerpt. Minimal imagery. Strong monospace font usage for technical content." }
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
            { name: "Linear", url: "https://linear.app", notes: "Dark background with enormous hero headline using fluid typography (scales with viewport). Muted subheading, single accent-colored CTA button, no hero image. Fixed transparent nav with logo left, links center, CTAs right. Below hero: product screenshot in a glowing frame. Feature sections use left-aligned text with floating UI screenshots on right. Very minimal — no testimonial cards, no 3-column grids. Subtle gradient glows behind product images." },
            { name: "Stripe", url: "https://stripe.com", notes: "Signature gradient background. Hero around 60vh with large bold headline, subtext, and two CTAs side by side. Below: animated code plus dashboard preview side by side. Features use alternating 50/50 splits (text left/visual right, then reversed). No traditional 3-column grid anywhere. Social proof is a logo bar, not cards." },
            { name: "Vercel", url: "https://vercel.com", notes: "Dark theme throughout. Hero is centered with massive headline using gradient text effect, terminal-style code snippet below, single light CTA. No hero image. Feature sections each get their own full-width dark section with centered content and floating code/UI previews. Uses a 2-column layout for feature details. Logo wall for social proof. Minimal fixed dark nav." }
          ]
        },
        {
          name: "Feature Grid",
          description: "Multiple features prominently displayed in bento or grid layouts",
          characteristics: ["bento grid", "icon + text cards", "comparison sections", "visual features"],
          references: [
            { name: "Notion", url: "https://notion.so", notes: "Clean light background. Features displayed in a multi-column grid with playful illustrations in each card. Cards have rounded corners, subtle shadows, generous padding. Hero section: centered headline, subtext, and product screenshot floating below with subtle shadow. Below features: use-case sections with alternating image/text. Friendly approachable typography." },
            { name: "Raycast", url: "https://raycast.com", notes: "Dark theme with vibrant accent colors. Feature grid uses a bento-style layout: 4 columns with items spanning different column and row counts. Each tile has a colored icon, headline, and short description. Hero: split layout with text left and animated product UI right. Extensions gallery below as a horizontal scroll row. Uses depth through subtle gradients and glows, not shadows." }
          ]
        },
        {
          name: "Narrow Storytelling",
          description: "Narrow container, narrative scrolling, storytelling approach",
          characteristics: ["narrow single column", "narrative flow", "long-scroll", "minimal grid usage"],
          references: [
            { name: "Basecamp", url: "https://basecamp.com", notes: "Narrow container with single column storytelling. Large friendly headline followed by narrative that reads like a letter. Hand-drawn illustrations scattered inline. No bento grid, no 3-column features. Uses alternating text blocks and illustrations. Conversational copywriting tone. Pricing is a single simple card, not a comparison table. Very personality-driven, anti-corporate aesthetic." },
            { name: "Arc Browser", url: "https://arc.net", notes: "Playful narrow layout. Hero with single bold headline and animated product showcase below. Features revealed through scroll-driven animations — each feature gets a full-screen section with centered description and floating browser screenshot. No traditional grid. Vibrant gradients and custom cursor effects. Navigation is minimal — just logo and download button." }
          ]
        }
      ]
    },
    ecommerce: {
      description: "Online stores, product catalogs, shopping experiences",
      styles: [
        {
          name: "Grid Catalog",
          description: "Product grid with filters, sort options, classic shopping layout",
          characteristics: ["product cards", "filter sidebar", "quick view", "pagination"],
          references: [
            { name: "Shopify Dawn", url: "https://themes.shopify.com/themes/dawn", notes: "Clean modern default. Layout: collapsible filter sidebar plus main content area. Product grid uses responsive auto-fill columns. Product cards: square image, title below, price, optional color swatches. Sticky filter sidebar on scroll. Top bar: sort dropdown plus grid/list view toggle. Minimal shadows, subtle border-radius." },
            { name: "Apple Store", url: "https://apple.com/store", notes: "Premium, spacious. No filter sidebar — categories are horizontal tabs at top. Product 'cards' are more like full-width sections with huge product images. Pricing prominent with monthly payment option. Very generous whitespace between products. No traditional grid — products displayed in curated rows with editorial-style descriptions." }
          ]
        },
        {
          name: "Featured Products",
          description: "Hero products, curated collections, lifestyle-driven",
          characteristics: ["large product images", "featured sections", "collections", "lifestyle imagery"],
          references: [
            { name: "Allbirds", url: "https://allbirds.com", notes: "Full-width hero with lifestyle photography and overlaid text. Product sections use horizontal scroll carousels. Product cards: large tall image, minimal text below — just name and price. Color swatches as small circles. Collection pages: 2-column grid. Earthy aesthetic with rounded corners. Sustainability messaging woven throughout." },
            { name: "Glossier", url: "https://glossier.com", notes: "Soft pink accent, very clean. Hero: full-width lifestyle image with text overlay. Products displayed in a 4-column grid on category pages. Product cards: square image, name, price, 'Add to Bag' button on hover. Minimal UI chrome — no borders on cards. Uses a lot of negative space. Product detail: large image left, details right. Playful typography." }
          ]
        },
        {
          name: "Boutique",
          description: "Luxury feel, minimal products, editorial style",
          characteristics: ["large imagery", "minimal UI", "editorial layouts", "exclusive feel"],
          references: [
            { name: "Aesop", url: "https://aesop.com", notes: "Ultra-refined luxury aesthetic. Serif typography for headings. Muted earth palette. Product pages: enormous product image taking most of viewport, tiny text below. No grid on homepage — full-bleed lifestyle images alternating with text blocks. Product listing: spacious grid with each card being just an image and product name. No prices on cards. Zero shadows, minimal borders." },
            { name: "SSENSE", url: "https://ssense.com", notes: "Fashion-forward, dense. All-caps sans-serif navigation. Product grid: 4 columns with very tight gaps. Product images: full-bleed within card, no padding. Hover state: shows second product image. Black and white UI with product images providing all color. Horizontal scrolling category tabs. Product detail: image takes majority width, sticky details panel on right." }
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
            { name: "Stripe Dashboard", url: "https://dashboard.stripe.com", notes: "Left sidebar (dark or light variant) collapsible to icon rail. Top bar: breadcrumbs, search, notifications, avatar. Main content has comfortable padding. KPI cards in a multi-column grid at top. Data tables: full-width, zebra striping, sortable headers, row hover highlight. Charts use gradient fills. Fluid width layout." },
            { name: "GitHub", url: "https://github.com", notes: "Dense but organized. No persistent sidebar — uses top horizontal tabs plus repository-level horizontal nav. Fluid content area with max-width constraint. Heavy use of tables for issues, PRs, actions. Subtle border separators. Small font size for density. Monospace for code and hashes. Left sidebar on repo page shows file tree." }
          ]
        },
        {
          name: "Top Navigation",
          description: "Horizontal nav, tabs, full-width content",
          characteristics: ["horizontal tabs", "full-width layout", "card sections", "statistics"],
          references: [
            { name: "Vercel Dashboard", url: "https://vercel.com/dashboard", notes: "Dark/light theme toggle. No sidebar — uses horizontal tabs for project switching. Project cards in a responsive grid. Each card: project name, status indicator, last deployment date, framework icon. Deployment detail: vertical timeline with status badges. Constrained max-width. Minimal borders, subtle shadows. Search bar prominently placed. Monospace for deployment hashes." },
            { name: "Netlify", url: "https://app.netlify.com", notes: "Accent color in brand teal. Top nav: logo, team selector, horizontal links. Site cards in multi-column grid. Each card: screenshot thumbnail, site name, URL, last published date. Deploy log: terminal-style output. Settings: left sidebar within the site view. Constrained max-width. Clean corporate feel with slight shadows on cards." }
          ]
        },
        {
          name: "Data-dense",
          description: "Maximum information density, tables and charts",
          characteristics: ["data tables", "charts", "filters", "bulk actions"],
          references: [
            { name: "Airtable", url: "https://airtable.com", notes: "Spreadsheet-like density. Full viewport — no max-width, no padding. Column-resizable data grid dominates the view. Cell types: text, number, checkbox, attachment, link. Toolbar above table: views, filters, sort, group, color. Left sidebar: list of tables in the base. Compact row height for maximum density. Uses color-coded record fields. No shadows or cards in table view — pure data." },
            { name: "Retool", url: "https://retool.com", notes: "Internal tools builder. Dense UI with left icon rail plus component panel. Canvas area: drag-and-drop components. Tables are the primary component: compact rows, inline editing, bulk selection checkboxes. Dark sidebar with light content area. Small border-radius. Lots of small text. Compact action buttons." }
          ]
        },
        {
          name: "Minimal/Focused",
          description: "Single-purpose, clean interface, reduced chrome",
          characteristics: ["minimal sidebar", "focus mode", "clean typography", "whitespace"],
          references: [
            { name: "Linear", url: "https://linear.app", notes: "Keyboard-first, minimal chrome. Collapsible left sidebar (dark variant). Main content: list view with compact rows, each row showing icon, issue title, status, assignee, priority. No cards, no grid — pure list. Command palette for navigation. Very fast transitions. Custom icons. Fluid width. Views: list, board, timeline — all minimal and clean." },
            { name: "Things", url: "https://culturedcode.com/things", notes: "Mac-native feel translated to web. Simple list interface with checkboxes. No data tables, no charts — just tasks. Generous line-height in task lists. Subtle accent for today items. Very clean: light background, minimal borders, just content. Sidebar shows: Inbox, Today, Upcoming, Anytime, Someday, Logbook. Drag-and-drop reordering. Narrow content width." }
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
            { name: "Slack", url: "https://slack.com", notes: "Three-panel layout: dark sidebar (workspace plus channels list), main chat area, optional thread panel. Messages: avatar, name, timestamp, message body. No chat bubbles — messages are left-aligned flat text blocks. Reactions as small emoji pills below messages. Rich formatting: code blocks, link previews, file attachments. Input bar: rich text editor with formatting toolbar." },
            { name: "Discord", url: "https://discord.com", notes: "Three-panel: dark server/channel sidebar, chat area, optional member list. Messages: avatar, username (colored by role), message. Compact mode available without avatars. Thread panel slides from right. Voice channels in sidebar with connected users. Input: simple text with emoji picker, gif search, file upload. Rounded avatars, tight message grouping." }
          ]
        },
        {
          name: "iMessage-style",
          description: "Bubble conversations, minimal chrome",
          characteristics: ["chat bubbles", "timestamps", "read receipts", "typing indicators"],
          references: [
            { name: "iMessage", url: "https://apple.com/ios/messages", notes: "Two-panel: conversation list plus chat area. Messages in colored bubbles: one color for sent (right-aligned), another for received (left-aligned). Bubbles have rounded corners with a tail on one side. Timestamps appear between message groups, not on every message. Typing indicator: three bouncing dots in a bubble. Input: rounded text field with send button. Very minimal — no toolbars in chat." },
            { name: "WhatsApp", url: "https://whatsapp.com", notes: "Two-panel on desktop: contact list plus chat area. Chat background: subtle repeating pattern (customizable). Bubbles: different tints for received vs sent. Bubbles show time inside (bottom-right), double checkmarks for read. Voice message bubbles with waveform visualization. Input: emoji button, attachment, text field, mic/send toggle. Header: contact avatar, name, online status." }
          ]
        },
        {
          name: "Support Widget",
          description: "Embedded chat, help interface",
          characteristics: ["floating widget", "conversation view", "quick replies", "agent info"],
          references: [
            { name: "Intercom", url: "https://intercom.com", notes: "Floating widget: moderate width, bottom-right corner. Rounded corners with shadow. Header: gradient background, company name, close button. Messages: bubbles with agent avatar. Quick reply buttons as horizontal scrollable pills. New conversation: large header with greeting. Article suggestions before chat starts. Typing indicator with agent name. Home screen: recent conversations, help articles, search." },
            { name: "Zendesk", url: "https://zendesk.com", notes: "Widget: moderate width, fixed bottom-right. Tabs: Messages, Help. Message view: simple bubbles, automated bot responses with button options. Help view: search bar plus article categories. Clean, corporate styling. Agent transfer: shows agent name and avatar when human joins. Satisfaction survey after resolution. Pre-chat form for name/email. Minimized state: small circular launcher button with unread badge." }
          ]
        }
      ]
    },
    documentation: {
      description: "Technical docs, API references, knowledge bases",
      styles: [
        {
          name: "Sidebar TOC",
          description: "Sidebar table of contents, main content, clean reading",
          characteristics: ["sidebar navigation", "on-page TOC", "code blocks", "version switcher"],
          references: [
            { name: "Stripe Docs", url: "https://stripe.com/docs", notes: "Three-column: left sidebar (section tree, collapsible groups), main content, right-side TOC (on-page headings). Code examples in right column or inline. Dark code blocks with language tabs (curl, Python, Ruby, etc.). Copy button on code blocks. Breadcrumbs above title. Clean sans-serif body, monospace for code. Version/API key selector in sidebar." },
            { name: "Tailwind Docs", url: "https://tailwindcss.com/docs", notes: "Two-column: left sidebar plus content area. Right-side TOC appears within the content. Large code blocks with syntax highlighting. Search: prominent, opens modal with keyboard shortcut. Moderate content width. Clean typography with good monospace for code. Section headers are linked with anchors. Responsive tables for utility classes. Dark/light mode toggle." }
          ]
        },
        {
          name: "Search-focused",
          description: "Prominent search, quick access to content",
          characteristics: ["search bar", "quick links", "categories", "recent pages"],
          references: [
            { name: "Algolia DocSearch", url: "https://docsearch.algolia.com", notes: "Search-first approach: massive search bar centered on homepage. Results appear in a modal with hierarchical highlighting (section > page > heading). Keyboard navigation with arrow keys. Instant results as you type with fuzzy matching. Clean, focused UI around the search experience. When used on other docs sites: floating search accessible via keyboard shortcut." },
            { name: "Vercel Docs", url: "https://vercel.com/docs", notes: "Homepage: large search bar plus grid of quick-link cards (Frameworks, Deployments, etc.). Each card: icon, title, brief description. Left sidebar with collapsible sections. Moderate content width. Dark/light mode. Code blocks with copy button and filename header. Callout boxes for tips/warnings with colored left border. Breadcrumbs. Previous/Next navigation at bottom." }
          ]
        },
        {
          name: "API Reference",
          description: "Endpoint listings, request/response examples, interactive",
          characteristics: ["endpoint list", "code examples", "try it out", "response schemas"],
          references: [
            { name: "Stripe API Reference", url: "https://stripe.com/docs/api", notes: "Split layout: left half is documentation text, right half is code examples on dark background. This two-column split is the defining feature. Left sidebar: API resource list (Customers, Charges, etc.). Each endpoint: HTTP method badge, path, description, parameters table. Code right-side: request plus response with language tabs. Sticky right panel scrolls with left content." },
            { name: "Twilio API", url: "https://twilio.com/docs/api", notes: "Three-column: left nav (API products), content, right-side code. Code examples in multiple languages with tabs. 'Try it out' button that opens an interactive console. Response schemas shown in expandable trees. Breadcrumb navigation. Rate limit info in callout boxes. Authentication section prominently placed. Pagination info for list endpoints." }
          ]
        }
      ]
    },
    saas_marketing: {
      description: "SaaS product marketing, pricing pages, enterprise",
      styles: [
        {
          name: "Pricing-focused",
          description: "Pricing tiers, feature comparison tables",
          characteristics: ["pricing cards", "feature tables", "toggle monthly/annual", "enterprise CTA"],
          references: [
            { name: "Notion Pricing", url: "https://notion.so/pricing", notes: "Centered layout with constrained width. Monthly/Annual toggle at top as pill switcher. 4 pricing cards in a row: Free, Plus, Business, Enterprise. Each card: plan name, large price, description, feature list with checkmarks, CTA button. 'Most popular' badge on one tier. Below cards: detailed feature comparison table with expandable sections. Clean light background, minimal shadows on cards, rounded corners." },
            { name: "Slack Pricing", url: "https://slack.com/pricing", notes: "Gradient hero section with headline. 4 pricing tiers below: Free, Pro, Business+, Enterprise Grid. Cards arranged horizontally, equal width. Each card: colored top accent line, plan name, price, key features (5-6 bullets), CTA button. Feature comparison table below with checkmarks and section groupings. 'Contact Sales' for Enterprise. Toggle between monthly/annual." }
          ]
        },
        {
          name: "Demo-first",
          description: "Interactive demo, video showcases, product-led",
          characteristics: ["video hero", "interactive demo", "use case sections", "customer quotes"],
          references: [
            { name: "Figma", url: "https://figma.com", notes: "Hero: large product screenshot/animation showing the actual tool in use, overlaid on a gradient. Headline, subtext, and 2 CTAs ('Get started', 'Watch video'). Feature sections: alternating layout — text on one side, animated product UI demo on the other. Each feature section has a different background color. Social proof: company logos in a row. Bottom CTA: large centered section." },
            { name: "Miro", url: "https://miro.com", notes: "Warm accent color. Hero: split — left side has headline and CTA, right side shows an embedded interactive board preview. Use-case sections below: horizontal tabs (Design, Engineering, Product) that switch content. Each use-case: image, description, specific feature highlights. Template gallery as a horizontal scroll carousel. Social proof: customer logos and quote carousel." }
          ]
        },
        {
          name: "Enterprise",
          description: "Trust signals, security, compliance focus",
          characteristics: ["security badges", "compliance certifications", "case studies", "contact sales"],
          references: [
            { name: "Okta", url: "https://okta.com", notes: "Corporate, trust-heavy with dark blue and white scheme. Hero: headline about security/identity, product screenshot, 2 CTAs ('Free trial', 'Contact sales'). Below: customer logo wall with many logos. Feature sections: icon, title, paragraph in multi-column grid. Case study cards: company logo, quote, link. Compliance badges section (SOC2, ISO 27001, etc.). Conservative border-radius. Professional photography." },
            { name: "Datadog", url: "https://datadoghq.com", notes: "Purple gradient hero with distinctive mascot illustrations. Hero: animated product dashboard mockup. Feature grid: multi-column with icon, title, description cards. Integration logos displayed as a large grid with many options. Customer stories: multi-column cards with company logo and metric. Interactive pricing calculator. Professional but with personality through illustrations." }
          ]
        }
      ]
    },
    portfolio: {
      description: "Personal portfolios, agency sites, creative showcases",
      styles: [
        {
          name: "Project Cards",
          description: "Grid of project thumbnails, hover effects, filterable",
          characteristics: ["project grid", "hover previews", "category filters", "thumbnail images"],
          references: [
            { name: "Dribbble", url: "https://dribbble.com", notes: "Pink accent. Project grid: responsive auto-fill with comfortable gaps. Cards: landscape image, hover overlay shows title, designer, likes. Rounded corners. Filter bar above: horizontal pill tags for categories. Infinite scroll pagination. Profile: avatar, name, bio, stats row, project grid. Clean light background. Subtle shadow on cards." },
            { name: "Behance", url: "https://behance.net", notes: "Blue accent. Project grid: masonry-style with variable height cards. Each card: project cover image (variable aspect ratio), title, owner, stats. Hover: slight scale transform and shadow increase. Gallery view on project page: full-width images stacked vertically. Rich project pages with embedded tools, moodboards, process images. Left sidebar for user profile info." }
          ]
        },
        {
          name: "Case Study",
          description: "In-depth project documentation, process-focused",
          characteristics: ["process documentation", "before/after", "results metrics", "long-form"],
          references: [
            { name: "Pentagram", url: "https://pentagram.com", notes: "Agency portfolio, ultra-clean. Full-bleed hero images for each project (100vw, tall viewport). Project listing: large image with overlay text on hover. Project detail: image-heavy vertical scroll, very little text. Serif headlines mixed with sans-serif body. Narrow text content width but images break out to full width. Black and white UI, color comes only from project images. No cards, no grid — pure editorial flow." },
            { name: "IDEO", url: "https://ideo.com", notes: "Design thinking showcase. Projects shown as large cards with image, title, description. Category filters as horizontal tabs. Project detail: hero image, challenge/approach/outcome structure, pull quotes, full-bleed images. Moderate content width. Warm, human photography. Metrics displayed as large numbers with labels. Related projects grid at bottom." }
          ]
        },
        {
          name: "Bento Grid",
          description: "Mixed-size tiles, creative layouts, visual variety",
          characteristics: ["varied card sizes", "creative arrangement", "mixed content", "visual interest"],
          references: [
            { name: "Apple Services", url: "https://apple.com/services", notes: "Bento grid with tiles of varying sizes: 1x1, 2x1, 2x2, 1x2. Each tile: product icon/image, title, brief description. Tiles have different background colors matching the product brand. Large rounded corners. Moderate max-width. Tiles link to full product pages. Very clean: just image plus text, no borders or shadows. Responsive: collapses to fewer columns on mobile." },
            { name: "Read.cv", url: "https://read.cv", notes: "Modern portfolio/resume hybrid. Bento-style: multi-column grid with tiles for: about, experience, projects, links, skills. Each tile: different pastel background color, rounded corners, minimal content. Profile: large avatar, name, bio, location. Clean sans-serif typography. No hover effects, no shadows — flat, colorful tiles. Moderate max-width. Very structured, almost like a designed resume." }
          ]
        }
      ]
    }
  }
};
