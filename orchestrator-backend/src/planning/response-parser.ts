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
  // Try to extract from markdown code block first (greedy match for full content)
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : response;

  // Use the proper JSON extraction that handles strings correctly
  const extracted = extractCompleteJSON(jsonStr);
  if (!extracted || extracted === jsonStr) {
    // Try finding the start of a JSON object first
    const startIdx = jsonStr.indexOf('{');
    if (startIdx === -1) return null;
    const extracted2 = extractCompleteJSON(jsonStr.slice(startIdx));
    if (!extracted2) return null;

    try {
      const parsed = JSON.parse(extracted2) as T;
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

  try {
    const parsed = JSON.parse(extracted) as T;

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

/**
 * Extract JSON with "allPassed" from E2E output.
 * First checks for [E2E_RESULTS] marker (preferred), then falls back to code blocks.
 */
export function extractE2EResult(response: string): { allPassed: boolean; failures?: any[]; overallAnalysis?: string } | null {
  // First, check for [E2E_RESULTS] marker (single line JSON)
  const markerMatch = response.match(/\[E2E_RESULTS\]\s*(\{.*\})/);
  if (markerMatch) {
    try {
      const parsed = JSON.parse(markerMatch[1]);
      if ('allPassed' in parsed) {
        console.log(`[extractE2EResult] Found via [E2E_RESULTS] marker: allPassed=${parsed.allPassed}`);
        return parsed;
      }
    } catch (err) {
      console.warn(`[extractE2EResult] Failed to parse [E2E_RESULTS] marker JSON:`, err);
    }
  }

  // Fallback: Find JSON code blocks
  const codeBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    const content = match[1].trim();
    try {
      const jsonStart = content.indexOf('{');
      if (jsonStart === -1) continue;

      const extracted = extractCompleteJSON(content.slice(jsonStart));
      const parsed = JSON.parse(extracted);

      // Check if this is the E2E result (has allPassed field)
      if ('allPassed' in parsed) {
        console.log(`[extractE2EResult] Found E2E result in code block: allPassed=${parsed.allPassed}`);
        return parsed;
      }
    } catch (err) {
      // Continue to next code block
      continue;
    }
  }

  // Final fallback: try to find allPassed anywhere in the response
  const allPassedMatch = response.match(/"allPassed"\s*:\s*(true|false)/);
  if (allPassedMatch) {
    console.log(`[extractE2EResult] Found allPassed via regex fallback: ${allPassedMatch[1]}`);
    return { allPassed: allPassedMatch[1] === 'true' };
  }

  return null;
}

// Standard marker names used across the orchestrator
export const MARKERS = {
  TASK_RESULT: 'TASK_RESULT',
  TASK_SUMMARY: 'TASK_SUMMARY',    // Used by task agents to summarize what they did
  E2E_RESULT: 'E2E_RESULT',        // Used by Planning Agent when analyzing E2E results
  E2E_RESULTS: 'E2E_RESULTS',      // Used by E2E testing agent to report test results
  EVENT_ACTION: 'EVENT_ACTION',
  RESPONSE: 'RESPONSE',
  ACTION: 'ACTION',
  TEST_STATUS: 'TEST_STATUS',
  WORKER_STATUS: 'WORKER_STATUS',
} as const;

export type MarkerName = typeof MARKERS[keyof typeof MARKERS];
