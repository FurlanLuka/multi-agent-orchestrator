import { Group, Badge, Text, Stack, Code, Box, Collapse, ActionIcon } from '@mantine/core';
import { IconCheck, IconX, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import type { RequestFlow } from '@orchy/types';
import { GlassCard } from '../theme';

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
  if (type === 'info') {
    return 'gray';  // Neutral color for info flows
  }
  if (type === 'success' || type === 'planning') {
    return 'sage';  // Always green for success and planning (approved) flows
  }
  return passed ? 'sage' : 'rose';
}

// Get background color for flow type
function getFlowBgColor(type: string, passed?: boolean): string {
  if (type === 'info') {
    return 'rgba(160, 130, 110, 0.06)';  // Warm gray tint
  }
  if (type === 'success' || type === 'planning' || passed) {
    return 'rgba(74, 145, 73, 0.08)';  // Sage tint
  }
  return 'rgba(209, 67, 67, 0.08)';  // Rose tint
}

// Get border color for flow type
function getFlowBorderColor(type: string, passed?: boolean): string {
  if (type === 'info') {
    return 'rgba(160, 130, 110, 0.15)';  // Warm gray border
  }
  if (type === 'success' || type === 'planning' || passed) {
    return 'rgba(74, 145, 73, 0.2)';
  }
  return 'rgba(209, 67, 67, 0.2)';
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
  const showIcon = true;  // Show icon for all flow types including planning
  const Icon = passed ? IconCheck : IconX;

  return (
    <GlassCard
      p="sm"
      style={{
        backgroundColor: getFlowBgColor(flow.type, passed),
        borderColor: getFlowBorderColor(flow.type, passed),
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {showIcon && (
            <Icon size={18} style={{ color: `var(--color-${passed ? 'success' : 'error'})`, flexShrink: 0 }} />
          )}
          <Text size="sm" lineClamp={1} style={{ flex: 1, color: 'var(--text-body)' }}>
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
          <Stack mt="sm" gap="sm" pt="sm" style={{ borderTop: '1px solid var(--border-subtle)' }}>
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
                        <IconCheck size={12} style={{ color: 'var(--color-success)' }} />
                      ) : step.status === 'failed' ? (
                        <IconX size={12} style={{ color: 'var(--color-error)' }} />
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
                  backgroundColor: '#1e1e1e',
                  borderRadius: 8,
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
                    color: '#abb2bf',
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
    </GlassCard>
  );
}
