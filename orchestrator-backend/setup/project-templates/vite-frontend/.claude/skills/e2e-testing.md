---
name: e2e-testing
description: Test the frontend using Playwright MCP tools. Use when user asks to test the UI, run E2E tests, or verify frontend functionality.
---

# E2E Testing

Test the UI using Playwright MCP tools directly.

## CRITICAL RULES

**DO NOT generate Playwright test scripts or use `npx playwright test`.**
**DO NOT write .spec.ts files or any test files.**
**Instead, call the MCP tools directly to navigate and interact with the browser.**
**When setting environment variables for commands, ALWAYS use the `env` command** - e.g. `env NODE_ENV=test npm run build` instead of `NODE_ENV=test npm run build`.

**IF PLAYWRIGHT MCP TOOLS ARE NOT AVAILABLE:**
- DO NOT attempt to analyze code as a workaround
- DO NOT try alternative approaches
- Immediately output: `[TEST_STATUS] {"scenario": "ALL", "status": "failed", "error": "Playwright MCP tools not available"}`
- Return the final report with `allPassed: false` and explain the missing tools
- This is a BLOCKED state - the test infrastructure is missing

## Prerequisites

- Dev server must be running (on port 5173)
- Use Playwright MCP tools directly (NOT test scripts)

## Available Playwright MCP Tools

- `mcp__playwright__browser_navigate` - Navigate to URL
- `mcp__playwright__browser_snapshot` - Get accessibility snapshot of page (use this to find element refs)
- `mcp__playwright__browser_click` - Click on element (requires element description and ref from snapshot)
- `mcp__playwright__browser_type` - Type text into input
- `mcp__playwright__browser_fill_form` - Fill multiple form fields
- `mcp__playwright__browser_take_screenshot` - Take screenshot
- `mcp__playwright__browser_wait_for` - Wait for text to appear/disappear

## Test Status Markers

For EACH test scenario, output status markers for real-time tracking:

- Before running: `[TEST_STATUS] {"scenario": "scenario name", "status": "running"}`
- After passing: `[TEST_STATUS] {"scenario": "scenario name", "status": "passed"}`
- After failing: `[TEST_STATUS] {"scenario": "scenario name", "status": "failed", "error": "what went wrong"}`

## E2E Testing Workflow

For EACH test scenario:

### 1. Output Test Status (Running)
```
[TEST_STATUS] {"scenario": "User can click the counter button", "status": "running"}
```

### 2. Navigate to the App
Call `mcp__playwright__browser_navigate` with url: "http://localhost:5173"

### 3. Take a Snapshot to See Elements
Call `mcp__playwright__browser_snapshot` to get the page structure and element refs

### 4. Interact with Elements
Use the `ref` values from the snapshot to interact:
- Call `mcp__playwright__browser_click` with element description and ref
- Call `mcp__playwright__browser_type` to enter text
- Call `mcp__playwright__browser_fill_form` for forms

### 5. Verify Results
Take another snapshot to verify the expected state appears

### 6. Output Test Status (Pass/Fail)
```
[TEST_STATUS] {"scenario": "User can click the counter button", "status": "passed"}
```
OR
```
[TEST_STATUS] {"scenario": "User can click the counter button", "status": "failed", "error": "Counter did not increment"}
```

## Example Test Flow

1. Output: `[TEST_STATUS] {"scenario": "Counter increments on click", "status": "running"}`
2. Call `mcp__playwright__browser_navigate` with url "http://localhost:5173"
3. Call `mcp__playwright__browser_snapshot` to see page structure
4. Find the counter button ref in snapshot, call `mcp__playwright__browser_click`
5. Call `mcp__playwright__browser_snapshot` again to verify count changed
6. Output: `[TEST_STATUS] {"scenario": "Counter increments on click", "status": "passed"}`

## Final Report

At the end, provide a JSON summary:

```json
{
  "allPassed": true/false,
  "failures": [
    {
      "test": "test name",
      "error": "what went wrong",
      "codeAnalysis": "What I found in the code",
      "suspectedProject": "frontend" | "backend" | "both"
    }
  ],
  "overallAnalysis": "Summary of results"
}
```
