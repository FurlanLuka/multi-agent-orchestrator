/**
 * Unified response parser for agent-to-orchestrator communication.
 *
 * All agent responses should use markers like:
 *   [MARKER_NAME] {"field": "value", ...}
 *
 * This provides clear boundaries and handles Claude's verbosity (extra text before/after).
 */

export interface ParsedResponse<T> {
  success: boolean;
  data?: T;
  raw: string;
  error?: string;
}

/**
 * Parses a marked response from an agent.
 *
 * @param response - The raw response string from the agent
 * @param marker - The marker name (e.g., 'TASK_RESULT', 'E2E_RESULT')
 * @param requiredFields - Optional list of fields that must be present in the parsed JSON
 * @returns ParsedResponse with success status and data if successful
 *
 * @example
 * // Agent response: "I analyzed the task.\n[TASK_RESULT] {"passed": true, "analysis": "All good"}"
 * const result = parseMarkedResponse<TaskResult>(response, 'TASK_RESULT', ['passed']);
 * if (result.success) {
 *   console.log(result.data.passed); // true
 * }
 */
export function parseMarkedResponse<T>(
  response: string,
  marker: string,
  requiredFields: string[] = []
): ParsedResponse<T> {
  // Pattern: [MARKER] {json}
  // The \s* handles optional whitespace between marker and JSON
  const pattern = new RegExp(`\\[${marker}\\]\\s*(\\{[\\s\\S]*)`, 'i');
  const match = response.match(pattern);

  if (!match) {
    return { success: false, raw: response, error: `Marker [${marker}] not found` };
  }

  try {
    // Find the complete JSON object (handle nested braces properly)
    const jsonStr = extractCompleteJSON(match[1]);
    const data = JSON.parse(jsonStr) as T;

    // Validate required fields
    for (const field of requiredFields) {
      if (!(field in (data as Record<string, unknown>))) {
        return { success: false, raw: response, error: `Missing required field: ${field}` };
      }
    }

    return { success: true, data, raw: response };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, raw: response, error: `JSON parse error: ${errorMessage}` };
  }
}

/**
 * Extracts a complete JSON object from a string, handling nested braces correctly.
 * Properly accounts for braces inside strings and escaped characters.
 *
 * @param str - String starting with a JSON object
 * @returns The complete JSON object string
 */
function extractCompleteJSON(str: string): string {
  let braceCount = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return str.slice(0, i + 1);
        }
      }
    }
  }

  // Return as-is if no complete object found (will likely fail JSON.parse)
  return str;
}

/**
 * Legacy JSON extraction - finds JSON in markdown code blocks or raw text.
 * Used as fallback when markers are not present.
 *
 * @param response - The raw response string
 * @param requiredFields - Optional list of fields that must be present
 * @returns Parsed JSON or null if parsing fails
 */
export function extractJSON<T>(response: string, requiredFields: string[] = []): T | null {
  // Try to extract from markdown code block first
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : response;

  // Find the outermost JSON object
  let braceCount = 0;
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    if (jsonStr[i] === '{') {
      if (braceCount === 0) startIdx = i;
      braceCount++;
    } else if (jsonStr[i] === '}') {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) {
        endIdx = i + 1;
        break;
      }
    }
  }

  if (startIdx === -1 || endIdx === -1) return null;

  try {
    const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx)) as T;

    // Validate required fields
    for (const field of requiredFields) {
      if (!(field in (parsed as Record<string, unknown>))) {
        console.warn(`[extractJSON] Missing required field: ${field}`);
        return null;
      }
    }

    return parsed;
  } catch (err) {
    console.error('[extractJSON] Parse error:', err);
    return null;
  }
}

// Standard marker names used across the orchestrator
export const MARKERS = {
  TASK_RESULT: 'TASK_RESULT',
  E2E_RESULT: 'E2E_RESULT',
  EVENT_ACTION: 'EVENT_ACTION',
  RESPONSE: 'RESPONSE',
  ACTION: 'ACTION',
  TEST_STATUS: 'TEST_STATUS',
  WORKER_STATUS: 'WORKER_STATUS',
} as const;

export type MarkerName = typeof MARKERS[keyof typeof MARKERS];
