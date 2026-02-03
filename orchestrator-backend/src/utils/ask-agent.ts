/**
 * Lightweight one-shot Claude utility for quick prompts.
 * Uses --no-session-persistence for stateless execution.
 */

import { spawnWithShellEnv } from './shell-env';

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Execute a one-shot prompt to Claude and return the response.
 * Used for simple tasks like generating branch names.
 */
export async function askAgent(
  prompt: string,
  options: {
    cwd?: string;
    timeout?: number;
  } = {}
): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  const proc = await spawnWithShellEnv('claude', {
    cwd,
    args: [
      '-p', prompt,
      '--output-format', 'text',
      '--no-session-persistence',
    ],
  });

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Claude request timed out'));
    }, timeout);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Generate a git branch name from a feature description using Claude AI.
 * Falls back to simple kebab-case generation if AI fails.
 */
export async function generateBranchName(
  featureDescription: string,
  options: {
    cwd?: string;
    timeout?: number;
  } = {}
): Promise<string> {
  const prompt = `Generate a git branch name for this feature. Return ONLY the branch name (no explanation, no quotes, no markdown).

Feature: ${featureDescription.slice(0, 500)}

Rules:
- Use format: feature/kebab-case-name
- Keep it short (max 50 chars total)
- Use lowercase letters, numbers, and hyphens only
- No spaces or special characters

Example outputs:
- feature/user-authentication
- feature/add-comments-api
- feature/fix-login-bug`;

  try {
    const result = await askAgent(prompt, {
      cwd: options.cwd,
      timeout: options.timeout || 15000,
    });

    // Clean up the response - extract just the branch name
    const cleaned = result
      .trim()
      .split('\n')[0]  // Take first line only
      .replace(/["`']/g, '')  // Remove quotes
      .replace(/^branch:\s*/i, '')  // Remove "branch:" prefix if present
      .trim();

    // Validate the result looks like a valid branch name
    if (cleaned && /^feature\/[a-z0-9-]+$/i.test(cleaned)) {
      return cleaned.toLowerCase().slice(0, 50);
    }

    // If it doesn't have the prefix, add it
    if (cleaned && /^[a-z0-9-]+$/i.test(cleaned)) {
      return `feature/${cleaned.toLowerCase()}`.slice(0, 50);
    }

    // Fallback to simple generation
    console.warn('[ask-agent] AI response not a valid branch name, using fallback');
    return generateBranchNameFallback(featureDescription);
  } catch (err) {
    console.warn('[ask-agent] Failed to generate branch name with AI:', err);
    return generateBranchNameFallback(featureDescription);
  }
}

/**
 * Simple fallback for branch name generation without AI.
 */
function generateBranchNameFallback(feature: string): string {
  const kebabCase = feature
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `feature/${kebabCase}`;
}
