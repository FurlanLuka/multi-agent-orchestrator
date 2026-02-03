import { Text, Group } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';

interface HelpTriggerProps {
  label?: string;
}

/**
 * A small "Need help?" trigger component with consistent styling.
 * Lavender colored text with subtle icon and hover underline effect.
 */
export function HelpTrigger({ label = 'Need help?' }: HelpTriggerProps) {
  return (
    <Group
      gap={4}
      style={{
        cursor: 'pointer',
        transition: 'opacity 0.15s ease',
      }}
      className="help-trigger"
    >
      <IconHelpCircle size={14} style={{ color: 'var(--mantine-color-lavender-5)' }} />
      <Text
        size="sm"
        style={{
          color: 'var(--mantine-color-lavender-5)',
          textDecoration: 'none',
          transition: 'text-decoration 0.15s ease',
        }}
        className="help-trigger-text"
      >
        {label}
      </Text>
      <style>{`
        .help-trigger:hover .help-trigger-text {
          text-decoration: underline;
        }
        .help-trigger:hover {
          opacity: 0.85;
        }
      `}</style>
    </Group>
  );
}
