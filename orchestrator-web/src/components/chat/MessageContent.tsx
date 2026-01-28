import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Stack,
  Box,
  Accordion,
  Code,
  Text,
  Badge,
  Group,
} from '@mantine/core';
import { IconTool, IconBrain } from '@tabler/icons-react';
import type { ContentBlock } from '@aio/types';

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

// Custom message content renderer for content blocks
export const MessageContent = memo(function MessageContent({ content }: { content: ContentBlock[] }) {
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
