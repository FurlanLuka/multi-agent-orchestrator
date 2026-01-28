import { useMemo, memo } from 'react';
import {
  Card,
  Group,
  Text,
  Badge,
  Divider,
  Box,
  Button,
} from '@mantine/core';
import { IconUser, IconRobot, IconClock, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { StreamingMessage, ContentBlock } from '@aio/types';
import { MessageContent } from './MessageContent';

// Format timestamp
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Check if content looks like a long plan message that should be collapsible
function isLongPlanContent(content: ContentBlock[]): boolean {
  const textBlocks = content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
  if (textBlocks.length === 0) return false;

  const fullText = textBlocks.map(b => b.text).join('\n');

  // Only collapse very long structured messages
  return fullText.length > 2000 && (
    fullText.includes('## Implementation Plan') ||
    fullText.includes('## Tasks') ||
    fullText.includes('```json')
  );
}

// Collapsible long content component
interface CollapsibleContentProps {
  content: ContentBlock[];
  expanded: boolean;
  onToggle: () => void;
}

function CollapsibleContent({ content, expanded, onToggle }: CollapsibleContentProps) {
  if (!expanded) {
    return (
      <Box>
        <Button
          variant="subtle"
          size="xs"
          onClick={onToggle}
          leftSection={<IconChevronDown size={14} />}
        >
          Show full message
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <MessageContent content={content} />
      <Button
        variant="subtle"
        size="xs"
        onClick={onToggle}
        leftSection={<IconChevronUp size={14} />}
        mt="sm"
      >
        Hide details
      </Button>
    </Box>
  );
}

// Single message component - memoized to prevent re-renders
export interface ChatMessageProps {
  message: StreamingMessage;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const ChatMessage = memo(function ChatMessage({ message, isExpanded, onToggleExpand }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isQueued = message.status === 'queued';
  const isLongContent = useMemo(() => !isUser && isLongPlanContent(message.content), [isUser, message.content]);

  return (
    <Card
      p="md"
      withBorder
      shadow="sm"
      radius="md"
      style={{
        backgroundColor: isUser ? 'var(--mantine-color-blue-0)' : 'white',
        borderColor: isUser ? 'var(--mantine-color-blue-2)' : 'var(--mantine-color-gray-3)',
        opacity: isQueued ? 0.8 : 1,
      }}
    >
      {/* Header with role and timestamp */}
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          {isUser ? (
            <IconUser size={18} color="var(--mantine-color-blue-6)" />
          ) : (
            <IconRobot size={18} color="var(--mantine-color-gray-6)" />
          )}
          <Text size="sm" fw={600} c={isUser ? 'blue.7' : 'gray.7'}>
            {isUser ? 'You' : 'Planning Agent'}
          </Text>
          {isStreaming && (
            <Badge size="xs" color="yellow" variant="dot">
              Streaming...
            </Badge>
          )}
          {isQueued && (
            <Badge size="xs" color="orange" variant="light">
              Queued
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <IconClock size={12} color="var(--mantine-color-gray-5)" />
          <Text size="xs" c="dimmed">
            {formatTimestamp(message.createdAt)}
          </Text>
        </Group>
      </Group>

      <Divider mb="sm" color={isUser ? 'blue.1' : 'gray.2'} />

      {/* Message content - collapsible for very long messages */}
      {isLongContent ? (
        <CollapsibleContent
          content={message.content}
          expanded={isExpanded}
          onToggle={onToggleExpand}
        />
      ) : (
        <MessageContent content={message.content} />
      )}
    </Card>
  );
});
