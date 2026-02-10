# Planning & Sessions

Once you start a feature, Orchy enters a **multi-stage planning workflow** powered by a Planning Agent (Claude).

---

## Stage 1: Feature Refinement

The Planning Agent asks clarifying questions about your feature through an interactive chat. Answer questions to refine the scope and requirements. Once the agent understands what you need, it presents a **refined feature summary** for your approval.

- **Approve** — Move to the next stage
- **Reject / Refine** — Provide feedback and iterate

The agent also has access to your **workspace context** — any architectural decisions, coding standards, or guidelines you've documented in the workspace settings are included automatically.

## Stage 2: Codebase Exploration

The Planning Agent explores your codebase to understand the existing architecture, patterns, and conventions. It analyzes project structure, dependencies, and relevant code to inform its plan.

## Stage 3: Task Generation

The agent generates a detailed implementation plan:

- **Overview** — High-level description of the approach
- **Architecture** — Visual diagram of components and data flow
- **Tasks** — Ordered list of implementation tasks per project
- **Test Plan** — E2E test scenarios per project
- **E2E Dependencies** — Execution order for cross-project test dependencies

## Plan Approval

The complete plan is shown for your review:

- **Accept** — Begin [execution](session-execution.md)
- **Refine** — Provide feedback and the agent revises the plan

You remain in control throughout. No code is written until you approve the plan.

## During Execution

The Planning Agent remains active during execution. It:

- Analyzes task results as agents complete their work
- Sends fix prompts when verification fails (build errors, test failures)
- Coordinates E2E test execution across projects based on dependency order
- Responds to your messages if you need to guide the process
