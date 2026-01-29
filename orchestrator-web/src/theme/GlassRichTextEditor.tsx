/**
 * Glass-styled RichTextEditor wrapper.
 *
 * Provides consistent styling for the Mantine RichTextEditor with glass morphism.
 */

import { Box, Text } from '@mantine/core';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { glass, radii } from './tokens';

interface GlassRichTextEditorProps {
  label?: string;
  description?: string;
  placeholder?: string;
  content?: string;
  onChange?: (content: string) => void;
  minHeight?: number;
  editor?: Editor | null;
}

export function GlassRichTextEditor({
  label,
  description,
  placeholder = 'Start typing...',
  content = '',
  onChange,
  minHeight = 140,
  editor: externalEditor,
}: GlassRichTextEditorProps) {
  const internalEditor = useEditor({
    extensions: [
      StarterKit,
      Link,
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getText());
    },
  });

  const editor = externalEditor ?? internalEditor;

  return (
    <Box>
      {label && (
        <Text
          component="label"
          size="sm"
          fw={500}
          mb={4}
          style={{ display: 'block', color: 'var(--text-label)' }}
        >
          {label}
        </Text>
      )}
      {description && (
        <Text size="xs" mb={6} style={{ color: 'var(--text-dimmed)' }}>
          {description}
        </Text>
      )}
      <Box
        style={{
          borderRadius: radii.surface,
          background: glass.input.bg,
          backdropFilter: glass.input.blur,
          WebkitBackdropFilter: glass.input.blur,
          border: glass.input.border,
          overflow: 'hidden',
        }}
      >
        <RichTextEditor
          editor={editor}
          styles={{
            root: {
              border: 'none',
              background: 'transparent',
            },
            toolbar: {
              background: 'rgba(160, 130, 110, 0.06)',
              border: 'none',
              borderBottom: '1px solid rgba(160, 130, 110, 0.1)',
              borderRadius: 0,
              padding: '8px 12px',
            },
            controlsGroup: {
              background: 'rgba(255, 255, 255, 0.5)',
              border: '1px solid var(--border-input)',
              borderRadius: 8,
            },
            control: {
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              '&:hover': {
                background: 'var(--color-primary-active)',
                color: 'var(--color-primary-hover)',
              },
              '&[data-active]': {
                background: 'var(--color-primary-active)',
                color: 'var(--color-primary)',
              },
            },
            content: {
              background: 'transparent',
              border: 'none',
              '& .tiptap': {
                minHeight,
                padding: '12px 16px',
                color: 'var(--text-body)',
              },
              '& .tiptap p.is-editor-empty:first-child::before': {
                color: 'var(--text-placeholder)',
              },
            },
          }}
        >
          <RichTextEditor.Toolbar>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Code />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.CodeBlock />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>
          <RichTextEditor.Content />
        </RichTextEditor>
      </Box>
    </Box>
  );
}

// Hook to use with the GlassRichTextEditor when you need direct editor access
export function useGlassEditor(options?: {
  placeholder?: string;
  content?: string;
  onUpdate?: (text: string) => void;
}) {
  return useEditor({
    extensions: [
      StarterKit,
      Link,
      Placeholder.configure({
        placeholder: options?.placeholder ?? 'Start typing...',
      }),
    ],
    content: options?.content ?? '',
    onUpdate: ({ editor }) => {
      options?.onUpdate?.(editor.getText());
    },
  });
}
