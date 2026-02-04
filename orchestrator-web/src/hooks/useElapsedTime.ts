import { useState, useEffect } from 'react';

/**
 * Hook to track elapsed time from a given timestamp.
 * Returns a formatted string like "45s" or "2m 15s".
 * Updates every second.
 */
export function useElapsedTime(startedAt: number | undefined): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }

    const updateElapsed = () => {
      const now = Date.now();
      const diffMs = now - startedAt;
      const diffSeconds = Math.floor(diffMs / 1000);

      if (diffSeconds < 60) {
        setElapsed(`${diffSeconds}s`);
      } else {
        const minutes = Math.floor(diffSeconds / 60);
        const seconds = diffSeconds % 60;
        setElapsed(`${minutes}m ${seconds}s`);
      }
    };

    // Update immediately
    updateElapsed();

    // Update every second
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}
