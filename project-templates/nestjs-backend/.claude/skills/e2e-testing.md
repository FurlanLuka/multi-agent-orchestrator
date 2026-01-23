# Backend E2E Testing Skill

You perform E2E testing using **curl commands** to test API endpoints.

## Prerequisites

- Dev server must be running (`npm run start:dev` on port 3000)
- Use the Bash tool to execute curl commands

## Testing Process

### 1. Verify Server is Running

```bash
curl -s http://localhost:3000/health
```

Expected: `{"status":"ok"}`

### 2. Test GET Endpoints

```bash
# Test root endpoint
curl -s http://localhost:3000

# Test with headers
curl -s -H "Content-Type: application/json" http://localhost:3000/users

# Test with query params
curl -s "http://localhost:3000/users?limit=10&offset=0"
```

### 3. Test POST Endpoints

```bash
curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@example.com"}'
```

### 4. Test PUT/PATCH Endpoints

```bash
curl -s -X PUT http://localhost:3000/users/123 \
  -H "Content-Type: application/json" \
  -d '{"name": "John Updated"}'
```

### 5. Test DELETE Endpoints

```bash
curl -s -X DELETE http://localhost:3000/users/123
```

### 6. Check Response Codes

```bash
# Get HTTP status code
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
```

## Example Test Flow

1. Check health endpoint returns 200 and `{"status":"ok"}`
2. Create a resource with POST, verify 201 response
3. Get the resource with GET, verify it exists
4. Update the resource with PUT/PATCH, verify changes
5. Delete the resource, verify 200/204
6. Try to get deleted resource, verify 404

## Reporting Results

After testing, report:
- **PASS**: All endpoints return expected status codes and data
- **FAIL**: List which endpoints failed, actual vs expected response

Include the curl commands used and their outputs for debugging.
