# Quick Guide: Design to Implementation

A walkthrough of the full Orchy workflow — from creating a design system to building a working app with it.

---

## Step 1: Create a Design

1. Launch Orchy and select **Design Mode** from the mode selection screen
2. **Pick a category** — choose the one that best matches your project (e.g., Landing Page, SaaS Marketing, Dashboard)
3. **Discovery chat** — the Designer Agent asks about your brand, audience, color preferences, and layout ideas. Answer naturally — the more context you give, the better the result
4. **Approve the summary** — once the agent understands your vision, it shows a summary. Approve it or keep chatting to refine
5. **Choose a theme** — the agent generates 3 theme options (color palettes + typography). Pick one, ask for tweaks, or request new options. Select your theme mode (light, dark, or both)
6. **Select a mockup** — 3 full-page HTML mockups are generated, each with a different layout approach. Preview them, pick your favorite, or enter refine mode to iterate
7. **Add more pages** — optionally add additional pages (about, pricing, dashboard, etc.) that share the same design language
8. **Save to library** — name your design and save it. It's now available to attach to any project

## Step 2: Create a Managed Workspace

1. Go back to the home screen and click **Add New Workspace**
2. Select **From Template**
3. Enter a workspace name
4. Choose an app type:
   - **Frontend** — Vite + React project
   - **Backend** — NestJS project
   - **Fullstack** — Both (recommended for most apps)
5. **Attach your design** — select the design you just saved from the dropdown. This links it to the frontend project
6. Optionally enable **GitHub integration** to create a repository
7. Click **Create** — Orchy scaffolds the projects, installs dependencies, and configures everything

Your workspace is now ready with the design files already in the frontend project's `ui_mockup/` folder.

## Step 3: Build Your First Feature

1. Open your workspace and go to the **Feature** tab
2. **Describe what you want to build** — write a feature description in the text editor. For example:

   > Build the landing page based on the attached design. Include the hero section, features grid, pricing table, and footer. Connect the contact form to a backend endpoint.

3. **Select projects** — check which projects to include (e.g., both frontend and backend for fullstack features)
4. Click **Start Planning**

## Step 4: Review the Plan

1. The **Planning Agent** opens a chat and may ask clarifying questions — answer them to refine the scope
2. The agent explores your codebase, analyzes the design files, and generates:
   - An overview of the approach
   - An architecture diagram
   - A task list per project
   - E2E test scenarios
3. **Review the plan** — read through the tasks and tests
4. **Approve** to start execution, or **Refine** with feedback if something needs changing

## Step 5: Watch It Build

1. The **session view** opens with two panels:
   - **Left** — Planning Agent chat (reports progress, coordinates work)
   - **Right** — Tasks, tests, and project tracking with real-time logs
2. Agents implement tasks one by one, following your design tokens and mockup layouts
3. After each task, Orchy automatically verifies the work (builds the project, restarts dev servers, checks for errors)
4. If something breaks, the agent fixes it automatically
5. When all tasks pass, E2E tests run to verify everything works end-to-end

## Step 6: Done

A completion panel appears with a summary. From here you can:

- **Start another feature** — go back to the workspace and describe the next thing to build
- **Deploy** — switch to Deployment mode to provision infrastructure and set up CI/CD
- **View history** — review past sessions and their results
