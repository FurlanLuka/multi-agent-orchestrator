import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ScrollArea,
  Group,
  Text,
  Badge,
  Stack,
  Divider,
  Box,
} from '@mantine/core';
import type { StreamingMessage, RequestFlow, Plan, PlanningStatusEvent, PlanningQuestion, StageApprovalRequest } from '@orchy/types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ActiveFlowCard } from '../ActiveFlowCard';
import { CompletedFlowCard } from '../CompletedFlowCard';
import { PlanApprovalCard } from '../PlanApprovalCard';
import { StageApprovalCard } from '../planning/StageApprovalCard';
import { PermissionOverlay } from '../overlay/PermissionOverlay';
import { glass } from '../../theme';

// Timeline item type for unified rendering
export type TimelineItem =
  | { type: 'message'; timestamp: number; data: StreamingMessage; key: string }
  | { type: 'flow'; timestamp: number; data: RequestFlow; key: string };

// Props for chat timeline data
export interface ChatTimelineData {
  messages: StreamingMessage[];
  flows: RequestFlow[];
  activeFlows: RequestFlow[];
  completedFlows: RequestFlow[];
}

// Props for interactive features (optional - for live mode)
export interface ChatTimelineInteractive {
  sessionActive: boolean;
  executionStarted: boolean;
  planningStatus: PlanningStatusEvent | null;
  planningQuestion: PlanningQuestion | null;
  pendingPlanApproval: { approvalId: string; plan: Plan } | null;
  pendingStageApproval: StageApprovalRequest | null;
  permissionPrompt: { project: string; toolName: string; toolInput: Record<string, unknown> } | null;
  isPlannerPermission: boolean;
  // Handlers
  onSendChat: (message: string) => void;
  onAnswerPlanningQuestion: (questionId: string, answer: string) => void;
  onApprovePlan: () => void;
  onRefinePlan: (feedback: string) => void;
  onRespondToStageApproval: (stageId: string, approved: boolean, feedback?: string) => void;
  onRespondToPermission: (approved: boolean, allowAll?: boolean) => void;
}

export interface ChatTimelineProps {
  // Required data
  data: ChatTimelineData;
  // Optional interactive features (if not provided, renders read-only)
  interactive?: ChatTimelineInteractive;
  // Optional customization
  showInput?: boolean;
  inputPlaceholder?: string;
  inputDisabled?: boolean;
  inputActionColor?: string;
}

export function ChatTimeline({
  data,
  interactive,
  showInput = true,
  inputPlaceholder,
  inputDisabled,
  inputActionColor = 'peach',
}: ChatTimelineProps) {
  const { messages, activeFlows, completedFlows } = data;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  // Interactive mode flags
  const isInteractive = !!interactive;
  const sessionActive = interactive?.sessionActive ?? false;
  const executionStarted = interactive?.executionStarted ?? false;

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

    // Add synthetic "Plan approved" flow when execution has started
    // and there's a planning flow still in activeFlows
    if (isInteractive && executionStarted && interactive?.pendingPlanApproval?.plan) {
      const planningFlow = activeFlows.find(f => f.type === 'planning');
      if (planningFlow && !completedFlows.some(f => f.type === 'planning' && f.id === planningFlow.id)) {
        items.push({
          type: 'flow',
          timestamp: Date.now(),
          data: {
            ...planningFlow,
            status: 'completed' as const,
            completedAt: Date.now(),
            result: {
              passed: true,
              summary: 'Plan approved - execution started',
            },
          },
          key: `${planningFlow.id}-approved`,
        });
      }
    }

    // Sort by timestamp
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, completedFlows, isInteractive, executionStarted, interactive?.pendingPlanApproval?.plan, activeFlows]);

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [timeline, activeFlows, interactive?.pendingPlanApproval, interactive?.pendingStageApproval]);

  // Handle send - routes to refinePlan or sendChat
  const handleSend = useCallback((message: string) => {
    if (!interactive) return;
    if (interactive.pendingPlanApproval && interactive.onRefinePlan) {
      interactive.onRefinePlan(message);
    } else {
      interactive.onSendChat(message);
    }
  }, [interactive]);

  // Chat enabled logic
  const isAwaitingApproval = interactive?.planningStatus?.phase === 'awaiting_approval' || !!interactive?.pendingPlanApproval;
  const chatEnabled = isInteractive && sessionActive && !executionStarted && (!interactive?.planningStatus || isAwaitingApproval || interactive.planningStatus.phase === 'complete');

  // Input placeholder
  const placeholder = inputPlaceholder ?? (
    executionStarted
      ? 'Execution in progress...'
      : interactive?.pendingPlanApproval
        ? 'Type feedback to refine the plan...'
        : sessionActive
          ? 'Chat with Planning Agent...'
          : 'Start a session first...'
  );

  return (
    <Box style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Content area - white background from parent FormCard-style container */}
      <Box
        p="md"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
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
              </Stack>
            </ScrollArea>
          </Box>

          {/* BOTTOM: Active Operations (interactive mode only) */}
          {isInteractive && (() => {
            // Filter out planning flows once execution has started (plan approved)
            const visibleFlows = executionStarted
              ? activeFlows.filter(f => f.type !== 'planning')
              : activeFlows;

            const hasActiveItems = visibleFlows.length > 0 || interactive.pendingStageApproval || interactive.pendingPlanApproval;
            if (!hasActiveItems) return null;

            return (
              <>
                <Divider my="sm" color="var(--border-subtle)" />
                <Box p="xs">
                  <Group gap="xs" mb="xs">
                    <Text size="xs" fw={600} style={{ color: 'var(--color-primary)' }}>
                      ACTIVE
                    </Text>
                    <Badge size="xs" color="peach" variant="light">
                      {visibleFlows.length + (interactive.pendingStageApproval ? 1 : 0) + (interactive.pendingPlanApproval ? 1 : 0)}
                    </Badge>
                  </Group>
                  <Stack gap="sm">
                    {/* Plan approval card */}
                    {interactive.pendingPlanApproval && interactive.onApprovePlan && interactive.pendingPlanApproval.plan?.tasks && (
                      <PlanApprovalCard
                        plan={interactive.pendingPlanApproval.plan}
                        onApprove={interactive.onApprovePlan}
                      />
                    )}
                    {/* Stage approval card */}
                    {interactive.pendingStageApproval && (
                      <StageApprovalCard
                        approval={interactive.pendingStageApproval}
                        onApprove={() => interactive.onRespondToStageApproval(interactive.pendingStageApproval!.stageId, true)}
                        onReject={(feedback) => interactive.onRespondToStageApproval(interactive.pendingStageApproval!.stageId, false, feedback)}
                      />
                    )}
                    {/* Active flow cards */}
                    {visibleFlows.map(flow => (
                      <ActiveFlowCard
                        key={flow.id}
                        flow={flow}
                        pendingQuestion={flow.type === 'planning' ? interactive.planningQuestion : null}
                        onAnswerQuestion={interactive.onAnswerPlanningQuestion}
                        planningStatus={flow.type === 'planning' ? interactive.planningStatus : null}
                      />
                    ))}
                  </Stack>
                </Box>
              </>
            );
          })()}

        </Stack>
      </Box>

      {/* Footer with Input (if enabled) */}
      {showInput && (
        <Box
          px="lg"
          py="md"
          style={{
            background: glass.modalZone.bg,
            borderTop: glass.modalZone.border,
            flexShrink: 0,
          }}
        >
          <ChatInput
            placeholder={placeholder}
            disabled={inputDisabled ?? !chatEnabled}
            actionColor={inputActionColor}
            onSend={handleSend}
          />
        </Box>
      )}

      {/* Planner permission overlay (interactive mode only) */}
      {isInteractive && interactive.isPlannerPermission && interactive.permissionPrompt && (
        <PermissionOverlay
          toolName={interactive.permissionPrompt.toolName}
          toolInput={interactive.permissionPrompt.toolInput}
          onResponse={interactive.onRespondToPermission}
          title="Planner Permission"
          compact={false}
        />
      )}
    </Box>
  );
}
