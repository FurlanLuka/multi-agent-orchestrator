import { useState, useEffect, useRef, useMemo, memo } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Paper,
  ScrollArea,
  Group,
  ActionIcon,
  TextInput,
  Text,
  Badge,
  Card,
  Stack,
  Accordion,
  Code,
  Box,
  Divider,
  Button,
} from '@mantine/core';
import { IconSend, IconRobot, IconUser, IconTool, IconBrain, IconClock, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { StreamingMessage, ContentBlock, Plan, PlanProposal, PlanningStatusEvent, ChatCardEvent, RequestFlow } from '../types';
import { PlanningStatusIndicator } from './PlanningStatusIndicator';
import { ChatEventCard } from './ChatEventCard';
import { TabbedPlanView } from './TabbedPlanView';
import { ActiveFlowCard } from './ActiveFlowCard';
import { CompletedFlowCard } from './CompletedFlowCard';

interface AssistantChatProps {
  messages: StreamingMessage[];
  pendingPlan: PlanProposal | null;
  planningStatus: PlanningStatusEvent | null;
  chatEvents: ChatCardEvent[];
  activeFlows: RequestFlow[];
  completedFlows: RequestFlow[];
  onSendMessage: (message: string) => void;
  onApprovePlan: (plan: Plan) => void;
  sessionActive: boolean;
  readOnly?: boolean;
}

// Types for markdown components
interface MarkdownCodeProps {
  className?: string;
  children?: React.ReactNode;
}

interface MarkdownChildrenProps {
  children?: React.ReactNode;
}

// Custom markdown components with syntax highlighting
const markdownComponents = {
  code({ className, children }: MarkdownCodeProps) {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match && !className;

    if (isInline) {
      return (
        <Code style={{ fontSize: '0.85em' }}>
          {children}
        </Code>
      );
    }

    return (
      <SyntaxHighlighter
        style={oneDark}
        language={match ? match[1] : 'text'}
        PreTag="div"
        customStyle={{
          margin: '0.5em 0',
          borderRadius: '4px',
          fontSize: '12px',
        }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  },
  p({ children }: MarkdownChildrenProps) {
    return <Text size="sm" style={{ marginBottom: '0.5em' }}>{children}</Text>;
  },
  ul({ children }: MarkdownChildrenProps) {
    return <ul style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>{children}</ul>;
  },
  ol({ children }: MarkdownChildrenProps) {
    return <ol style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>{children}</ol>;
  },
  li({ children }: MarkdownChildrenProps) {
    return <li style={{ marginBottom: '0.25em' }}><Text size="sm" component="span">{children}</Text></li>;
  },
  h1({ children }: MarkdownChildrenProps) {
    return <Text size="lg" fw={700} mt="md" mb="xs">{children}</Text>;
  },
  h2({ children }: MarkdownChildrenProps) {
    return <Text size="md" fw={600} mt="sm" mb="xs">{children}</Text>;
  },
  h3({ children }: MarkdownChildrenProps) {
    return <Text size="sm" fw={600} mt="sm" mb="xs">{children}</Text>;
  },
};

// Custom message content renderer for our content blocks - memoized
const MessageContent = memo(function MessageContent({ content }: { content: ContentBlock[] }) {
  return (
    <Stack gap="sm">
      {content.map((block, index) => {
        switch (block.type) {
          case 'text':
            return (
              <Box key={index}>
                <ReactMarkdown components={markdownComponents}>
                  {block.text}
                </ReactMarkdown>
              </Box>
            );

          case 'tool_use':
            return (
              <Accordion
                key={index}
                variant="filled"
                radius="sm"
                styles={{
                  item: { backgroundColor: 'var(--mantine-color-blue-light)', border: 'none' },
                  control: { padding: '8px 12px' },
                  panel: { padding: '0 12px 12px' },
                }}
              >
                <Accordion.Item value={block.id}>
                  <Accordion.Control icon={<IconTool size={14} color="var(--mantine-color-blue-6)" />}>
                    <Group gap="xs">
                      <Badge size="xs" color="blue" variant="filled">
                        Tool Call
                      </Badge>
                      <Text size="xs" fw={500} c="blue.7">{block.name}</Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Box style={{ backgroundColor: '#1e1e1e', borderRadius: '4px', padding: '8px' }}>
                      <Code
                        block
                        style={{
                          fontSize: '11px',
                          maxHeight: '200px',
                          overflow: 'auto',
                          backgroundColor: 'transparent',
                          color: '#abb2bf',
                        }}
                      >
                        {JSON.stringify(block.input, null, 2)}
                      </Code>
                    </Box>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            );

          case 'tool_result':
            return (
              <Accordion
                key={index}
                variant="filled"
                radius="sm"
                styles={{
                  item: {
                    backgroundColor: block.is_error
                      ? 'var(--mantine-color-red-light)'
                      : 'var(--mantine-color-green-light)',
                    border: 'none'
                  },
                  control: { padding: '8px 12px' },
                  panel: { padding: '0 12px 12px' },
                }}
              >
                <Accordion.Item value={block.tool_use_id}>
                  <Accordion.Control icon={<IconTool size={14} color={block.is_error ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-green-6)'} />}>
                    <Group gap="xs">
                      <Badge
                        size="xs"
                        color={block.is_error ? 'red' : 'green'}
                        variant="filled"
                      >
                        {block.is_error ? 'Error' : 'Result'}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Box style={{ backgroundColor: '#1e1e1e', borderRadius: '4px', padding: '8px' }}>
                      <Code
                        block
                        style={{
                          fontSize: '11px',
                          maxHeight: '200px',
                          overflow: 'auto',
                          backgroundColor: 'transparent',
                          color: block.is_error ? '#ff6b6b' : '#98c379',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {block.content}
                      </Code>
                    </Box>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            );

          case 'thinking':
            return (
              <Accordion
                key={index}
                variant="filled"
                radius="sm"
                styles={{
                  item: { backgroundColor: 'var(--mantine-color-grape-light)', border: 'none' },
                  control: { padding: '8px 12px' },
                  panel: { padding: '0 12px 12px' },
                }}
              >
                <Accordion.Item value={`thinking-${index}`}>
                  <Accordion.Control icon={<IconBrain size={14} color="var(--mantine-color-grape-6)" />}>
                    <Group gap="xs">
                      <Badge size="xs" color="grape" variant="filled">
                        Thinking
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                      {block.thinking}
                    </Text>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            );

          default:
            return null;
        }
      })}
    </Stack>
  );
});

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

// Collapsible long content component (no type badges)
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
interface ChatMessageProps {
  message: StreamingMessage;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const ChatMessage = memo(function ChatMessage({ message, isExpanded, onToggleExpand }: ChatMessageProps) {
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

// Timeline item type for unified rendering
type TimelineItem =
  | { type: 'message'; timestamp: number; data: StreamingMessage; key: string }
  | { type: 'event'; timestamp: number; data: ChatCardEvent; key: string }
  | { type: 'flow'; timestamp: number; data: RequestFlow; key: string };

// Main chat component using external store
function ChatThread({
  messages,
  pendingPlan,
  planningStatus,
  chatEvents,
  activeFlows,
  completedFlows,
  onSendMessage,
  onApprovePlan,
  sessionActive,
  readOnly = false,
}: AssistantChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  // Check if any message is currently streaming - memoized
  const hasStreamingMessage = useMemo(
    () => messages.some(m => m.status === 'streaming'),
    [messages]
  );

  // Derive effective expanded state - auto-collapse during streaming
  const effectiveExpandedId = hasStreamingMessage ? null : expandedMessageId;

  // Create unified timeline: user messages + structured event cards + completed flows
  // Hide raw Planning Agent streaming messages - only show structured cards
  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Only add USER messages (not assistant/Planning Agent messages)
    messages
      .filter(msg => msg.role === 'user')
      .forEach(msg => {
        items.push({
          type: 'message',
          timestamp: msg.createdAt,
          data: msg,
          key: msg.id,
        });
      });

    // Add structured chat event cards
    chatEvents.forEach(event => {
      items.push({
        type: 'event',
        timestamp: event.timestamp,
        data: event,
        key: event.id,
      });
    });

    // Add completed flows
    completedFlows.forEach(flow => {
      items.push({
        type: 'flow',
        timestamp: flow.completedAt || flow.startedAt,
        data: flow,
        key: flow.id,
      });
    });

    // Sort by timestamp
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, chatEvents, completedFlows]);

  // Auto-scroll to bottom when new items arrive or active flows change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [timeline, activeFlows]);

  const handleSend = () => {
    const input = inputRef.current;
    if (input && input.value.trim()) {
      onSendMessage(input.value.trim());
      input.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Paper
      p="md"
      h="100%"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--mantine-color-gray-0)',
      }}
    >
      <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
        {/* TOP: History (scrollable, flex-grow) */}
        <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ScrollArea h="100%" viewportRef={scrollRef}>
            <Stack gap="md" p="xs">
              {/* Planning Status Indicator - shown when generating plan */}
              {planningStatus && (
                <PlanningStatusIndicator status={planningStatus} />
              )}

              {/* Unified timeline - hide during planning for cleaner UX */}
              {!planningStatus && timeline.map((item) => {
                if (item.type === 'message') {
                  return (
                    <ChatMessage
                      key={item.key}
                      message={item.data}
                      isExpanded={effectiveExpandedId === item.data.id}
                      onToggleExpand={() => setExpandedMessageId(
                        expandedMessageId === item.data.id ? null : item.data.id
                      )}
                    />
                  );
                } else if (item.type === 'flow') {
                  return <CompletedFlowCard key={item.key} flow={item.data} />;
                } else {
                  return <ChatEventCard key={item.key} event={item.data} />;
                }
              })}

              {/* Pending Plan with TabbedPlanView */}
              {pendingPlan && (
                <Card p="md" withBorder shadow="sm" radius="md" bg="green.0" style={{ borderColor: 'var(--mantine-color-green-4)' }}>
                  <Stack gap="md">
                    <Badge color="green" variant="filled" size="lg">Plan Ready for Review</Badge>
                    <TabbedPlanView plan={pendingPlan.plan} isApproval={true} />
                    <Group>
                      <Button
                        variant="filled"
                        color="green"
                        onClick={() => onApprovePlan(pendingPlan.plan)}
                      >
                        Approve & Start
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              )}
            </Stack>
          </ScrollArea>
        </Box>

        {/* BOTTOM: Active Operations (only shown when there are active flows) */}
        {activeFlows.length > 0 && (
          <>
            <Divider my="sm" />
            <Box style={{ maxHeight: 220, overflow: 'auto' }} p="xs">
              <Group gap="xs" mb="xs">
                <Text size="xs" fw={600} c="blue">
                  ACTIVE
                </Text>
                <Badge size="xs" color="blue" variant="light">
                  {activeFlows.length}
                </Badge>
              </Group>
              <Stack gap="sm">
                {activeFlows.map(flow => (
                  <ActiveFlowCard key={flow.id} flow={flow} />
                ))}
              </Stack>
            </Box>
          </>
        )}

        {/* Input area */}
        <Box pt="sm">
          <Paper p="sm" withBorder radius="md" shadow="sm">
            <Group gap="xs">
              <TextInput
                ref={inputRef}
                placeholder={
                  readOnly
                    ? 'Read-only view - activate session to chat'
                    : sessionActive
                    ? 'Chat with Planning Agent...'
                    : 'Start a session first...'
                }
                style={{ flex: 1 }}
                disabled={!sessionActive || readOnly}
                onKeyDown={handleKeyDown}
                radius="md"
                size="md"
              />
              <ActionIcon
                size="xl"
                variant="filled"
                color="blue"
                radius="md"
                onClick={handleSend}
                disabled={!sessionActive || readOnly}
              >
                <IconSend size={20} />
              </ActionIcon>
            </Group>
          </Paper>
        </Box>
      </Stack>
    </Paper>
  );
}

// Convert our messages to ThreadMessageLike format for assistant-ui
function convertMessage(msg: StreamingMessage) {
  // Extract all text content and combine into a single string for simpler conversion
  const textContent = msg.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  // Base message properties
  const baseMessage = {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: textContent || ' ', // assistant-ui requires non-empty content
    createdAt: new Date(msg.createdAt),
  };

  // Status is only supported for assistant messages
  if (msg.role === 'assistant') {
    return {
      ...baseMessage,
      status: msg.status === 'streaming'
        ? { type: 'running' as const }
        : { type: 'complete' as const, reason: 'stop' as const },
    };
  }

  return baseMessage;
}

// Wrapper with AssistantUI runtime
export function AssistantChat(props: AssistantChatProps) {
  // Memoize isRunning to avoid recomputation
  const isRunning = useMemo(
    () => props.messages.some((m) => m.status === 'streaming'),
    [props.messages]
  );

  // Create external store runtime with proper adapter
  const runtime = useExternalStoreRuntime({
    messages: props.messages,
    convertMessage: (msg: StreamingMessage) => convertMessage(msg),
    isRunning,
    onNew: async (message) => {
      // Extract text content from the message
      const textContent = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');
      if (textContent) {
        props.onSendMessage(textContent);
      }
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread {...props} />
    </AssistantRuntimeProvider>
  );
}
