import { createTheme } from '@mantine/core';
import { palettes, semantic, fonts, text, glass } from './tokens';

export const theme = createTheme({
  primaryColor: semantic.primary,
  colors: {
    ...palettes,
    // Map Mantine's default color names to our warm palettes
    green: palettes.sage,
    red: palettes.rose,
    yellow: palettes.honey,
    orange: palettes.peach,
    violet: palettes.lavender,
    grape: palettes.lavender,
    blue: palettes.lavender,
    cyan: palettes.sage,
    teal: palettes.sage,
    lime: palettes.sage,
    pink: palettes.rose,
    indigo: palettes.lavender,
  },

  defaultRadius: 'md',
  fontFamily: fonts.body,

  // Warm text colors instead of cool Mantine defaults
  black: text.heading,
  white: '#fffcfa',
  other: {
    dimmedColor: text.dimmed,
  },

  components: {
    Button: {
      defaultProps: { radius: 'xl' },
    },
    ActionIcon: { defaultProps: { radius: 'xl' } },
    TextInput: { defaultProps: { radius: 'md' } },
    Textarea: { defaultProps: { radius: 'md' } },
    MultiSelect: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'xl' } },
    Card: { defaultProps: { radius: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Alert: {
      defaultProps: { radius: 'md' },
      styles: () => ({
        root: {
          border: '1px solid',
        },
      }),
    },
    Notification: {
      defaultProps: { radius: 'md' },
    },
    Modal: {
      defaultProps: { radius: 'lg' },
      styles: () => ({
        content: {
          background: glass.modal.bg,
          backdropFilter: glass.modal.blur,
          WebkitBackdropFilter: glass.modal.blur,
          border: glass.modal.border,
          boxShadow: glass.modal.shadow,
        },
        overlay: {
          background: glass.overlay.bg,
          backdropFilter: glass.overlay.blur,
        },
      }),
    },
    Loader: {
      defaultProps: { color: 'peach' },
    },
    Progress: {
      defaultProps: { color: 'peach' },
    },
    Switch: {
      defaultProps: { color: 'peach' },
    },
    Checkbox: {
      defaultProps: { color: 'peach' },
    },
    Radio: {
      defaultProps: { color: 'peach' },
    },
  },
});
