import type { PlanningPhase } from '@orchy/types';

interface PhaseContent {
  description: string;
  tips: string[];
}

/**
 * Phase-specific content for planning helper text.
 * Tips rotate every 10 seconds to keep users informed during long operations.
 */
export const PHASE_CONTENT: Partial<Record<PlanningPhase, PhaseContent>> = {
  exploring: {
    description: 'Reading files and understanding code patterns',
    tips: [
      'The planner reads CLAUDE.md and skills to understand conventions',
      'Large codebases may take longer to explore',
      'Code patterns relevant to your feature are being traced',
      'Existing implementations are analyzed for consistency',
    ],
  },
  analyzing: {
    description: 'Analyzing requirements and determining approach',
    tips: [
      'Considering how your feature fits with existing code',
      'API contracts and data flows are being mapped',
      'Dependencies between components are being identified',
    ],
  },
  generating: {
    description: 'Creating detailed tasks for implementation',
    tips: [
      'Each task includes specific files to modify',
      'Tasks are ordered by project dependencies',
      'Implementation details are being specified',
    ],
  },
  refining: {
    description: 'Updating plan based on your feedback',
    tips: [
      'Incorporating your suggestions into the plan',
      'Adjusting implementation approach as needed',
    ],
  },
};

/**
 * Get a rotating tip index based on elapsed time.
 * Tips rotate every 10 seconds.
 */
export function getRotatingTipIndex(startedAt: number, tipsCount: number): number {
  if (tipsCount === 0) return 0;
  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const cycleIndex = Math.floor(elapsedSeconds / 10);
  return cycleIndex % tipsCount;
}
