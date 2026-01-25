/**
 * Master permission configuration for Claude Code agents
 *
 * This defines all available permissions that can be enabled per-project,
 * as well as dangerous operations that are ALWAYS denied.
 */

export interface PermissionOption {
  id: string;
  label: string;
  description: string;
  category: 'file' | 'bash' | 'mcp';
}

export interface PermissionCategory {
  id: string;
  label: string;
  description: string;
  permissions: PermissionOption[];
}

/**
 * Permission groups for quick toggling
 * Each group enables multiple related permissions at once
 */
export interface PermissionGroup {
  id: string;
  label: string;
  description: string;
  permissions: string[];  // List of permission IDs included in this group
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'file_all',
    label: 'All File Operations',
    description: 'Read, write, edit, search files',
    permissions: ['Read', 'Write', 'Edit', 'Glob', 'Grep']
  },
  {
    id: 'npm_all',
    label: 'All NPM Commands',
    description: 'npm run, install, ci, npx',
    permissions: ['Bash(npm run *)', 'Bash(npm install *)', 'Bash(npm ci *)', 'Bash(npx *)', 'Bash(node *)']
  },
  {
    id: 'bash_readonly',
    label: 'Read-only Bash',
    description: 'ls, cat, find, wc (no modifications)',
    permissions: ['Bash(ls *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(find *)', 'Bash(wc *)']
  },
  {
    id: 'bash_files',
    label: 'File Management Bash',
    description: 'mkdir, cp, mv, echo',
    permissions: ['Bash(mkdir *)', 'Bash(cp *)', 'Bash(mv *)', 'Bash(echo *)']
  },
  {
    id: 'git_readonly',
    label: 'Git Read-only',
    description: 'status, diff, log (no push/reset)',
    permissions: ['Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)']
  },
  {
    id: 'git_commit',
    label: 'Git Commit',
    description: 'add, commit (no push)',
    permissions: ['Bash(git add *)', 'Bash(git commit *)']
  },
  {
    id: 'playwright_all',
    label: 'All Playwright (Browser)',
    description: 'Full browser automation for E2E tests',
    permissions: [
      'mcp__playwright__browser_navigate',
      'mcp__playwright__browser_snapshot',
      'mcp__playwright__browser_click',
      'mcp__playwright__browser_type',
      'mcp__playwright__browser_fill_form',
      'mcp__playwright__browser_take_screenshot',
      'mcp__playwright__browser_wait_for',
      'mcp__playwright__browser_select_option',
      'mcp__playwright__browser_hover',
      'mcp__playwright__browser_press_key',
      'mcp__playwright__browser_console_messages',
      'mcp__playwright__browser_network_requests',
    ]
  },
  {
    id: 'api_testing',
    label: 'API Testing (curl)',
    description: 'HTTP requests for backend E2E tests',
    permissions: ['Bash(curl *)']
  }
];

/**
 * All available permissions that users can enable per-project
 */
export const AVAILABLE_PERMISSIONS: PermissionCategory[] = [
  {
    id: 'file',
    label: 'File Operations',
    description: 'Read, write, and search files',
    permissions: [
      { id: 'Read', label: 'Read', description: 'Read file contents', category: 'file' },
      { id: 'Write', label: 'Write', description: 'Create new files', category: 'file' },
      { id: 'Edit', label: 'Edit', description: 'Modify existing files', category: 'file' },
      { id: 'Glob', label: 'Glob', description: 'Search for files by pattern', category: 'file' },
      { id: 'Grep', label: 'Grep', description: 'Search file contents', category: 'file' },
    ]
  },
  {
    id: 'bash',
    label: 'Bash Commands',
    description: 'Shell commands for npm, git, and utilities',
    permissions: [
      { id: 'Bash(npm run *)', label: 'npm run', description: 'Run npm scripts (build, dev, test, etc.)', category: 'bash' },
      { id: 'Bash(npm install *)', label: 'npm install', description: 'Install npm packages', category: 'bash' },
      { id: 'Bash(npm ci *)', label: 'npm ci', description: 'Clean install npm packages', category: 'bash' },
      { id: 'Bash(npx *)', label: 'npx', description: 'Run npx commands (tsc, prisma, etc.)', category: 'bash' },
      { id: 'Bash(node *)', label: 'node', description: 'Run Node.js scripts', category: 'bash' },
      { id: 'Bash(curl *)', label: 'curl', description: 'Make HTTP requests (for API testing)', category: 'bash' },
      { id: 'Bash(ls *)', label: 'ls', description: 'List directory contents', category: 'bash' },
      { id: 'Bash(cat *)', label: 'cat', description: 'Display file contents', category: 'bash' },
      { id: 'Bash(head *)', label: 'head', description: 'Display first lines of file', category: 'bash' },
      { id: 'Bash(tail *)', label: 'tail', description: 'Display last lines of file', category: 'bash' },
      { id: 'Bash(mkdir *)', label: 'mkdir', description: 'Create directories', category: 'bash' },
      { id: 'Bash(cp *)', label: 'cp', description: 'Copy files', category: 'bash' },
      { id: 'Bash(mv *)', label: 'mv', description: 'Move/rename files', category: 'bash' },
      { id: 'Bash(find *)', label: 'find', description: 'Find files', category: 'bash' },
      { id: 'Bash(wc *)', label: 'wc', description: 'Count lines/words/characters', category: 'bash' },
      { id: 'Bash(echo *)', label: 'echo', description: 'Print text', category: 'bash' },
      { id: 'Bash(git status*)', label: 'git status', description: 'Check git status', category: 'bash' },
      { id: 'Bash(git diff*)', label: 'git diff', description: 'View git differences', category: 'bash' },
      { id: 'Bash(git log*)', label: 'git log', description: 'View git history', category: 'bash' },
      { id: 'Bash(git add *)', label: 'git add', description: 'Stage files for commit', category: 'bash' },
      { id: 'Bash(git commit *)', label: 'git commit', description: 'Commit staged changes', category: 'bash' },
    ]
  },
  {
    id: 'mcp',
    label: 'MCP Tools (Browser Automation)',
    description: 'Playwright browser control for E2E testing',
    permissions: [
      { id: 'mcp__playwright__browser_navigate', label: 'Navigate', description: 'Navigate browser to URL', category: 'mcp' },
      { id: 'mcp__playwright__browser_snapshot', label: 'Snapshot', description: 'Get page accessibility snapshot', category: 'mcp' },
      { id: 'mcp__playwright__browser_click', label: 'Click', description: 'Click on page elements', category: 'mcp' },
      { id: 'mcp__playwright__browser_type', label: 'Type', description: 'Type text into inputs', category: 'mcp' },
      { id: 'mcp__playwright__browser_fill_form', label: 'Fill Form', description: 'Fill multiple form fields', category: 'mcp' },
      { id: 'mcp__playwright__browser_take_screenshot', label: 'Screenshot', description: 'Take page screenshots', category: 'mcp' },
      { id: 'mcp__playwright__browser_wait_for', label: 'Wait For', description: 'Wait for text/elements', category: 'mcp' },
      { id: 'mcp__playwright__browser_select_option', label: 'Select Option', description: 'Select dropdown options', category: 'mcp' },
      { id: 'mcp__playwright__browser_hover', label: 'Hover', description: 'Hover over elements', category: 'mcp' },
      { id: 'mcp__playwright__browser_press_key', label: 'Press Key', description: 'Press keyboard keys', category: 'mcp' },
      { id: 'mcp__playwright__browser_console_messages', label: 'Console', description: 'Get browser console messages', category: 'mcp' },
      { id: 'mcp__playwright__browser_network_requests', label: 'Network', description: 'Get network requests', category: 'mcp' },
    ]
  }
];

/**
 * Dangerous operations that are ALWAYS denied - not editable by users
 * These are automatically added to every project's deny list
 */
export const ALWAYS_DENIED: string[] = [
  'Bash(rm -rf *)',
  'Bash(rm -r *)',
  'Bash(sudo *)',
  'Bash(chmod *)',
  'Bash(chown *)',
  'Bash(git push *)',
  'Bash(git push)',
  'Bash(git reset --hard*)',
  'Bash(git clean *)',
  'Bash(> *)',           // Redirect that overwrites
  'Bash(dd *)',
  'Bash(mkfs *)',
  'Bash(:(){ :|:& };:)', // Fork bomb
  'Bash(wget * | sh)',
];

/**
 * Default permissions for new projects (empty - user must explicitly enable)
 */
export const DEFAULT_PROJECT_PERMISSIONS: string[] = [];

/**
 * Template-specific default permissions
 */
export const TEMPLATE_PERMISSIONS: Record<string, string[]> = {
  'vite-frontend': [
    // File operations
    'Read', 'Write', 'Edit', 'Glob', 'Grep',
    // Bash commands
    'Bash(npm run *)', 'Bash(npm install *)', 'Bash(npx *)',
    'Bash(ls *)', 'Bash(cat *)', 'Bash(mkdir *)', 'Bash(find *)',
    // Playwright MCP for E2E
    'mcp__playwright__browser_navigate',
    'mcp__playwright__browser_snapshot',
    'mcp__playwright__browser_click',
    'mcp__playwright__browser_type',
    'mcp__playwright__browser_fill_form',
    'mcp__playwright__browser_take_screenshot',
    'mcp__playwright__browser_wait_for',
    'mcp__playwright__browser_select_option',
    'mcp__playwright__browser_hover',
    'mcp__playwright__browser_press_key',
    'mcp__playwright__browser_console_messages',
    'mcp__playwright__browser_network_requests',
  ],
  'nestjs-backend': [
    // File operations
    'Read', 'Write', 'Edit', 'Glob', 'Grep',
    // Bash commands
    'Bash(npm run *)', 'Bash(npm install *)', 'Bash(npx *)',
    'Bash(curl *)', 'Bash(ls *)', 'Bash(cat *)', 'Bash(mkdir *)', 'Bash(find *)',
  ],
};

/**
 * Flattened list of all permission IDs for easy lookup
 */
export const ALL_PERMISSION_IDS: string[] = AVAILABLE_PERMISSIONS
  .flatMap(category => category.permissions.map(p => p.id));

/**
 * Get permission details by ID
 */
export function getPermissionById(id: string): PermissionOption | undefined {
  for (const category of AVAILABLE_PERMISSIONS) {
    const found = category.permissions.find(p => p.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Validate a list of permission IDs
 */
export function validatePermissions(permissions: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const perm of permissions) {
    if (ALL_PERMISSION_IDS.includes(perm)) {
      valid.push(perm);
    } else {
      invalid.push(perm);
    }
  }

  return { valid, invalid };
}

/**
 * Get a permission group by ID
 */
export function getPermissionGroupById(id: string): PermissionGroup | undefined {
  return PERMISSION_GROUPS.find(g => g.id === id);
}

/**
 * Expand permission groups to individual permissions
 * Takes an array that may contain both individual permissions and group IDs
 */
export function expandPermissionGroups(permissions: string[]): string[] {
  const expanded = new Set<string>();

  for (const perm of permissions) {
    const group = getPermissionGroupById(perm);
    if (group) {
      // It's a group - add all its permissions
      for (const p of group.permissions) {
        expanded.add(p);
      }
    } else {
      // It's an individual permission
      expanded.add(perm);
    }
  }

  return Array.from(expanded);
}

/**
 * Check which groups are fully enabled given a list of permissions
 */
export function getEnabledGroups(permissions: string[]): string[] {
  const permSet = new Set(permissions);
  const enabledGroups: string[] = [];

  for (const group of PERMISSION_GROUPS) {
    const allEnabled = group.permissions.every(p => permSet.has(p));
    if (allEnabled) {
      enabledGroups.push(group.id);
    }
  }

  return enabledGroups;
}

/**
 * Toggle a permission group on or off
 * Returns the new permissions list
 */
export function togglePermissionGroup(
  currentPermissions: string[],
  groupId: string,
  enable: boolean
): string[] {
  const group = getPermissionGroupById(groupId);
  if (!group) return currentPermissions;

  const permSet = new Set(currentPermissions);

  if (enable) {
    // Add all group permissions
    for (const p of group.permissions) {
      permSet.add(p);
    }
  } else {
    // Remove all group permissions
    for (const p of group.permissions) {
      permSet.delete(p);
    }
  }

  return Array.from(permSet);
}

/**
 * Get permissions for a template, with groups expanded
 */
export function getTemplatePermissions(templateId: string): string[] {
  return TEMPLATE_PERMISSIONS[templateId] || DEFAULT_PROJECT_PERMISSIONS;
}
