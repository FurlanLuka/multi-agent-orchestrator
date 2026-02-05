import { DeploymentProvider } from '../types';

export const hetznerProvider: DeploymentProvider = {
  id: 'hetzner',
  name: 'Hetzner Cloud',
  category: 'vps',
  description: 'Cost-effective European VPS provider. Good for full-stack apps with databases.',

  requiredSecrets: [
    {
      name: 'HCLOUD_TOKEN',
      label: 'Hetzner API Token',
      description: 'Go to console.hetzner.cloud → Security → API Tokens → Generate (Read & Write)',
      isGitHubSecret: true
    }
  ],

  requiredConfig: [],

  instanceTypes: {
    note: 'ALWAYS verify with WebSearch "hetzner cloud server types" - types change frequently! Old Gen2 types (cx22, cx32) are DEPRECATED.',
    examples: ['cx23', 'cax11', 'cpx11', 'ccx13']  // Gen3/current types as of 2025
  },

  cli: [
    {
      name: 'hcloud',
      installCommand: 'brew install hcloud',
      verifyCommand: 'hcloud version',
      installUrl: 'https://community.hetzner.com/tutorials/howto-hcloud-cli',
      description: 'Hetzner Cloud CLI for managing servers, DNS, and infrastructure'
    },
    {
      name: 'docker',
      installCommand: 'brew install --cask docker',
      verifyCommand: 'docker --version',
      installUrl: 'https://docs.docker.com/get-started/get-docker/',
      description: 'Docker for building and pushing container images to GHCR'
    }
  ],

  provisionCommands: `
## Phase 1: Infrastructure Provisioning (Local CLI)

The agent executes ALL of these steps locally. The goal is a production-ready server
with Docker, docker-compose.yml, and .env — but NO app deployed yet.
App deployment happens exclusively through CI/CD (Phase 2).

**The server never has source code.** Only: docker-compose.yml, .env, and optionally nginx config.

### 1. Generate SSH deploy key
\`\`\`bash
ssh-keygen -t ed25519 -f /tmp/deploy_key -N "" -C "deploy@github-actions"
\`\`\`

### 2. Upload SSH key to Hetzner
\`\`\`bash
hcloud ssh-key create --name "<project-name>-deploy" --public-key-from-file /tmp/deploy_key.pub
\`\`\`

### 3. Create cloud-init config
Write to /tmp/cloud-init.yaml:
\`\`\`yaml
#cloud-config
apt:
  sources:
    docker.list:
      source: "deb [arch=amd64] https://download.docker.com/linux/ubuntu $RELEASE stable"
      keyid: 9DC858229FC7DD38854AE2D88D81803C0EBFCD88
packages:
  - docker-ce
  - docker-ce-cli
  - containerd.io
  - docker-compose-plugin
runcmd:
  - systemctl enable docker
  - systemctl start docker
\`\`\`

### 4. Create server
\`\`\`bash
hcloud server create \\
  --name "<project-name>-server" \\
  --type cx23 \\
  --image ubuntu-24.04 \\
  --ssh-key "<project-name>-deploy" \\
  --user-data-from-file /tmp/cloud-init.yaml \\
  --location fsn1
\`\`\`
**IMPORTANT:** Verify instance type with WebSearch before using. cx23 is a placeholder.

### 5. Get server IP
\`\`\`bash
SERVER_IP=$(hcloud server describe "<project-name>-server" -o format='{{.PublicNet.IPv4.IP}}')
\`\`\`

### 6. Wait for cloud-init and validate Docker
\`\`\`bash
sleep 60
ssh -o StrictHostKeyChecking=no -i /tmp/deploy_key root@$SERVER_IP "cloud-init status --wait && docker --version"
\`\`\`

### 7. Create deploy directory on server
\`\`\`bash
ssh -i /tmp/deploy_key root@$SERVER_IP "mkdir -p /opt/<project-name>"
\`\`\`

### 8. Create and copy docker-compose.yml to server
Create a docker-compose.yml that uses \`image: ghcr.io/<owner>/<service>:latest\` references
(NOT \`build:\` directives). The agent determines services from the project's Dockerfiles.

Example structure:
\`\`\`yaml
services:
  backend:
    image: ghcr.io/<owner>/<project>-backend:latest
    ports:
      - "3000:3000"
    env_file: .env
    restart: unless-stopped
  frontend:
    image: ghcr.io/<owner>/<project>-frontend:latest
    ports:
      - "80:80"
    restart: unless-stopped
\`\`\`

Copy to server:
\`\`\`bash
scp -i /tmp/deploy_key docker-compose.yml root@$SERVER_IP:/opt/<project-name>/docker-compose.yml
\`\`\`

### 9. Create .env on server
Create the production .env file on the server with all environment variables the
docker-compose needs (database URLs, secrets, API keys, etc.). Generate secrets
like JWT_SECRET on the server with \`openssl rand -base64 32\`. This .env is
created once during provisioning and NOT overwritten on subsequent deploys.

### 10. Validate infrastructure
\`\`\`bash
ssh -i /tmp/deploy_key root@$SERVER_IP "docker info && docker pull hello-world && docker run --rm hello-world"
\`\`\`
Confirm Docker works and the server can pull images. Do NOT deploy the app yet —
that happens through CI/CD.

### 11. Set GitHub secrets for CI/CD
\`\`\`bash
gh secret set DEPLOY_SSH_KEY --repo <owner/repo> < /tmp/deploy_key
gh secret set SERVER_IP --repo <owner/repo> --body "$SERVER_IP"
\`\`\`
These are auto-generated — do NOT ask the user for these values.

### 12. Save deployment state
Call \`mcp__orchestrator-planning__save_deployment_state\` to persist infrastructure details:
\`\`\`json
{
  "provider": "hetzner",
  "serverName": "<project-name>-server",
  "serverIp": "<SERVER_IP>",
  "sshKeyName": "<project-name>-deploy",
  "instanceType": "<instance-type-used>",
  "location": "fsn1",
  "deployPath": "/opt/<project-name>"
}
\`\`\`
This enables day-2 management and tells future sessions where the app lives.

## Phase 2: CI/CD Workflow (GitHub Actions)

Create \`.github/workflows/deploy.yml\` ONLY after infrastructure is validated.
The CI/CD workflow builds Docker images, pushes them to GHCR, then SSHs to the
server to pull and restart. This is the ONLY way apps get deployed.

**The workflow must:**
1. Login to GHCR using \`docker/login-action\` with automatic \`GITHUB_TOKEN\`
2. Build and push each service image using \`docker/build-push-action\`
3. SSH to server: login to GHCR (using \`GITHUB_TOKEN\`), then \`docker compose pull && docker compose up -d\`

**Why GHCR login on the server?** GHCR packages inherit private visibility from the repo.
The CI workflow logs into GHCR on the server each deploy using the ephemeral \`GITHUB_TOKEN\`.
No persistent PAT is needed — the token is valid for the duration of the workflow run.

**The workflow must NOT:**
- Copy source code to the server — server only has docker-compose.yml + .env
- Run npm install or npm build outside of Docker — all building happens in Docker images
- Recreate or overwrite the .env file — it was set up during provisioning
- Regenerate secrets — that would invalidate existing sessions/tokens
`,

  workflowTemplate: `
name: Deploy to Hetzner

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push <service> image
        uses: docker/build-push-action@v6
        with:
          context: ./<service>
          push: true
          tags: ghcr.io/<owner>/<service>:latest,ghcr.io/<owner>/<service>:\${{ github.sha }}

      # Repeat the build-push step for each service that has a Dockerfile.
      # The agent determines which services exist and creates one step per service.

      - name: Deploy to server
        env:
          SSH_KEY: \${{ secrets.DEPLOY_SSH_KEY }}
          SERVER_IP: \${{ secrets.SERVER_IP }}
          GHCR_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H $SERVER_IP >> ~/.ssh/known_hosts 2>/dev/null

          # Login to GHCR on server so it can pull private images
          ssh -i ~/.ssh/deploy_key root@$SERVER_IP "echo $GHCR_TOKEN | docker login ghcr.io -u \${{ github.actor }} --password-stdin"

          ssh -i ~/.ssh/deploy_key root@$SERVER_IP "cd <DEPLOY_PATH> && docker compose pull && docker compose up -d"
`
};
