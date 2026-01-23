import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Code, Text } from '@mantine/core';

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Code blocks with syntax highlighting
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;

          if (isInline) {
            return (
              <Code {...props}>
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
                margin: '8px 0',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          );
        },
        // Paragraphs
        p({ children }) {
          return (
            <Text size="sm" style={{ marginBottom: '8px' }}>
              {children}
            </Text>
          );
        },
        // Lists
        ul({ children }) {
          return (
            <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
              {children}
            </ul>
          );
        },
        ol({ children }) {
          return (
            <ol style={{ margin: '4px 0', paddingLeft: '20px' }}>
              {children}
            </ol>
          );
        },
        li({ children }) {
          return (
            <li style={{ marginBottom: '2px' }}>
              <Text size="sm" component="span">{children}</Text>
            </li>
          );
        },
        // Headers
        h1({ children }) {
          return <Text size="lg" fw={700} mt="sm" mb="xs">{children}</Text>;
        },
        h2({ children }) {
          return <Text size="md" fw={600} mt="sm" mb="xs">{children}</Text>;
        },
        h3({ children }) {
          return <Text size="sm" fw={600} mt="xs" mb="xs">{children}</Text>;
        },
        // Strong and emphasis
        strong({ children }) {
          return <Text component="span" fw={600}>{children}</Text>;
        },
        em({ children }) {
          return <Text component="span" fs="italic">{children}</Text>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
