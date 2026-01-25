import { Card, Group, Text, Badge, Loader, ThemeIcon, Collapse, Stack, ActionIcon } from '@mantine/core';
import { IconCheck, IconX, IconTool, IconClock, IconChevronUp, IconChevronDown, IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import type { ChatCardEvent } from '../types';

interface Props {
  event: ChatCardEvent;
}

// Get color and icon based on responseStatus or passed state
function getResultStyle(event: ChatCardEvent): { color: string; Icon: React.ComponentType<{ size: number; color?: string; style?: React.CSSProperties }> } {
  // If responseStatus is set, use it for color
  if (event.responseStatus) {
    switch (event.responseStatus) {
      case 'success': return { color: 'green', Icon: IconCheck };
      case 'error': return { color: 'red', Icon: IconX };
      case 'warning': return { color: 'yellow', Icon: IconAlertTriangle };
      case 'info': return { color: 'blue', Icon: IconInfoCircle };
    }
  }
  // Fallback to passed state
  return event.passed
    ? { color: 'green', Icon: IconCheck }
    : { color: 'red', Icon: IconX };
}

export function ChatEventCard({ event }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Status cards (in-progress with spinner)
  if (event.type === 'status') {
    const color = event.category === 'e2e' ? 'violet' : 'blue';
    return (
      <Card
        p="xs"
        radius="md"
        withBorder
        style={{
          backgroundColor: `var(--mantine-color-${color}-0)`,
          borderColor: `var(--mantine-color-${color}-3)`,
        }}
      >
        <Group gap="sm">
          <Loader size={16} color={color} />
          <Text size="sm" c={`${color}.7`}>{event.message}</Text>
          {event.project && (
            <Badge size="xs" variant="light" color={color}>
              {event.project}
            </Badge>
          )}
        </Group>
      </Card>
    );
  }

  // Result cards (pass/fail or response status)
  if (event.type === 'result') {
    const { color, Icon } = getResultStyle(event);
    const hasDetails = event.details || event.fixPrompt;
    const isResponse = !!event.responseStatus;  // Is this a chat response card?

    // Determine display text
    const displayText = isResponse
      ? event.summary  // For responses, always show the summary message
      : event.passed
        ? (event.category === 'task' ? `Task "${event.taskName}" verified` : `E2E tests passed`)
        : event.summary;

    // Show expand button for responses with details, or failed cards
    const showExpand = hasDetails && (isResponse || !event.passed);

    return (
      <Card
        p="sm"
        radius="md"
        withBorder
        style={{
          backgroundColor: `var(--mantine-color-${color}-0)`,
          borderColor: `var(--mantine-color-${color}-3)`,
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Icon size={18} color={`var(--mantine-color-${color}-6)`} style={{ flexShrink: 0 }} />
            <Text size="sm" c={`${color}.7`} lineClamp={isResponse ? 3 : 1} style={{ flex: 1 }}>
              {displayText}
            </Text>
            {event.project && (
              <Badge size="xs" variant="light" color={color} style={{ flexShrink: 0 }}>
                {event.project}
              </Badge>
            )}
          </Group>
          {showExpand && (
            <ActionIcon variant="subtle" color={color} onClick={() => setExpanded(!expanded)} size="sm">
              {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          )}
        </Group>

        {hasDetails && (
          <Collapse in={expanded}>
            <Stack mt="sm" gap="sm" pt="sm" style={{ borderTop: `1px solid var(--mantine-color-${color}-2)` }}>
              {event.details && (
                <MarkdownMessage content={event.details} />
              )}
              {event.fixPrompt && (
                <>
                  <Text size="sm" fw={500} c={`${color}.7`}>Fix requested:</Text>
                  <MarkdownMessage content={event.fixPrompt} />
                </>
              )}
            </Stack>
          </Collapse>
        )}
      </Card>
    );
  }

  // Info cards (plan approved, fix sent, waiting)
  if (event.type === 'info') {
    let color = 'blue';
    let Icon = IconTool;

    if (event.category === 'plan') {
      color = 'green';
      Icon = IconCheck;
    } else if (event.message?.includes('Waiting')) {
      color = 'yellow';
      Icon = IconClock;
    }

    return (
      <Card
        p="sm"
        radius="md"
        withBorder
        style={{
          backgroundColor: `var(--mantine-color-${color}-0)`,
          borderColor: `var(--mantine-color-${color}-3)`,
        }}
      >
        <Group gap="sm">
          <ThemeIcon size="sm" color={color} variant="light">
            <Icon size={14} />
          </ThemeIcon>
          <Text size="sm" c={`${color}.7`} fw={500}>{event.message}</Text>
          {event.project && (
            <Badge size="xs" variant="light" color="gray">
              {event.project}
            </Badge>
          )}
        </Group>
        {event.summary && (
          <Text size="xs" c="dimmed" mt="xs">{event.summary}</Text>
        )}
      </Card>
    );
  }

  return null;
}
