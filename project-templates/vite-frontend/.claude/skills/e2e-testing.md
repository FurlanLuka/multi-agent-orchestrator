# Frontend E2E Testing Skill

You perform E2E testing using the **Playwright MCP** tools to interact with the browser.

## Prerequisites

- Dev server must be running (`npm run dev` on port 5173)
- Use Playwright MCP tools (browser_navigate, browser_click, browser_type, browser_snapshot, etc.)

## Available Playwright MCP Tools

- `mcp__playwright__browser_navigate` - Navigate to URL
- `mcp__playwright__browser_snapshot` - Get accessibility snapshot of page
- `mcp__playwright__browser_click` - Click on element
- `mcp__playwright__browser_type` - Type text into input
- `mcp__playwright__browser_fill_form` - Fill multiple form fields
- `mcp__playwright__browser_take_screenshot` - Take screenshot
- `mcp__playwright__browser_wait_for` - Wait for text/condition

## E2E Testing Process

### 1. Navigate to the App

```
Use mcp__playwright__browser_navigate with url: "http://localhost:5173"
```

### 2. Take a Snapshot to See Elements

```
Use mcp__playwright__browser_snapshot to get element refs
```

### 3. Interact with Elements

Use the `ref` values from the snapshot to interact:

```
Use mcp__playwright__browser_click with:
- element: "Submit button"
- ref: "button[ref_from_snapshot]"
```

### 4. Verify Results

Take another snapshot or screenshot to verify the expected state.

## Example Test Flow

1. Navigate to `http://localhost:5173`
2. Take snapshot to see initial state
3. Find the counter button and click it
4. Take snapshot to verify count incremented
5. Report pass/fail based on expected state

## Reporting Results

After testing, report:
- **PASS**: All test scenarios verified successfully
- **FAIL**: List which scenarios failed and why

Include screenshots for visual verification when needed.
