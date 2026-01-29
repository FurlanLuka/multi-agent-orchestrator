import { useState, useCallback } from 'react';
import {
  Box,
  Stack,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Paper,
  ThemeIcon,
} from '@mantine/core';
import { IconKey, IconCheck, IconX } from '@tabler/icons-react';
import type { UserInputRequest } from '@orchy/types';

interface UserInputOverlayProps {
  request: UserInputRequest;
  onSubmit: (requestId: string, values: Record<string, string>) => void;
  onCancel?: () => void;
}

export function UserInputOverlay({ request, onSubmit, onCancel }: UserInputOverlayProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    // Initialize with empty strings
    const initial: Record<string, string> = {};
    for (const input of request.inputs) {
      initial[input.name] = '';
    }
    return initial;
  });

  const [currentIndex, setCurrentIndex] = useState(0);

  const currentInput = request.inputs[currentIndex];
  const isLastInput = currentIndex === request.inputs.length - 1;
  const isFirstInput = currentIndex === 0;

  const handleNext = useCallback(() => {
    if (isLastInput) {
      // Submit all values
      onSubmit(request.requestId, values);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [isLastInput, onSubmit, request.requestId, values]);

  const handleBack = useCallback(() => {
    if (!isFirstInput) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [isFirstInput]);

  const handleValueChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  const canProceed = !currentInput?.required || values[currentInput?.name]?.trim();

  return (
    <Box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        borderRadius: 'inherit',
        padding: '16px',
      }}
    >
      <Paper
        p="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          border: '1px solid var(--mantine-color-dark-4)',
          maxWidth: 400,
          width: '100%',
        }}
      >
        <Stack gap="md">
          {/* Header */}
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" color="blue" variant="light">
              <IconKey size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600} c="white" size="md">
                Input Required
              </Text>
              <Text size="xs" c="dimmed">
                {request.project} - Step {currentIndex + 1} of {request.inputs.length}
              </Text>
            </div>
          </Group>

          {/* Current input field */}
          {currentInput && (
            <Stack gap="xs">
              <Text size="sm" fw={500} c="white">
                {currentInput.label}
                {currentInput.required && <Text span c="red" ml={4}>*</Text>}
              </Text>
              {currentInput.description && (
                <Text size="xs" c="dimmed">
                  {currentInput.description}
                </Text>
              )}
              {currentInput.sensitive ? (
                <PasswordInput
                  value={values[currentInput.name] || ''}
                  onChange={(e) => handleValueChange(currentInput.name, e.target.value)}
                  placeholder={`Enter ${currentInput.label.toLowerCase()}`}
                  autoFocus
                  styles={{
                    input: {
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      borderColor: 'var(--mantine-color-dark-4)',
                      color: 'white',
                    },
                  }}
                />
              ) : (
                <TextInput
                  value={values[currentInput.name] || ''}
                  onChange={(e) => handleValueChange(currentInput.name, e.target.value)}
                  placeholder={`Enter ${currentInput.label.toLowerCase()}`}
                  autoFocus
                  styles={{
                    input: {
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      borderColor: 'var(--mantine-color-dark-4)',
                      color: 'white',
                    },
                  }}
                />
              )}
            </Stack>
          )}

          {/* Navigation buttons */}
          <Group justify="space-between" mt="sm">
            <Group gap="xs">
              {!isFirstInput && (
                <Button
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={handleBack}
                >
                  Back
                </Button>
              )}
              {onCancel && (
                <Button
                  variant="subtle"
                  color="red"
                  size="sm"
                  leftSection={<IconX size={14} />}
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
            </Group>
            <Button
              color="blue"
              size="sm"
              leftSection={isLastInput ? <IconCheck size={14} /> : undefined}
              onClick={handleNext}
              disabled={!canProceed}
            >
              {isLastInput ? 'Submit' : 'Next'}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Box>
  );
}
