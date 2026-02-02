import { useEffect, useRef, useCallback } from 'react';
import { useOrchestrator } from '../context/OrchestratorContext';
import { useNotificationSettings } from './useNotificationSettings';
import { useAudioNotifications, type NotificationSoundType } from './useAudioNotifications';
import { isTauri } from '../lib/tauri';

interface NotificationConfig {
  sound: NotificationSoundType;
  title: string;
  getMessage: () => string;
}

export function useNotifications() {
  const {
    permissionPrompt,
    pendingPlanApproval,
    pendingStageApproval,
    planningQuestion,
    userInputRequest,
    allComplete,
    // Design session state
    designSessionId,
    designInputLocked,
    designPreview,
    designComplete,
  } = useOrchestrator();

  const { settings } = useNotificationSettings();
  const { play } = useAudioNotifications();

  // Track previous values to detect state transitions
  const prevPermissionPrompt = useRef(permissionPrompt);
  const prevPendingPlanApproval = useRef(pendingPlanApproval);
  const prevPendingStageApproval = useRef(pendingStageApproval);
  const prevPlanningQuestion = useRef(planningQuestion);
  const prevUserInputRequest = useRef(userInputRequest);
  const prevAllComplete = useRef(allComplete);
  // Design session refs
  const prevDesignInputLocked = useRef(designInputLocked);
  const prevDesignPreview = useRef(designPreview);
  const prevDesignComplete = useRef(designComplete);

  const shouldShowBrowserNotification = useCallback((): boolean => {
    // In Tauri mode, always show notifications (no tab visibility concept)
    if (isTauri()) {
      return true;
    }
    // If notifyOnlyWhenHidden is enabled, only show browser notification when tab is hidden
    if (settings.notifyOnlyWhenHidden && !document.hidden) {
      return false;
    }
    return true;
  }, [settings.notifyOnlyWhenHidden]);

  const sendNotification = useCallback(async (config: NotificationConfig) => {
    console.log(`[Notifications] Sending: ${config.title}`);

    // Play sound if enabled - always plays regardless of tab visibility
    if (settings.soundEnabled) {
      play(config.sound, settings.soundVolume);
    }

    // Skip visual notification if disabled or visibility check fails
    if (!settings.browserNotificationsEnabled || !shouldShowBrowserNotification()) {
      return;
    }

    // Use Tauri native notifications if in Tauri mode
    if (isTauri() && window.__TAURI__) {
      try {
        console.log('[Notifications] Using Tauri notifications');
        const { sendNotification: tauriSendNotification, isPermissionGranted, requestPermission } =
          await import('@tauri-apps/plugin-notification');

        let permitted = await isPermissionGranted();
        console.log('[Notifications] Permission granted:', permitted);

        if (!permitted) {
          console.log('[Notifications] Requesting permission...');
          const result = await requestPermission();
          console.log('[Notifications] Permission result:', result);
          permitted = result === 'granted';
        }

        if (permitted) {
          const body = config.getMessage();
          console.log('[Notifications] Sending notification:', config.title, body);
          await tauriSendNotification({
            title: config.title,
            body: body,
          });
          console.log('[Notifications] Notification sent successfully');
        }
      } catch (err) {
        console.error('[Notifications] Tauri notification error:', err);
      }
      return;
    }

    // Browser fallback
    if (Notification.permission === 'granted') {
      try {
        new Notification(config.title, {
          body: config.getMessage(),
          icon: '/vite.svg',
          tag: config.title, // Prevents duplicate notifications
        });
      } catch (err) {
        console.debug('Browser notification error:', err);
      }
    }
  }, [settings, play, shouldShowBrowserNotification]);

  // Watch for permission prompt changes
  // Notify when: new permission appears (null→value) OR different permission (valueA→valueB)
  useEffect(() => {
    const prev = prevPermissionPrompt.current;
    const curr = permissionPrompt;
    prevPermissionPrompt.current = curr;

    // Notify if there's a current prompt AND it's different from previous
    if (curr && curr !== prev) {
      sendNotification({
        sound: 'chime',
        title: 'Permission needed',
        getMessage: () => `Permission needed: ${curr.toolName}`,
      });
    }
  }, [permissionPrompt, sendNotification]);

  // Watch for plan approval changes
  useEffect(() => {
    const prev = prevPendingPlanApproval.current;
    const curr = pendingPlanApproval;
    prevPendingPlanApproval.current = curr;

    if (curr && curr !== prev) {
      sendNotification({
        sound: 'chime',
        title: 'Plan ready for review',
        getMessage: () => 'A new plan is ready for your review',
      });
    }
  }, [pendingPlanApproval, sendNotification]);

  // Watch for stage approval changes
  useEffect(() => {
    const prev = prevPendingStageApproval.current;
    const curr = pendingStageApproval;
    prevPendingStageApproval.current = curr;

    if (curr && curr !== prev) {
      sendNotification({
        sound: 'chime',
        title: 'Stage ready for approval',
        getMessage: () => `Stage "${curr.stage}" is ready for approval`,
      });
    }
  }, [pendingStageApproval, sendNotification]);

  // Watch for planning question changes
  useEffect(() => {
    const prev = prevPlanningQuestion.current;
    const curr = planningQuestion;
    prevPlanningQuestion.current = curr;

    if (curr && curr !== prev) {
      const currentQ = curr.questions[curr.currentIndex];
      sendNotification({
        sound: 'chime',
        title: 'Question from planner',
        getMessage: () => currentQ?.question || 'The planner has a question for you',
      });
    }
  }, [planningQuestion, sendNotification]);

  // Watch for user input request changes
  useEffect(() => {
    const prev = prevUserInputRequest.current;
    const curr = userInputRequest;
    prevUserInputRequest.current = curr;

    if (curr && curr !== prev) {
      sendNotification({
        sound: 'chime',
        title: 'Input required',
        getMessage: () => curr.inputs[0]?.label || 'User input is required',
      });
    }
  }, [userInputRequest, sendNotification]);

  // Watch for session completion
  useEffect(() => {
    const prev = prevAllComplete.current;
    const curr = allComplete;
    prevAllComplete.current = curr;

    // Notify when session completes (false → true)
    if (!prev && curr) {
      sendNotification({
        sound: 'chime',
        title: 'Session complete',
        getMessage: () => 'All tasks have been completed',
      });
    }
  }, [allComplete, sendNotification]);

  // ═══════════════════════════════════════════════════════════════
  // Design Session Notifications
  // ═══════════════════════════════════════════════════════════════

  // Watch for design input unlocked (agent waiting for user response)
  useEffect(() => {
    const prev = prevDesignInputLocked.current;
    const curr = designInputLocked;
    prevDesignInputLocked.current = curr;

    // Only notify if in a design session and input was locked, now unlocked
    if (designSessionId && prev === true && curr === false) {
      sendNotification({
        sound: 'chime',
        title: 'Design input ready',
        getMessage: () => 'The design assistant is waiting for your response',
      });
    }
  }, [designSessionId, designInputLocked, sendNotification]);

  // Watch for design preview options appearing
  useEffect(() => {
    const prev = prevDesignPreview.current;
    const curr = designPreview;
    prevDesignPreview.current = curr;

    // Only notify if in a design session and preview appeared or changed
    if (designSessionId && curr && curr !== prev && curr.options.length > 0) {
      const typeLabel = curr.type === 'theme' ? 'Theme' : curr.type === 'component' ? 'Component' : 'Mockup';
      sendNotification({
        sound: 'chime',
        title: `${typeLabel} options ready`,
        getMessage: () => `${curr.options.length} ${typeLabel.toLowerCase()} options are ready for review`,
      });
    }
  }, [designSessionId, designPreview, sendNotification]);

  // Watch for design session completion
  useEffect(() => {
    const prev = prevDesignComplete.current;
    const curr = designComplete;
    prevDesignComplete.current = curr;

    // Notify when design is complete
    if (designSessionId && curr && !prev) {
      sendNotification({
        sound: 'chime',
        title: 'Design complete',
        getMessage: () => `Design "${curr.designName}" is ready to save`,
      });
    }
  }, [designSessionId, designComplete, sendNotification]);
}
