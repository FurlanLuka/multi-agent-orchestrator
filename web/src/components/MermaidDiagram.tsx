import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Card, Text, Button, Group } from '@mantine/core';

// Initialize mermaid with theme matching Mantine
mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'inherit',
  logLevel: 'fatal', // Suppress console spam
});

interface Props {
  chart: string;
}

// Escape edge labels containing special characters like [] that Mermaid misinterprets
function sanitizeChart(chart: string): string {
  // Match edge labels: |label| and wrap in quotes if they contain special chars
  return chart.replace(/\|([^|"]+)\|/g, (match, label) => {
    // If label contains [], <>, or other special chars, quote it
    if (/[\[\]<>{}()]/.test(label)) {
      return `|"${label}"|`;
    }
    return match;
  });
}

export function MermaidDiagram({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;

      // Suppress mermaid's console spam during render
      const originalError = console.error;
      const originalWarn = console.warn;
      console.error = () => {};
      console.warn = () => {};

      try {
        const id = `mermaid-${Date.now()}`;
        const sanitized = sanitizeChart(chart);
        const { svg } = await mermaid.render(id, sanitized);
        containerRef.current.innerHTML = svg;
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to render diagram';
        // Detect dynamic import failures (stale chunks after rebuild)
        if (message.includes('dynamically imported module') || message.includes('Failed to fetch')) {
          setError('Module loading failed - try refreshing the page');
        } else {
          setError(message);
        }
      } finally {
        console.error = originalError;
        console.warn = originalWarn;
      }
    };

    renderDiagram();
  }, [chart]);

  if (error) {
    const isModuleError = error.includes('Module loading failed') || error.includes('refresh');
    return (
      <Card p="xs" bg="red.0" withBorder style={{ borderColor: 'var(--mantine-color-red-3)' }}>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="xs" c="red.7">Diagram error: {error}</Text>
            {!isModuleError && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{chart}</Text>
            )}
          </div>
          {isModuleError && (
            <Button size="xs" variant="light" color="red" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          )}
        </Group>
      </Card>
    );
  }

  return (
    <Card p="sm" bg="gray.0" withBorder radius="md" style={{ overflow: 'auto' }}>
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />
    </Card>
  );
}
