import type { MantineColorsTuple } from '@mantine/core';

// ─── Color Palettes ───────────────────────────────────────────────
// Each is a 10-shade Mantine-compatible tuple (0 = lightest, 9 = darkest)

export const palettes = {
  peach: [
    '#fff5f2', '#ffe8e0', '#ffd4c4', '#ffbda6', '#ffa284',
    '#f58565', '#e06b4a', '#c4553a', '#a3432e', '#833524',
  ] as MantineColorsTuple,

  sage: [
    '#f2f8f2', '#dff0df', '#c4e3c4', '#a3d4a3', '#7dc07d',
    '#5ea85e', '#4a9149', '#3a7a39', '#2d632d', '#224d22',
  ] as MantineColorsTuple,

  rose: [
    '#fef2f2', '#fde2e2', '#fbc8c8', '#f5a3a3', '#ee7d7d',
    '#e45c5c', '#d14343', '#b53333', '#962828', '#7a2020',
  ] as MantineColorsTuple,

  honey: [
    '#fef8ef', '#fdefd8', '#fae0b4', '#f5cc85', '#efb65c',
    '#e09e3a', '#c98a2e', '#a87225', '#885c1e', '#6b4818',
  ] as MantineColorsTuple,

  lavender: [
    '#f5f3fc', '#ebe5f8', '#d8cdf2', '#c2b1ea', '#ab94e0',
    '#9478d4', '#7e5fc4', '#6849a8', '#54398c', '#412c70',
  ] as MantineColorsTuple,
};

// ─── Semantic Color Mapping ───────────────────────────────────────

export const semantic = {
  primary: 'peach',
  success: 'sage',
  error: 'rose',
  warning: 'honey',
  info: 'lavender',
} as const;

// ─── Glass Properties ─────────────────────────────────────────────

export const glass = {
  // Card — the default frosted surface
  card: {
    bg: 'rgba(255, 255, 255, 0.72)',
    bgHover: 'rgba(255, 255, 255, 0.85)',
    blur: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.6)',
    shadow: '0 4px 24px rgba(160, 130, 110, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
    shadowHover: '0 8px 40px rgba(160, 130, 110, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
  },

  // Surface — subtler, for sections/panels (warm border for visibility)
  surface: {
    bg: 'rgba(250, 245, 242, 0.6)',
    blur: 'blur(16px)',
    border: '1px solid rgba(160, 130, 110, 0.1)',
    shadow: 'none',
  },

  // Bar — top/bottom floating bars
  bar: {
    bg: 'rgba(255, 255, 255, 0.72)',
    blur: 'blur(20px)',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    shadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
  },

  // Overlay — modal backdrop, permission overlay
  overlay: {
    bg: 'rgba(45, 42, 39, 0.4)',
    blur: 'blur(4px)',
  },

  // Modal — dialog content (clean white)
  modal: {
    bg: 'rgba(255, 255, 255, 0.98)',
    blur: 'blur(24px)',
    border: '1px solid rgba(255, 255, 255, 0.8)',
    shadow: '0 8px 40px rgba(160, 130, 110, 0.12)',
  },

  // Surface inside modal — needs more contrast
  surfaceOnModal: {
    bg: 'rgba(255, 255, 255, 0.65)',
    border: '1px solid rgba(160, 130, 110, 0.1)',
  },

  // Input — form fields
  input: {
    bg: 'rgba(255, 255, 255, 0.6)',
    bgFocus: 'rgba(255, 255, 255, 0.88)',
    blur: 'blur(10px)',
    border: '1.5px solid rgba(90, 70, 55, 0.12)',
    borderFocusColor: 'rgba(245, 133, 101, 0.5)',
    focusRing: '0 0 0 4px rgba(245, 133, 101, 0.08)',
  },

  // Dashed — for "add new" cards
  dashed: {
    bg: 'rgba(255, 255, 255, 0.35)',
    bgHover: 'rgba(255, 245, 242, 0.5)',
    blur: 'blur(10px)',
    border: '2px dashed rgba(0, 0, 0, 0.08)',
    borderHover: '2px dashed rgba(245, 133, 101, 0.4)',
  },
} as const;

// ─── Page Background ──────────────────────────────────────────────

export const pageBg = {
  gradient: 'linear-gradient(145deg, #fef9f7 0%, #f5f0ed 40%, #f0ebe8 100%)',
} as const;

// ─── Typography ───────────────────────────────────────────────────

export const fonts = {
  body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

// ─── Text Colors ──────────────────────────────────────────────────
// Warm brown-grays instead of cool Mantine defaults
// Values match CSS variables in index.css

export const text = {
  heading: 'var(--text-heading)',
  body: 'var(--text-body)',
  label: 'var(--text-label)',
  dimmed: 'var(--text-dimmed)',
  placeholder: 'var(--text-placeholder)',
  muted: 'var(--text-muted)',
  link: 'var(--text-link)',
  onDark: 'var(--text-on-dark)',
} as const;

// Raw hex values for cases where CSS variables can't be used
export const textRaw = {
  heading: '#3a3230',
  body: '#4a4340',
  label: '#5c504a',
  dimmed: '#9a8e86',
  placeholder: '#b8a8a0',
  muted: '#b09080',
  link: '#e06b4a',
  onDark: '#fffcfa',
} as const;

// ─── Radii ────────────────────────────────────────────────────────

export const radii = {
  card: 20,
  surface: 16,
  input: 12,
  button: 24,
  badge: 20,
  modal: 20,
} as const;

// ─── Transitions ──────────────────────────────────────────────────

export const transitions = {
  default: 'all 0.2s ease',
  lift: 'all 0.3s ease',
} as const;

// ─── Disabled State ──────────────────────────────────────────────
// Values match CSS variables in index.css

export const disabled = {
  bg: 'var(--disabled-bg)',
  bgSubtle: 'var(--disabled-bg-subtle)',
  text: 'var(--disabled-text)',
  border: 'var(--disabled-border)',
} as const;

export const disabledRaw = {
  bg: 'rgba(180, 170, 165, 0.3)',
  bgSubtle: 'rgba(180, 170, 165, 0.15)',
  text: '#a09590',
  border: 'rgba(160, 150, 145, 0.2)',
} as const;
