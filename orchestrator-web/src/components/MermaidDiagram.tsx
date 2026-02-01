import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { Card, Group, Loader } from '@mantine/core';

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
  onRenderError?: () => void;
  onRenderSuccess?: () => void;
}

// Sanitize Mermaid chart syntax to fix common LLM mistakes
function sanitizeChart(chart: string): string {
  let cleaned = chart;

  // Strip markdown fences if LLM wrapped them
  cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // AGGRESSIVE: Strip all edge labels completely (they break in JSON)
  // Matches -->|"anything"| or -->|anything| and replaces with -->
  cleaned = cleaned.replace(/-->\|[^|]*\|/g, '-->');

  // Remove subgraph blocks but keep inner content
  // This handles: subgraph id["Label"] ... end
  cleaned = cleaned.replace(/subgraph\s+\w+(?:\["[^"]*"\])?\s*\n?/gi, '');
  cleaned = cleaned.replace(/\bend\b(?:\s*\n)?/g, '');

  // Simplify problematic node IDs (replace underscores/hyphens with nothing)
  // But only in node ID positions, not in labels
  cleaned = cleaned.replace(/^(\s*)(\w+[-_]\w+)(\[)/gm, (_, indent, id, bracket) => {
    const simplified = id.replace(/[-_]/g, '');
    return `${indent}${simplified}${bracket}`;
  });

  // Fix arrow references to simplified IDs
  cleaned = cleaned.replace(/(\s)([\w]+[-_][\w]+)(\s*-->)/g, (_, before, id, arrow) => {
    const simplified = id.replace(/[-_]/g, '');
    return `${before}${simplified}${arrow}`;
  });
  cleaned = cleaned.replace(/(-->\s*)([\w]+[-_][\w]+)(\s|$|\n)/g, (_, arrow, id, after) => {
    const simplified = id.replace(/[-_]/g, '');
    return `${arrow}${simplified}${after}`;
  });

  return cleaned.trim();
}

export function MermaidDiagram({ chart, onRenderError, onRenderSuccess }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      onRenderSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to render diagram';
      setError(message);
      // Clear container to remove any Mermaid error SVGs that may have been injected
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      onRenderError?.();
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
      setLoading(false);
    }
  }, [chart, onRenderError, onRenderSuccess]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  // On error, render nothing (graceful degradation - parent will hide the section)
  if (error) {
    return null;
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
