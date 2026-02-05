# Planning & Sessions

Once you start a feature, Orchy enters a **multi-stage planning workflow** powered by a Planning Agent (Claude).

---

## Stage 1: Feature Refinement

The Planning Agent asks clarifying questions about your feature through an interactive chat. Answer questions to refine the scope and requirements. Once the agent understands what you need, it presents a **refined feature summary** for your approval.

- **Approve** — Move to the next stage
- **Reject / Refine** — Provide feedback and iterate

## Stage 2: Exploration & Technical Planning

The Planning Agent explores your codebase, analyzes the architecture, and creates a technical specification including:

- API contracts
- Architecture decisions
- Execution order across projects

This stage is presented for your approval before proceeding.

## Stage 3: Task Generation

The agent generates a detailed implementation plan:

- **Overview** — High-level description of the approach
- **Architecture** — Visual diagram of components and data flow
- **Tasks** — Ordered list of implementation tasks per project
- **Test Plan** — E2E test scenarios per project

## Plan Approval

The complete plan is shown for your review:

- **Accept** — Begin [execution](session-execution.md)
- **Refine** — Provide feedback and the agent revises the plan

You remain in control throughout. No code is written until you approve the plan.

---

← [Building Features](building-features.md) | [Session Execution →](session-execution.md)
