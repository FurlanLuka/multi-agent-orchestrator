import { useState, useEffect } from 'react';
import { Group, Text } from '@mantine/core';
import { IconClock, IconBulb } from '@tabler/icons-react';
import type { PlanningPhase } from '@orchy/types';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { PHASE_CONTENT, getRotatingTipIndex } from './planningHelpers';

interface PlanningHelperTextProps {
  phase: PlanningPhase;
  startedAt: number;
}

/**
 * Displays elapsed time and rotating tips during long-running planning operations.
 * Shows phase-specific helpful information to indicate the system isn't stuck.
 */
export function PlanningHelperText({ phase, startedAt }: PlanningHelperTextProps) {
  const elapsed = useElapsedTime(startedAt);
  const [tipIndex, setTipIndex] = useState(0);

  const content = PHASE_CONTENT[phase];
  const tips = content?.tips || [];

  // Update tip index every second to check if we need to rotate
  useEffect(() => {
    if (tips.length === 0) return;

    const interval = setInterval(() => {
      const newIndex = getRotatingTipIndex(startedAt, tips.length);
      setTipIndex(newIndex);
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, tips.length]);

  // Don't render if no content for this phase
  if (!content) return null;

  const currentTip = tips[tipIndex] || tips[0];

  return (
    <Group gap="md" mt={4} ml={28}>
      {/* Elapsed time */}
      <Group gap={4}>
        <IconClock size={12} style={{ color: 'var(--text-dimmed)', opacity: 0.7 }} />
        <Text size="xs" c="dimmed">
          {elapsed}
        </Text>
      </Group>

      {/* Rotating tip */}
      {currentTip && (
        <Group gap={4}>
          <IconBulb size={12} style={{ color: 'var(--color-honey)', opacity: 0.7 }} />
          <Text size="xs" c="dimmed" fs="italic">
            {currentTip}
          </Text>
        </Group>
      )}
    </Group>
  );
}
