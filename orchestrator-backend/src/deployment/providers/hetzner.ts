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
    expose:
      - "3000"
    env_file: .env
    restart: unless-stopped
  frontend:
    image: ghcr.io/<owner>/<project>-frontend:latest
    expose:
      - "80"
    restart: unless-stopped
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped
\`\`\`

**IMPORTANT:** Use \`expose\` (not \`ports\`) for app services — they are only accessible internally
via Docker networking. Only nginx binds to the host.

Copy to server:
\`\`\`bash
scp -i /tmp/deploy_key docker-compose.yml root@$SERVER_IP:/opt/<project-name>/docker-compose.yml
\`\`\`

### 9. Create and copy nginx.conf to server
Create an nginx reverse proxy config that routes traffic to the correct services.
The agent must determine actual ports by inspecting each project's Dockerfile (EXPOSE directive)
or application config.

Example nginx.conf:
\`\`\`nginx
server {
    listen 80;

    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend:80/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
\`\`\`

**IMPORTANT:** Adjust ports and paths based on the actual project configuration:
- Inspect Dockerfiles for EXPOSE directives to determine service ports
- Check if the backend uses a URL prefix (e.g. \`/api/\`) or runs at root
- The \`proxy_pass\` URL uses Docker Compose service names (e.g. \`backend\`, \`frontend\`)

Copy to server:
\`\`\`bash
scp -i /tmp/deploy_key nginx.conf root@$SERVER_IP:/opt/<project-name>/nginx.conf
\`\`\`

### 10. Set app secrets as GitHub secrets
All application secrets (database URLs, JWT secrets, API keys, etc.) must be stored
as GitHub secrets so the CI/CD workflow can write the .env file on every deploy.
This ensures secrets can be rotated by updating GitHub secrets — no manual SSH needed.

For each app-specific secret, use \`request_user_input\` with type: "github_secret".
Generate secrets like JWT_SECRET locally with \`openssl rand -base64 32\` and set them:
\`\`\`bash
gh secret set JWT_SECRET --repo <owner/repo> --body "$(openssl rand -base64 32)"
\`\`\`

The CI/CD workflow will write these to the server's .env on every deploy.

### 11. Validate infrastructure
\`\`\`bash
ssh -i /tmp/deploy_key root@$SERVER_IP "docker info && docker pull hello-world && docker run --rm hello-world"
\`\`\`
Confirm Docker works and the server can pull images. Do NOT deploy the app yet —
that happens through CI/CD.

### 12. Set GitHub secrets for CI/CD
\`\`\`bash
gh secret set DEPLOY_SSH_KEY --repo <owner/repo> < /tmp/deploy_key
gh secret set SERVER_IP --repo <owner/repo> --body "$SERVER_IP"
\`\`\`
These are auto-generated — do NOT ask the user for these values.

### 13. Save deployment state
Read the SSH private key and call \`mcp__orchestrator-planning__save_deployment_state\` to persist
infrastructure details including the key. This allows future day-2 management sessions to SSH
into the server without regenerating keys.

\`\`\`bash
# Read the private key content
SSH_PRIVATE_KEY=$(cat /tmp/deploy_key)
\`\`\`

Call the tool with:
\`\`\`json
{
  "provider": "hetzner",
  "serverName": "<project-name>-server",
  "serverIp": "<SERVER_IP>",
  "sshKeyName": "<project-name>-deploy",
  "sshPrivateKey": "<contents of /tmp/deploy_key>",
  "instanceType": "<instance-type-used>",
  "location": "fsn1",
  "deployPath": "/opt/<project-name>"
}
\`\`\`
This enables day-2 management and tells future sessions where the app lives.
The SSH private key is stored locally in ~/.orchy-config/workspaces.json — never pushed to remote.

## Phase 2: CI/CD Workflow (GitHub Actions)

Create \`.github/workflows/deploy.yml\` ONLY after infrastructure is validated.
The CI/CD workflow builds Docker images, pushes them to GHCR, then SSHs to the
server to pull and restart. This is the ONLY way apps get deployed.

**The workflow must:**
1. Login to GHCR using \`docker/login-action\` with automatic \`GITHUB_TOKEN\`
2. Build and push each service image using \`docker/build-push-action\`
3. SSH to server: login to GHCR, write .env from GitHub secrets, then \`docker compose down --remove-orphans && docker compose pull && docker compose up -d\`

**Why write .env from GitHub secrets on every deploy?**
- Secrets can be rotated by updating GitHub secrets — no SSH needed
- The .env is always in sync with what's configured in GitHub
- No manual .env management on the server

**Why GHCR login on the server?** GHCR packages inherit private visibility from the repo.
The CI workflow logs into GHCR on the server each deploy using the ephemeral \`GITHUB_TOKEN\`.
No persistent PAT is needed — the token is valid for the duration of the workflow run.

**The workflow must NOT:**
- Copy source code to the server — server only has docker-compose.yml + .env
- Run npm install or npm build outside of Docker — all building happens in Docker images
- Hardcode secrets in the workflow file — always use GitHub secrets
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
          # Add app-specific secrets here, e.g.:
          # ADMIN_USERNAME: \${{ secrets.ADMIN_USERNAME }}
          # JWT_SECRET: \${{ secrets.JWT_SECRET }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H $SERVER_IP >> ~/.ssh/known_hosts 2>/dev/null

          # Login to GHCR on server so it can pull private images
          ssh -i ~/.ssh/deploy_key root@$SERVER_IP "echo $GHCR_TOKEN | docker login ghcr.io -u \${{ github.actor }} --password-stdin"

          # Write .env from GitHub secrets (always in sync, rotate by updating secrets)
          cat > /tmp/.env.deploy << EOF
          <ENV_VARS>
          EOF
          scp -i ~/.ssh/deploy_key /tmp/.env.deploy root@$SERVER_IP:<DEPLOY_PATH>/.env

          ssh -i ~/.ssh/deploy_key root@$SERVER_IP "cd <DEPLOY_PATH> && docker compose down --remove-orphans && docker compose pull && docker compose up -d"
`
};
