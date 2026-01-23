import { useState, useRef, useEffect } from 'react';
import {
  Paper,
  TextInput,
  Button,
  ScrollArea,
  Stack,
  Text,
  Group,
  Badge,
  Card,
  ActionIcon,
} from '@mantine/core';
import { IconSend, IconRobot, IconUser, IconInfoCircle } from '@tabler/icons-react';
import type { ChatMessage, PlanProposal, Plan } from '../types';
import { MarkdownMessage } from './MarkdownMessage';

interface PlanningChatProps {
  chatHistory: ChatMessage[];
  pendingPlan: PlanProposal | null;
  onSendMessage: (message: string) => void;
  onApprovePlan: (plan: Plan) => void;
  sessionActive: boolean;
}

export function PlanningChat({
  chatHistory,
  pendingPlan,
  onSendMessage,
  onApprovePlan,
  sessionActive,
}: PlanningChatProps) {
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chatHistory]);

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getMessageIcon = (from: string) => {
    switch (from) {
      case 'user':
        return <IconUser size={16} />;
      case 'planning':
        return <IconRobot size={16} />;
      default:
        return <IconInfoCircle size={16} />;
    }
  };

  const getMessageColor = (from: string) => {
    switch (from) {
      case 'user':
        return 'blue';
      case 'planning':
        return 'green';
      default:
        return 'gray';
    }
  };

  return (
    <Paper shadow="sm" p="md" h="100%">
      <Stack h="100%" gap="md">
        <Group justify="space-between">
          <Text fw={600} size="lg">Planning Agent Chat</Text>
          <Badge color={sessionActive ? 'green' : 'gray'}>
            {sessionActive ? 'Session Active' : 'No Session'}
          </Badge>
        </Group>

        <ScrollArea h="calc(100% - 140px)" viewportRef={scrollRef}>
          <Stack gap="xs">
            {chatHistory.length === 0 && (
              <Text c="dimmed" ta="center" py="xl">
                Start a conversation with the Planning Agent to create an implementation plan.
              </Text>
            )}

            {chatHistory.map((msg, i) => (
              <Card key={i} p="xs" withBorder>
                <Group gap="xs" mb={4}>
                  {getMessageIcon(msg.from)}
                  <Badge size="xs" color={getMessageColor(msg.from)}>
                    {msg.from}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </Text>
                </Group>
                <MarkdownMessage content={msg.message} />
              </Card>
            ))}

            {pendingPlan && (
              <Card p="md" withBorder bg="green.0">
                <Stack gap="sm">
                  <Text fw={600}>Plan Proposal</Text>
                  <Text size="sm">{pendingPlan.summary}</Text>
                  <Text size="xs" c="dimmed">
                    {pendingPlan.plan.tasks.length} tasks across{' '}
                    {[...new Set(pendingPlan.plan.tasks.map(t => t.project))].length} projects
                  </Text>
                  <Button
                    color="green"
                    size="sm"
                    onClick={() => onApprovePlan(pendingPlan.plan)}
                  >
                    Approve & Start Execution
                  </Button>
                </Stack>
              </Card>
            )}
          </Stack>
        </ScrollArea>

        <Group>
          <TextInput
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
          />
          <ActionIcon size="lg" variant="filled" onClick={handleSend}>
            <IconSend size={18} />
          </ActionIcon>
        </Group>
      </Stack>
    </Paper>
  );
}
