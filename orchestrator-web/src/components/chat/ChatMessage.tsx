import { useMemo, memo } from 'react';
import {
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
import { GlassCard } from '../../theme';

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
          color="peach"
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
        color="peach"
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
    <GlassCard
      p="md"
      style={{
        backgroundColor: isUser ? 'rgba(245, 133, 101, 0.08)' : undefined,
        borderColor: isUser ? 'rgba(245, 133, 101, 0.2)' : undefined,
        opacity: isQueued ? 0.8 : 1,
      }}
    >
      {/* Header with role and timestamp */}
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          {isUser ? (
            <IconUser size={18} style={{ color: 'var(--color-primary)' }} />
          ) : (
            <IconRobot size={18} style={{ color: 'var(--text-muted)' }} />
          )}
          <Text size="sm" fw={600} style={{ color: isUser ? 'var(--color-primary)' : 'var(--text-label)' }}>
            {isUser ? 'You' : 'Planning Agent'}
          </Text>
          {isStreaming && (
            <Badge size="xs" color="honey" variant="dot">
              Streaming...
            </Badge>
          )}
          {isQueued && (
            <Badge size="xs" color="honey" variant="light">
              Queued
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <IconClock size={12} style={{ color: 'var(--text-placeholder)' }} />
          <Text size="xs" c="dimmed">
            {formatTimestamp(message.createdAt)}
          </Text>
        </Group>
      </Group>

      <Divider mb="sm" color={isUser ? 'rgba(245, 133, 101, 0.15)' : 'var(--border-subtle)'} />

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
    </GlassCard>
  );
});
