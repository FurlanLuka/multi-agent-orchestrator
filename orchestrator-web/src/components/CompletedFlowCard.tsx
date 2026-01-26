import { Card, Group, Badge, Text, Stack, Code, Box, Collapse, ActionIcon } from '@mantine/core';
import { IconCheck, IconX, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import type { RequestFlow } from '@aio/types';

interface CompletedFlowCardProps {
  flow: RequestFlow;
}

function getFlowLabel(type: string, passed?: boolean): string {
  switch (type) {
    case 'e2e': return passed ? 'E2E: Passed' : 'E2E: Failed';
    case 'task': return passed ? 'Task: Verified' : 'Task: Failed';
    case 'planning': return 'Response';
    case 'fix': return passed ? 'Fix: Applied' : 'Fix: Failed';
    case 'waiting': return 'Dependency';
    case 'info': return 'Info';
    case 'success': return 'Success';
    default: return type;
  }
}

// Get color for flow type (some types use non-pass/fail colors)
function getFlowColor(type: string, passed?: boolean): string {
  if (type === 'info' || type === 'planning') {
    return 'blue';  // Neutral color for info/planning flows
  }
  if (type === 'success') {
    return 'green';  // Always green for success type
  }
  return passed ? 'green' : 'red';
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function CompletedFlowCard({ flow }: CompletedFlowCardProps) {
  const [expanded, setExpanded] = useState(false);
  const passed = flow.result?.passed ?? (flow.status === 'completed');
  const color = getFlowColor(flow.type, passed);
  const hasDetails = flow.result?.details || flow.steps.length > 1;

  // For info/planning/success flows, just show the summary directly if available
  // For other flows, build the label with optional task name
  let displayText: string;
  if ((flow.type === 'info' || flow.type === 'planning' || flow.type === 'success') && flow.result?.summary) {
    displayText = flow.result.summary;
  } else if (flow.taskName) {
    displayText = `${getFlowLabel(flow.type, passed)}: ${flow.taskName}`;
  } else {
    displayText = getFlowLabel(flow.type, passed);
  }

  // Use checkmark for passed/info, X for failed
  const showIcon = flow.type !== 'planning';  // Hide icon for planning (PA response) flows
  const Icon = passed ? IconCheck : IconX;

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
          {showIcon && (
            <Icon size={18} color={`var(--mantine-color-${color}-6)`} style={{ flexShrink: 0 }} />
          )}
          <Text size="sm" c={`${color}.7`} lineClamp={1} style={{ flex: 1 }}>
            {displayText}
          </Text>
          {flow.project && (
            <Badge size="xs" variant="light" color={color} style={{ flexShrink: 0 }}>
              {flow.project}
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {flow.completedAt ? formatTimestamp(flow.completedAt) : ''}
          </Text>
          {hasDetails && (
            <ActionIcon variant="subtle" color={color} onClick={() => setExpanded(!expanded)} size="sm">
              {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          )}
        </Group>
      </Group>

      {/* Expandable details */}
      {hasDetails && (
        <Collapse in={expanded}>
          <Stack mt="sm" gap="sm" pt="sm" style={{ borderTop: `1px solid var(--mantine-color-${color}-2)` }}>
            {/* Summary */}
            {flow.result?.summary && (
              <Text size="sm" c="dimmed">
                {flow.result.summary}
              </Text>
            )}

            {/* Steps timeline */}
            {flow.steps.length > 1 && (
              <Box>
                <Text size="xs" c="dimmed" mb="xs">Steps:</Text>
                <Stack gap={4}>
                  {flow.steps.map((step) => (
                    <Group key={step.id} gap="xs">
                      {step.status === 'completed' ? (
                        <IconCheck size={12} color={`var(--mantine-color-green-6)`} />
                      ) : step.status === 'failed' ? (
                        <IconX size={12} color={`var(--mantine-color-red-6)`} />
                      ) : (
                        <Box w={12} />
                      )}
                      <Text size="xs" c="dimmed">{step.message}</Text>
                    </Group>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Details */}
            {flow.result?.details && (
              <Box
                style={{
                  backgroundColor: 'var(--mantine-color-dark-8)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  padding: '8px',
                }}
              >
                <Code
                  block
                  style={{
                    fontSize: '11px',
                    maxHeight: '150px',
                    overflow: 'auto',
                    backgroundColor: 'transparent',
                    color: 'var(--mantine-color-gray-4)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {flow.result.details}
                </Code>
              </Box>
            )}
          </Stack>
        </Collapse>
      )}
    </Card>
  );
}
