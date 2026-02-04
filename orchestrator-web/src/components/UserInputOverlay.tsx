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
import { IconKey, IconCheck, IconX, IconAlertCircle, IconBrandGithub, IconShield } from '@tabler/icons-react';
import type { UserInputRequest } from '@orchy/types';

interface UserInputOverlayProps {
  request: UserInputRequest;
  onSubmit: (requestId: string, values: Record<string, string>) => void;
  onCancel?: () => void;
}

export function UserInputOverlay({ request, onSubmit, onCancel }: UserInputOverlayProps) {
  // Check if this is a confirmation dialog
  const isConfirmation = request.inputs.length > 0 && request.inputs[0].type === 'confirmation';
  const confirmationInput = isConfirmation ? request.inputs[0] : null;

  // Check if ALL inputs are GitHub secrets (for special styling)
  const allGitHubSecrets = request.inputs.length > 0 && request.inputs.every(input => input.type === 'github_secret');
  const isGitHubSecret = request.inputs.length > 0 && request.inputs[0].type === 'github_secret';
  const githubSecretInput = isGitHubSecret ? request.inputs[0] : null;

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (isConfirmation) {
      return {}; // No values needed for confirmation
    }
    // Initialize with empty strings for regular inputs
    const initial: Record<string, string> = {};
    for (const input of request.inputs) {
      if (input.name) {
        initial[input.name] = '';
      }
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

  const handleConfirm = useCallback(() => {
    onSubmit(request.requestId, { confirmed: 'true' });
  }, [onSubmit, request.requestId]);

  const handleDeny = useCallback(() => {
    onSubmit(request.requestId, { confirmed: 'false' });
  }, [onSubmit, request.requestId]);

  // For regular inputs, check if we can proceed
  const canProceed = !currentInput?.required || (currentInput?.name && values[currentInput.name]?.trim());

  // Render confirmation dialog
  if (isConfirmation && confirmationInput) {
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
            maxWidth: 500,
            width: '100%',
          }}
        >
          <Stack gap="md">
            {/* Header */}
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="yellow" variant="light">
                <IconAlertCircle size={20} />
              </ThemeIcon>
              <div>
                <Text fw={600} c="white" size="md">
                  {confirmationInput.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {request.project}
                </Text>
              </div>
            </Group>

            {/* Description with markdown-like formatting */}
            {confirmationInput.description && (
              <Box
                style={{
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  borderRadius: '8px',
                  padding: '12px',
                  border: '1px solid var(--mantine-color-dark-4)',
                }}
              >
                <Text
                  size="sm"
                  c="gray.3"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {confirmationInput.description}
                </Text>
              </Box>
            )}

            {/* Confirm / Cancel buttons */}
            <Group justify="flex-end" mt="sm">
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                leftSection={<IconX size={14} />}
                onClick={handleDeny}
              >
                Cancel
              </Button>
              <Button
                color="blue"
                size="sm"
                leftSection={<IconCheck size={14} />}
                onClick={handleConfirm}
              >
                Confirm
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Box>
    );
  }

  // Render GitHub secret dialog (with pagination for multiple secrets)
  if (allGitHubSecrets && currentInput && currentInput.type === 'github_secret') {
    const secretName = currentInput.name || 'SECRET';
    const repo = currentInput.repo || 'owner/repo';
    const command = `gh secret set ${secretName} --repo ${repo}`;
    const canProceedSecret = values[secretName]?.trim();

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
            maxWidth: 500,
            width: '100%',
          }}
        >
          <Stack gap="md">
            {/* Header */}
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="dark" variant="light">
                <IconBrandGithub size={20} />
              </ThemeIcon>
              <div>
                <Text fw={600} c="white" size="md">
                  Set GitHub Secret
                </Text>
                <Text size="xs" c="dimmed">
                  {request.project} - Secret {currentIndex + 1} of {request.inputs.length}
                </Text>
              </div>
            </Group>

            {/* Command preview */}
            <Box
              style={{
                backgroundColor: 'var(--mantine-color-dark-8)',
                borderRadius: '8px',
                padding: '12px',
                border: '1px solid var(--mantine-color-dark-5)',
                fontFamily: 'monospace',
              }}
            >
              <Text size="sm" c="gray.4">
                {command}
              </Text>
            </Box>

            {/* Security notice */}
            <Group gap="xs" align="flex-start">
              <ThemeIcon size="sm" radius="md" color="green" variant="light">
                <IconShield size={14} />
              </ThemeIcon>
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                The secret value will be securely transmitted to GitHub. It will not be stored locally or logged.
              </Text>
            </Group>

            {/* Description */}
            {currentInput.description && (
              <Text size="sm" c="gray.3">
                {currentInput.description}
              </Text>
            )}

            {/* Secret input */}
            <Stack gap="xs">
              <Text size="sm" fw={500} c="white">
                {currentInput.label}
                <Text span c="red" ml={4}>*</Text>
              </Text>
              <PasswordInput
                value={values[secretName] || ''}
                onChange={(e) => handleValueChange(secretName, e.target.value)}
                placeholder="Enter secret value"
                autoFocus
                styles={{
                  input: {
                    backgroundColor: 'var(--mantine-color-dark-6)',
                    borderColor: 'var(--mantine-color-dark-4)',
                    color: 'white',
                  },
                }}
              />
            </Stack>

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
                    color="gray"
                    size="sm"
                    leftSection={<IconX size={14} />}
                    onClick={onCancel}
                  >
                    Cancel
                  </Button>
                )}
              </Group>
              <Button
                color="dark"
                size="sm"
                leftSection={isLastInput ? <IconBrandGithub size={14} /> : undefined}
                onClick={handleNext}
                disabled={!canProceedSecret}
              >
                {isLastInput ? `Set ${request.inputs.length === 1 ? 'Secret' : 'Secrets'}` : 'Next'}
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Box>
    );
  }

  // Render regular input dialog
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
          {currentInput && currentInput.name && (
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
                  onChange={(e) => handleValueChange(currentInput.name!, e.target.value)}
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
                  onChange={(e) => handleValueChange(currentInput.name!, e.target.value)}
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
