# Backend E2E Testing Skill

You perform E2E testing using **curl commands** to test API endpoints.

## CRITICAL RULES

**DO NOT generate test scripts or use any test framework.**
**Use curl commands directly via the Bash tool to test endpoints.**
**When setting environment variables for commands, ALWAYS use the `env` command** - e.g. `env NODE_ENV=test npx prisma migrate` instead of `NODE_ENV=test npx prisma migrate`.

## Prerequisites

- Dev server must be running (on port 3000)
- Use the Bash tool to execute curl commands

## Test Status Markers

For EACH test scenario, output status markers for real-time tracking:

- Before running: `[TEST_STATUS] {"scenario": "scenario name", "status": "running"}`
- After passing: `[TEST_STATUS] {"scenario": "scenario name", "status": "passed"}`
- After failing: `[TEST_STATUS] {"scenario": "scenario name", "status": "failed", "error": "what went wrong"}`

## E2E Testing Workflow

For EACH test scenario:

### 1. Output Test Status (Running)
```
[TEST_STATUS] {"scenario": "Health endpoint returns OK", "status": "running"}
```

### 2. Execute curl Command
```bash
curl -s http://localhost:3000/health
```

### 3. Verify Response
Check the response body and status code match expectations

### 4. Output Test Status (Pass/Fail)
```
[TEST_STATUS] {"scenario": "Health endpoint returns OK", "status": "passed"}
```
OR
```
[TEST_STATUS] {"scenario": "Health endpoint returns OK", "status": "failed", "error": "Expected 200, got 500"}
```

## Common curl Commands

### GET Requests
```bash
# Simple GET
curl -s http://localhost:3000/users

# GET with headers
curl -s -H "Content-Type: application/json" http://localhost:3000/users

# GET with query params
curl -s "http://localhost:3000/users?limit=10&offset=0"

# GET status code only
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
```

### POST Requests
```bash
curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@example.com"}'
```

### PUT/PATCH Requests
```bash
curl -s -X PUT http://localhost:3000/users/123 \
  -H "Content-Type: application/json" \
  -d '{"name": "John Updated"}'
```

### DELETE Requests
```bash
curl -s -X DELETE http://localhost:3000/users/123
```

## Example Test Flow

1. Output: `[TEST_STATUS] {"scenario": "Health check", "status": "running"}`
2. Run: `curl -s http://localhost:3000/health`
3. Verify: Response is `{"status":"ok"}`
4. Output: `[TEST_STATUS] {"scenario": "Health check", "status": "passed"}`

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
