import { useState, memo } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Badge,
  Anchor,
  ThemeIcon,
  Loader,
} from '@mantine/core';
import { IconAlertCircle, IconExternalLink, IconCheck } from '@tabler/icons-react';
import type { TaskState, UserActionDefinition } from '@aio/types';

interface UserActionCardProps {
  task: TaskState;
  userAction: UserActionDefinition;
  onSubmit: (taskIndex: number, values: Record<string, string>) => void;
}

function UserActionCardInner({ task, userAction, onSubmit }: UserActionCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    // Validate required fields
    const newErrors: Record<string, string> = {};
    for (const input of userAction.inputs) {
      if (input.required && !values[input.name]?.trim()) {
        newErrors[input.name] = 'This field is required';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    onSubmit(task.taskIndex, values);
    // Note: parent will handle the response and this component will be replaced
  };

  // Check if all required fields have values
  const allRequiredFilled = userAction.inputs
    .filter(i => i.required)
    .every(i => values[i.name]?.trim());

  return (
    <Card
      withBorder
      shadow="md"
      radius={0}
      p="lg"
      style={{
        backgroundColor: 'var(--mantine-color-yellow-0)',
        borderColor: 'var(--mantine-color-yellow-4)',
      }}
    >
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon color="yellow" size="lg" variant="light">
              <IconAlertCircle size={20} />
            </ThemeIcon>
            <div>
              <Badge color="yellow" size="lg" mb={4}>
                Action Required
              </Badge>
              <Text fw={600} size="lg">{task.name}</Text>
            </div>
          </Group>
          <Badge color="gray" variant="light">{task.project}</Badge>
        </Group>

        {/* Prompt / Instructions */}
        <Text c="dimmed" size="sm">
          {userAction.prompt}
        </Text>

        {/* Input fields */}
        <Stack gap="sm">
          {userAction.inputs.map(input => (
            <div key={input.name}>
              {input.sensitive ? (
                <PasswordInput
                  label={input.label}
                  description={input.description}
                  placeholder={input.placeholder}
                  required={input.required}
                  value={values[input.name] || ''}
                  onChange={e => handleChange(input.name, e.target.value)}
                  error={errors[input.name]}
                  rightSectionWidth={input.helpUrl ? 40 : undefined}
                  rightSection={input.helpUrl && (
                    <Anchor href={input.helpUrl} target="_blank" c="dimmed">
                      <IconExternalLink size={16} />
                    </Anchor>
                  )}
                />
              ) : (
                <TextInput
                  label={input.label}
                  description={input.description}
                  placeholder={input.placeholder}
                  required={input.required}
                  value={values[input.name] || ''}
                  onChange={e => handleChange(input.name, e.target.value)}
                  error={errors[input.name]}
                  rightSectionWidth={input.helpUrl ? 40 : undefined}
                  rightSection={input.helpUrl && (
                    <Anchor href={input.helpUrl} target="_blank" c="dimmed">
                      <IconExternalLink size={16} />
                    </Anchor>
                  )}
                />
              )}
            </div>
          ))}
        </Stack>

        {/* Submit button */}
        <Button
          color="green"
          size="md"
          onClick={handleSubmit}
          disabled={!allRequiredFilled || isSubmitting}
          leftSection={isSubmitting ? <Loader size={16} color="white" /> : <IconCheck size={16} />}
        >
          {isSubmitting ? 'Saving...' : 'Save & Continue'}
        </Button>
      </Stack>
    </Card>
  );
}

export const UserActionCard = memo(UserActionCardInner);
