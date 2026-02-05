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

  cli: {
    name: 'hcloud',
    installCommand: 'brew install hcloud',
    verifyCommand: 'hcloud version',
    installUrl: 'https://community.hetzner.com/tutorials/howto-hcloud-cli',
    description: 'Hetzner Cloud CLI for managing servers, DNS, and infrastructure'
  },

  provisionCommands: `
## hcloud CLI Provisioning Commands

Execute these steps in order. The agent runs all commands locally.

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
hcloud server describe "<project-name>-server" -o format='{{.PublicNet.IPv4.IP}}'
\`\`\`

### 6. Wait for cloud-init and validate
\`\`\`bash
# Wait ~60s for cloud-init to complete
sleep 60
ssh -o StrictHostKeyChecking=no -i /tmp/deploy_key root@<SERVER_IP> "cloud-init status --wait && docker --version"
\`\`\`

### 7. Set GitHub secrets (auto-generated, not from user)
\`\`\`bash
# These are auto-generated - do NOT ask the user for these
gh secret set DEPLOY_SSH_KEY --repo <owner/repo> < /tmp/deploy_key
gh secret set SERVER_IP --repo <owner/repo> --body "<SERVER_IP>"
\`\`\`

### 8. Save deployment state
Call \`mcp__orchestrator-planning__save_deployment_state\` to persist infrastructure details for future sessions:
\`\`\`json
{
  "provider": "hetzner",
  "serverName": "<project-name>-server",
  "serverIp": "<SERVER_IP>",
  "sshKeyName": "<project-name>-deploy",
  "instanceType": "<instance-type-used>",
  "location": "fsn1"
}
\`\`\`
This enables day-2 management (upgrades, DNS, firewalls, volumes) in future sessions.
`,

  workflowTemplate: `
name: Deploy to Hetzner

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        env:
          SSH_KEY: \${{ secrets.DEPLOY_SSH_KEY }}
          SERVER_IP: \${{ secrets.SERVER_IP }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H $SERVER_IP >> ~/.ssh/known_hosts 2>/dev/null

          rsync -e "ssh -i ~/.ssh/deploy_key" -avz --delete --exclude='.git' . root@$SERVER_IP:/app/

          ssh -i ~/.ssh/deploy_key root@$SERVER_IP "cd /app && docker compose up -d --build"
`
};
