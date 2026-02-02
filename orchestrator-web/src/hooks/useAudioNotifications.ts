import { useRef, useCallback } from 'react';

export type NotificationSoundType = 'alert' | 'chime' | 'soft';

const SOUND_PATHS: Record<NotificationSoundType, string> = {
  alert: '/sounds/alert.mp3',
  chime: '/sounds/chime.mp3',
  soft: '/sounds/soft.mp3',
};

export function useAudioNotifications() {
  // Cache Audio elements for reuse
  const audioCache = useRef<Map<NotificationSoundType, HTMLAudioElement>>(new Map());

  const getAudio = useCallback((type: NotificationSoundType): HTMLAudioElement => {
    let audio = audioCache.current.get(type);
    if (!audio) {
      audio = new Audio(SOUND_PATHS[type]);
      audioCache.current.set(type, audio);
    }
    return audio;
  }, []);

  const play = useCallback((type: NotificationSoundType, volume: number) => {
    try {
      const audio = getAudio(type);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.currentTime = 0;
      audio.play().catch(err => {
        // Silently ignore autoplay restrictions - user must interact first
        console.debug('Audio play blocked:', err.message);
      });
    } catch (err) {
      console.debug('Audio error:', err);
    }
  }, [getAudio]);

  return { play };
}
