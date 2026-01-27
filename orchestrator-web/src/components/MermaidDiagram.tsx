import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { Card, Text, Button, Group, Loader } from '@mantine/core';

// Track initialization state
let mermaidInitialized = false;

// Initialize mermaid with theme matching Mantine
async function initMermaid() {
  if (mermaidInitialized) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    fontFamily: 'inherit',
    logLevel: 'fatal', // Suppress console spam
    flowchart: {
      useMaxWidth: true,        // Scale to container width
      htmlLabels: true,         // Enable HTML in labels for wrapping
      wrappingWidth: 200,       // Wrap text at this width
      nodeSpacing: 50,          // Space between nodes
      rankSpacing: 50,          // Space between ranks
    },
  });

  mermaidInitialized = true;
}

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
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const renderDiagram = useCallback(async () => {
    if (!containerRef.current) return;

    setLoading(true);

    // Suppress mermaid's console spam during render
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = () => {};
    console.warn = () => {};

    try {
      await initMermaid();

      const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const sanitized = sanitizeChart(chart);
      const { svg } = await mermaid.render(id, sanitized);
      containerRef.current.innerHTML = svg;

      // Make rendered SVG responsive - remove fixed dimensions, use viewBox for scaling
      const svgElement = containerRef.current.querySelector('svg');
      if (svgElement) {
        const width = svgElement.getAttribute('width');
        const height = svgElement.getAttribute('height');
        if (width && height) {
          svgElement.removeAttribute('width');
          svgElement.removeAttribute('height');
          svgElement.style.maxWidth = '100%';
          svgElement.style.height = 'auto';
          // Preserve aspect ratio via viewBox if not already set
          if (!svgElement.getAttribute('viewBox')) {
            svgElement.setAttribute('viewBox', `0 0 ${parseFloat(width)} ${parseFloat(height)}`);
          }
        }
      }

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to render diagram';
      // Detect dynamic import failures (stale chunks after rebuild)
      if (message.includes('dynamically imported module') || message.includes('Failed to fetch') || message.includes('Loading chunk')) {
        setError('Module loading failed - try refreshing the page');
      } else {
        setError(message);
      }
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
      setLoading(false);
    }
  }, [chart]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram, retryCount]);

  const handleRetry = () => {
    setError(null);
    setRetryCount(c => c + 1);
  };

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
          <Group gap="xs">
            <Button size="xs" variant="light" color="red" onClick={handleRetry}>
              Retry
            </Button>
            {isModuleError && (
              <Button size="xs" variant="light" color="red" onClick={() => window.location.reload()}>
                Refresh
              </Button>
            )}
          </Group>
        </Group>
      </Card>
    );
  }

  return (
    <Card p="sm" bg="gray.0" withBorder radius="md" style={{ overflow: 'auto' }}>
      {loading && (
        <Group justify="center" p="md">
          <Loader size="sm" />
        </Group>
      )}
      <div ref={containerRef} style={{ display: loading ? 'none' : 'flex', justifyContent: 'center' }} />
    </Card>
  );
}
