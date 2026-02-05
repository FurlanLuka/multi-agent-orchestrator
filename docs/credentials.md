# Credentials

During deployment and certain workflows, Orchy may need credentials or secrets from you.

---

## How It Works

When a credential is needed, a **User Input overlay** appears on screen. Orchy will clearly tell you:

- **What** credential is needed
- **Why** it's needed
- **Where** to get it (with links to provider dashboards)

## Types of Credential Requests

| Type | Description |
|------|-------------|
| **GitHub Secret** | A secret value that gets stored as a GitHub repository secret. Orchy uses the `gh` CLI to set it. The value is sent to GitHub and used in CI/CD workflows. |
| **API Token** | Provider-specific tokens (e.g., Hetzner API token). These are used locally by the agent during provisioning and may also be stored as GitHub secrets for CI/CD. |
| **Confirmation** | Not a credential, but a yes/no prompt confirming you want to proceed with an action (e.g., provisioning infrastructure that incurs costs). |

## CLI Verification

Before [deployment](deployment.md), Orchy verifies that required CLI tools are installed. If a tool is missing, you'll see:

- The tool name and description
- Installation command (e.g., `brew install hcloud`)
- A link to installation documentation
- A **Verify** button to check if it's installed after you install it

## Security Notes

- Orchy **never stores credentials locally** beyond the current session
- GitHub secrets are stored via the `gh` CLI in your GitHub repository settings
- API tokens are used for the duration of the provisioning session only
- SSH keys generated during deployment are ephemeral and stored as GitHub secrets for CI/CD use

---

← [Permissions](permissions.md) | [Dev Servers →](dev-servers.md)
