### planning (5:21:03 PM)
Session created: 754a984e

---

### system (5:21:03 PM)
Session created: 754a984e

---

### user (5:21:03 PM)
Create a plan for: can you add an endpoint that returns total number users in the organization and siaplys it next to organization name on the dashboard page?

---

### user (5:21:03 PM)
Create a plan for: can you add an endpoint that returns total number users in the organization and siaplys it next to organization name on the dashboard page?

---

### planning (5:21:03 PM)
Analyzing feature request for projects: speak-api, speak-partner...

---

### planning (5:21:03 PM)
Exploring project directories to understand codebase structure...

---

### planning (5:22:58 PM)
I've created a plan for "Organization User Count Endpoint and Dashboard Display". Please review and approve.

---

### planning (5:22:58 PM)
Now I have enough information to create a detailed implementation plan. Let me summarize what I've found:

**speak-api:**
- Partners portal API routes are in `src/routes/v1/partners/organizations.ts`
- Portal service is in `src/modules/partners/portal/partners.service.ts`
- Portal schemas are in `src/modules/partners/portal/partners.schema.ts`
- The `getOrganization` endpoint already exists but doesn't include user count
- Organization users are tracked in `OrganizationUser` table (service in `src/modules/partners/organizationUser/organizationUser.service.ts`)

**speak-partner:**
- Dashboard page is in `src/app/(DashboardLayout)/page.tsx`
- Organization name is displayed using `selectedOrganization.name` from `useAuthenticatedUser()`
- API calls use TanStack Query hooks from `src/server-state/api/`
- Organization API types are in `src/server-state/api/organization.interfaces.ts`
- Organization queries are in `src/server-state/api/organization.tsx`

Based on my research, here's the implementation plan:

```json
{
  "feature": "Organization User Count Endpoint and Dashboard Display",
  "description": "Add an API endpoint to return the total number of users in an organization and display this count next to the organization name on the dashboard page.",
  "tasks": [
    {
      "project": "speak-api",
      "task": "Add a new endpoint GET /v1/partners/organizations/:organizationId/user-count that returns the total number of active users in the organization. Implementation details:\n\n1. In `src/modules/partners/portal/partners.schema.ts`:\n   - Add a new response schema `getOrganizationUserCountResponseSchema` with a `totalUsers` number field\n   - Export the type `GetOrganizationUserCountResponse`\n\n2. In `src/modules/partners/portal/partners.service.ts`:\n   - Add a new function `getOrganizationUserCount(organizationId: string)` that:\n     - Queries prisma.organizationUser.count() with the condition: organizationId matches, deletedAt is null, and the related user has a non-null email and null deletedAt (following the same pattern as getOrganizationUsers in organizationUser.service.ts lines 849-869)\n     - Returns { totalUsers: count }\n\n3. In `src/modules/partners/portal/partners.controller.ts`:\n   - Add a new controller `getOrganizationUserCountController` that calls the service and returns the response\n\n4. In `src/routes/v1/partners/organizations.ts`:\n   - Add a new GET route `/:organizationId/user-count` with validation using the new schema and controller\n   - Place it after the existing `/:organizationId` GET route (around line 208)\n   - The route will be automatically protected by the existing `partnerAuth` middleware on line 201",
      "dependencies": []
    },
    {
      "project": "speak-partner",
      "task": "Display the total user count next to the organization name on the dashboard. Implementation details:\n\n1. In `src/server-state/api/organization.interfaces.ts`:\n   - Add a new interface `GetOrganizationUserCountResponse` with `totalUsers: number` field\n\n2. In `src/server-state/api/organization.tsx`:\n   - Add a new function `getOrganizationUserCount(organizationId: string)` that calls the API endpoint `${ORGANIZATIONS_API_URL}/${organizationId}/user-count`\n   - Add a new hook `useGetOrganizationUserCount(organizationId: string)` following the existing pattern (see lines 48-53 for reference)\n\n3. In `src/app/(DashboardLayout)/page.tsx`:\n   - Import `useGetOrganizationUserCount` from the server-state API\n   - Call `useGetOrganizationUserCount(selectedOrganization.id)` to fetch the user count\n   - Modify the Typography component displaying `selectedOrganization.name` (line 47-48) to also show the user count:\n     - Display as \"Organization Name • X users\" or similar format\n     - Handle loading state gracefully (show just the name while loading)\n     - Use the same typography styling for consistency",
      "dependencies": ["speak-api"]
    }
  ],
  "testPlan": {
    "speak-partner": [
      "Navigate to the dashboard page and verify the organization name displays with a user count next to it (e.g., 'Acme Corp • 25 users')",
      "Verify the user count updates correctly when switching between organizations (if the user has access to multiple organizations)",
      "Verify the dashboard loads correctly without errors when the user count API is temporarily unavailable (graceful degradation)"
    ]
  }
}
```

---

### planning (5:23:20 PM)
Plan approved! Ready to start execution.

---

### planning (5:23:20 PM)
Starting execution...

---

