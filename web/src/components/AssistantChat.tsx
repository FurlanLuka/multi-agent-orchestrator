import { useEffect, useRef } from 'react';
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
import { IconSend, IconRobot, IconUser, IconTool, IconBrain, IconClock } from '@tabler/icons-react';
import type { StreamingMessage, ContentBlock, Plan, PlanProposal } from '../types';

interface AssistantChatProps {
  messages: StreamingMessage[];
  pendingPlan: PlanProposal | null;
  onSendMessage: (message: string) => void;
  onApprovePlan: (plan: Plan) => void;
  sessionActive: boolean;
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

// Custom message content renderer for our content blocks
function MessageContent({ content }: { content: ContentBlock[] }) {
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
}

// Format timestamp
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Single message component
function ChatMessage({ message }: { message: StreamingMessage }) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';

  return (
    <Card
      p="md"
      withBorder
      shadow="sm"
      radius="md"
      style={{
        backgroundColor: isUser ? 'var(--mantine-color-blue-0)' : 'white',
        borderColor: isUser ? 'var(--mantine-color-blue-2)' : 'var(--mantine-color-gray-3)',
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
        </Group>
        <Group gap="xs">
          <IconClock size={12} color="var(--mantine-color-gray-5)" />
          <Text size="xs" c="dimmed">
            {formatTimestamp(message.createdAt)}
          </Text>
        </Group>
      </Group>

      <Divider mb="sm" color={isUser ? 'blue.1' : 'gray.2'} />

      {/* Message content */}
      <MessageContent content={message.content} />
    </Card>
  );
}

// Main chat component using external store
function ChatThread({
  messages,
  pendingPlan,
  onSendMessage,
  onApprovePlan,
  sessionActive,
}: AssistantChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

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
      <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
        <ScrollArea h="100%" viewportRef={scrollRef} style={{ flex: 1 }}>
          <Stack gap="md" p="xs">
            {messages.length === 0 ? (
              <Card p="xl" withBorder shadow="sm" radius="md">
                <Stack align="center" gap="sm">
                  <IconRobot size={48} color="var(--mantine-color-gray-5)" />
                  <Text c="dimmed" ta="center">
                    {sessionActive
                      ? 'Waiting for Planning Agent response...'
                      : 'Start a session to begin chatting with the Planning Agent'}
                  </Text>
                </Stack>
              </Card>
            ) : (
              messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
            )}

            {pendingPlan && (
              <Card p="md" withBorder shadow="sm" radius="md" bg="green.0" style={{ borderColor: 'var(--mantine-color-green-4)' }}>
                <Stack gap="sm">
                  <Group gap="xs">
                    <Badge color="green" variant="filled">Plan Ready</Badge>
                    <Text fw={600}>{pendingPlan.plan.feature}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">{pendingPlan.summary}</Text>
                  <Button
                    variant="filled"
                    color="green"
                    onClick={() => onApprovePlan(pendingPlan.plan)}
                  >
                    Approve & Start
                  </Button>
                </Stack>
              </Card>
            )}
          </Stack>
        </ScrollArea>

        {/* Input area */}
        <Paper p="sm" withBorder radius="md" shadow="sm">
          <Group gap="xs">
            <TextInput
              ref={inputRef}
              placeholder={
                sessionActive
                  ? 'Chat with Planning Agent...'
                  : 'Start a session first...'
              }
              style={{ flex: 1 }}
              disabled={!sessionActive}
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
              disabled={!sessionActive}
            >
              <IconSend size={20} />
            </ActionIcon>
          </Group>
        </Paper>
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

  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: textContent || ' ', // assistant-ui requires non-empty content
    createdAt: new Date(msg.createdAt),
    status: msg.status === 'streaming'
      ? { type: 'running' as const }
      : { type: 'complete' as const, reason: 'stop' as const },
  };
}

// Wrapper with AssistantUI runtime
export function AssistantChat(props: AssistantChatProps) {
  // Create external store runtime with proper adapter
  const runtime = useExternalStoreRuntime({
    messages: props.messages,
    convertMessage: (msg: StreamingMessage) => convertMessage(msg),
    isRunning: props.messages.some((m) => m.status === 'streaming'),
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
