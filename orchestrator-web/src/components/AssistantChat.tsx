import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import {
  Paper,
  ScrollArea,
  Group,
  Text,
  Badge,
  Stack,
  Divider,
  Box,
} from '@mantine/core';
import type { StreamingMessage, RequestFlow } from '@aio/types';
import { useOrchestrator } from '../context/OrchestratorContext';
import { ChatMessage } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import { PermissionOverlay } from './overlay/PermissionOverlay';
import { ActiveFlowCard } from './ActiveFlowCard';
import { CompletedFlowCard } from './CompletedFlowCard';
import { PlanApprovalCard } from './PlanApprovalCard';

// Timeline item type for unified rendering
type TimelineItem =
  | { type: 'message'; timestamp: number; data: StreamingMessage; key: string }
  | { type: 'flow'; timestamp: number; data: RequestFlow; key: string };

// Main chat component using external store
function ChatThread() {
  const {
    streamingMessages: messages,
    planningStatus,
    activeFlows,
    completedFlows,
    sendChat,
    session,
    permissionPrompt,
    respondToPermission,
    planningQuestion,
    answerPlanningQuestion,
    pendingPlanApproval,
    approvePlanViaChat,
    refinePlan,
  } = useOrchestrator();

  const sessionActive = !!session;
  const executionStarted = !!session?.plan;

  // Check if this permission is for the planner
  const isPlannerPermission = permissionPrompt?.project === 'planner';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  // Check if any message is currently streaming - memoized
  const hasStreamingMessage = useMemo(
    () => messages.some(m => m.status === 'streaming'),
    [messages]
  );

  // Derive effective expanded state - auto-collapse during streaming
  const effectiveExpandedId = hasStreamingMessage ? null : expandedMessageId;

  // Create unified timeline: user messages + completed flows
  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Only user messages in timeline
    messages
      .filter(msg => msg.role === 'user')
      .forEach(msg => {
        items.push({
          type: 'message',
          timestamp: msg.createdAt,
          data: msg,
          key: msg.id,
        });
      });

    // Add completed flows
    completedFlows.forEach(flow => {
      items.push({
        type: 'flow',
        timestamp: flow.completedAt || flow.startedAt,
        data: flow,
        key: flow.id,
      });
    });

    // Sort by timestamp
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, completedFlows]);

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [timeline, activeFlows, pendingPlanApproval]);

  // Handle send - routes to refinePlan or sendChat
  const handleSend = useCallback((message: string) => {
    if (pendingPlanApproval && refinePlan) {
      refinePlan(message);
    } else {
      sendChat(message);
    }
  }, [pendingPlanApproval, refinePlan, sendChat]);

  // Chat enabled logic
  const isAwaitingApproval = planningStatus?.phase === 'awaiting_approval' || !!pendingPlanApproval;
  const chatEnabled = sessionActive && !executionStarted && (!planningStatus || isAwaitingApproval || planningStatus.phase === 'complete');

  // Input placeholder
  const placeholder = executionStarted
    ? 'Execution in progress...'
    : pendingPlanApproval
    ? 'Type feedback to refine the plan...'
    : sessionActive
    ? 'Chat with Planning Agent...'
    : 'Start a session first...';

  return (
    <Box style={{ position: 'relative', height: '100%' }}>
      <Paper
        p="md"
        h="100%"
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--mantine-color-gray-0)',
        }}
      >
        <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
          {/* TOP: History (scrollable, flex-grow) */}
          <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ScrollArea h="100%" viewportRef={scrollRef}>
              <Stack gap="md" p="xs">
                {/* Unified timeline */}
                {timeline.map((item) => {
                  if (item.type === 'message') {
                    return (
                      <ChatMessage
                        key={item.key}
                        message={item.data}
                        isExpanded={effectiveExpandedId === item.data.id}
                        onToggleExpand={() => setExpandedMessageId(
                          expandedMessageId === item.data.id ? null : item.data.id
                        )}
                      />
                    );
                  } else {
                    return <CompletedFlowCard key={item.key} flow={item.data} />;
                  }
                })}

                {/* Interactive Plan Approval */}
                {pendingPlanApproval && approvePlanViaChat && pendingPlanApproval.plan?.tasks && (
                  <PlanApprovalCard
                    plan={pendingPlanApproval.plan}
                    onApprove={approvePlanViaChat}
                  />
                )}
              </Stack>
            </ScrollArea>
          </Box>

          {/* BOTTOM: Active Operations */}
          {activeFlows.length > 0 && (
            <>
              <Divider my="sm" />
              <Box p="xs">
                <Group gap="xs" mb="xs">
                  <Text size="xs" fw={600} c="blue">
                    ACTIVE
                  </Text>
                  <Badge size="xs" color="blue" variant="light">
                    {activeFlows.length}
                  </Badge>
                </Group>
                <Stack gap="sm">
                  {activeFlows.map(flow => (
                    <ActiveFlowCard
                      key={flow.id}
                      flow={flow}
                      pendingQuestion={flow.type === 'planning' ? planningQuestion : null}
                      onAnswerQuestion={answerPlanningQuestion}
                      planningStatus={flow.type === 'planning' ? planningStatus : null}
                    />
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Input area */}
          <Box pt="sm">
            <ChatInput
              placeholder={placeholder}
              disabled={!chatEnabled}
              actionColor={pendingPlanApproval ? 'orange' : 'blue'}
              onSend={handleSend}
            />
          </Box>
        </Stack>
      </Paper>

      {/* Planner permission overlay */}
      {isPlannerPermission && permissionPrompt && (
        <PermissionOverlay
          toolName={permissionPrompt.toolName}
          toolInput={permissionPrompt.toolInput}
          onResponse={respondToPermission}
          title="Planner Permission"
          compact={false}
        />
      )}
    </Box>
  );
}

// Convert our messages to ThreadMessageLike format for assistant-ui
function convertMessage(msg: StreamingMessage) {
  const textContent = msg.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const baseMessage = {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: textContent || ' ',
    createdAt: new Date(msg.createdAt),
  };

  if (msg.role === 'assistant') {
    return {
      ...baseMessage,
      status: msg.status === 'streaming'
        ? { type: 'running' as const }
        : { type: 'complete' as const, reason: 'stop' as const },
    };
  }

  return baseMessage;
}

// Wrapper with AssistantUI runtime
export function AssistantChat() {
  const { streamingMessages, sendChat } = useOrchestrator();

  // Memoize isRunning
  const isRunning = useMemo(
    () => streamingMessages.some((m) => m.status === 'streaming'),
    [streamingMessages]
  );

  // Create external store runtime
  const runtime = useExternalStoreRuntime({
    messages: streamingMessages,
    convertMessage: (msg: StreamingMessage) => convertMessage(msg),
    isRunning,
    onNew: async (message) => {
      const textContent = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');
      if (textContent) {
        sendChat(textContent);
      }
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread />
    </AssistantRuntimeProvider>
  );
}
