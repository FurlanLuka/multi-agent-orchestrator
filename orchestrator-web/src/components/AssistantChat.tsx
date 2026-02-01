import { useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import type { StreamingMessage } from '@orchy/types';
import { useOrchestrator } from '../context/OrchestratorContext';
import { ChatTimeline } from './chat/ChatTimeline';
import type { ChatTimelineData, ChatTimelineInteractive } from './chat/ChatTimeline';

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

// Main chat component using ChatTimeline with live data
function ChatThread() {
  const {
    streamingMessages: messages,
    planningStatus,
    activeFlows,
    completedFlows,
    flows,
    sendChat,
    session,
    permissionPrompt,
    respondToPermission,
    planningQuestion,
    answerPlanningQuestion,
    pendingPlanApproval,
    approvePlanViaChat,
    refinePlan,
    pendingStageApproval,
    respondToStageApproval,
  } = useOrchestrator();

  const sessionActive = !!session;
  const executionStarted = !!session?.plan;

  // Check if this permission is for the planner
  const isPlannerPermission = permissionPrompt?.project === 'planner';

  // Prepare data for ChatTimeline
  const timelineData: ChatTimelineData = useMemo(() => ({
    messages,
    flows,
    activeFlows,
    completedFlows,
  }), [messages, flows, activeFlows, completedFlows]);

  // Prepare interactive handlers for ChatTimeline
  const interactive: ChatTimelineInteractive = useMemo(() => ({
    sessionActive,
    executionStarted,
    planningStatus,
    planningQuestion,
    pendingPlanApproval,
    pendingStageApproval,
    permissionPrompt,
    isPlannerPermission,
    onSendChat: sendChat,
    onAnswerPlanningQuestion: answerPlanningQuestion,
    onApprovePlan: approvePlanViaChat,
    onRefinePlan: refinePlan,
    onRespondToStageApproval: respondToStageApproval,
    onRespondToPermission: respondToPermission,
  }), [
    sessionActive,
    executionStarted,
    planningStatus,
    planningQuestion,
    pendingPlanApproval,
    pendingStageApproval,
    permissionPrompt,
    isPlannerPermission,
    sendChat,
    answerPlanningQuestion,
    approvePlanViaChat,
    refinePlan,
    respondToStageApproval,
    respondToPermission,
  ]);

  return (
    <ChatTimeline
      data={timelineData}
      interactive={interactive}
      showInput={true}
      inputActionColor="peach"
    />
  );
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

// Export ChatTimeline for reuse (e.g., session review)
export { ChatTimeline } from './chat/ChatTimeline';
export type { ChatTimelineData, ChatTimelineInteractive } from './chat/ChatTimeline';
