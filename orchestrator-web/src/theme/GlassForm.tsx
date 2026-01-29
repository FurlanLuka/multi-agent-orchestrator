/**
 * Glass-styled form component wrappers.
 *
 * These re-export Mantine form components with glass warmth styling baked in.
 * Use these instead of importing directly from '@mantine/core' in setup pages.
 */

import {
  TextInput as MantineTextInput,
  Textarea as MantineTextarea,
  MultiSelect as MantineMultiSelect,
  Select as MantineSelect,
  Switch as MantineSwitch,
  Checkbox as MantineCheckbox,
  SegmentedControl as MantineSegmentedControl,
  type TextInputProps,
  type TextareaProps,
  type MultiSelectProps,
  type SelectProps,
  type SwitchProps,
  type CheckboxProps,
  type SegmentedControlProps,
} from '@mantine/core';
import { forwardRef } from 'react';
import { glass, text, radii, disabled } from './tokens';

// ─── Shared input styles ──────────────────────────────────────────

const inputStyles = {
  input: {
    backgroundColor: glass.input.bg,
    backdropFilter: glass.input.blur,
    WebkitBackdropFilter: glass.input.blur,
    border: glass.input.border,
    transition: 'all 0.2s ease',
    '&:focus, &:focus-within': {
      backgroundColor: glass.input.bgFocus,
      borderColor: glass.input.borderFocusColor,
      boxShadow: glass.input.focusRing,
    },
    '&:disabled': {
      backgroundColor: disabled.bgSubtle,
      borderColor: disabled.border,
      color: disabled.text,
    },
    '&::placeholder': {
      color: text.placeholder,
    },
  },
  label: {
    color: text.label,
    fontWeight: 500,
  },
  description: {
    color: text.dimmed,
  },
};

// ─── TextInput ────────────────────────────────────────────────────

export const GlassTextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (props, ref) => (
    <MantineTextInput
      ref={ref}
      radius={radii.input}
      styles={inputStyles}
      {...props}
    />
  )
);
GlassTextInput.displayName = 'GlassTextInput';

// ─── Textarea ─────────────────────────────────────────────────────

export const GlassTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (props, ref) => (
    <MantineTextarea
      ref={ref}
      radius={radii.input}
      styles={inputStyles}
      {...props}
    />
  )
);
GlassTextarea.displayName = 'GlassTextarea';

// ─── MultiSelect ──────────────────────────────────────────────────

export const GlassMultiSelect = forwardRef<HTMLInputElement, MultiSelectProps>(
  (props, ref) => (
    <MantineMultiSelect
      ref={ref}
      radius={radii.input}
      styles={inputStyles}
      {...props}
    />
  )
);
GlassMultiSelect.displayName = 'GlassMultiSelect';

// ─── Select ───────────────────────────────────────────────────────

export const GlassSelect = forwardRef<HTMLInputElement, SelectProps>(
  (props, ref) => (
    <MantineSelect
      ref={ref}
      radius={radii.input}
      styles={inputStyles}
      {...props}
    />
  )
);
GlassSelect.displayName = 'GlassSelect';

// ─── Switch ───────────────────────────────────────────────────────

export const GlassSwitch = forwardRef<HTMLInputElement, SwitchProps>(
  (props, ref) => (
    <MantineSwitch
      ref={ref}
      styles={{
        label: { color: text.body },
        description: { color: text.dimmed },
      }}
      {...props}
    />
  )
);
GlassSwitch.displayName = 'GlassSwitch';

// ─── Checkbox ─────────────────────────────────────────────────────

export const GlassCheckbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (props, ref) => (
    <MantineCheckbox
      ref={ref}
      styles={{
        label: { color: text.body },
        description: { color: text.dimmed },
      }}
      {...props}
    />
  )
);
GlassCheckbox.displayName = 'GlassCheckbox';

// ─── SegmentedControl ─────────────────────────────────────────────

export function GlassSegmentedControl(props: SegmentedControlProps) {
  return (
    <MantineSegmentedControl
      radius={radii.input}
      styles={{
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.4)',
          border: '1.5px solid rgba(90, 70, 55, 0.08)',
        },
        label: {
          color: text.label,
          '&[data-active]': {
            color: text.heading,
          },
        },
      }}
      {...props}
    />
  );
}
