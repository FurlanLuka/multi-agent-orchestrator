import { useState } from 'react';
import { Card, Group, Text, ActionIcon, Collapse, Stack, Code, Badge } from '@mantine/core';
import { IconCheck, IconX, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { AnalysisResultEvent } from '../types';

interface Props {
  result: AnalysisResultEvent;
}

export function AnalysisResultCard({ result }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Passed state - compact green indicator
  if (result.passed) {
    return (
      <Card
        p="xs"
        radius="md"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-green-0)',
          borderColor: 'var(--mantine-color-green-3)',
        }}
      >
        <Group gap="sm">
          <IconCheck size={18} color="var(--mantine-color-green-6)" />
          <Text size="sm" c="green.7">
            {result.type === 'task'
              ? `Task "${result.taskName}" verified`
              : `E2E tests passed for ${result.project}`}
          </Text>
          <Badge size="xs" variant="light" color="green">
            {result.project}
          </Badge>
        </Group>
      </Card>
    );
  }

  // Failed state - expandable red card with details
  return (
    <Card
      p="sm"
      radius="md"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-red-0)',
        borderColor: 'var(--mantine-color-red-3)',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <IconX size={18} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
          <Text size="sm" c="red.7" lineClamp={1} style={{ flex: 1 }}>
            {result.summary}
          </Text>
          <Badge size="xs" variant="light" color="red" style={{ flexShrink: 0 }}>
            {result.project}
          </Badge>
        </Group>
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={() => setExpanded(!expanded)}
          size="sm"
        >
          {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>

      <Collapse in={expanded}>
        <Stack mt="sm" gap="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-red-2)' }}>
          {result.details && (
            <>
              <Text size="sm" fw={500} c="red.7">Analysis:</Text>
              <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                {result.details}
              </Text>
            </>
          )}
          {result.fixPrompt && (
            <>
              <Text size="sm" fw={500} c="red.7">Fix requested:</Text>
              <Code block style={{ fontSize: '12px', maxHeight: '150px', overflow: 'auto' }}>
                {result.fixPrompt}
              </Code>
            </>
          )}
        </Stack>
      </Collapse>
    </Card>
  );
}
