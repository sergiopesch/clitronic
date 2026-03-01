'use client';

import { useCallback, useRef, useEffect } from 'react';

interface UseLongPressOptions {
  /** Minimum hold duration in ms before triggering (default: 200) */
  threshold?: number;
  /** Callback when long press starts (after threshold) */
  onStart?: () => void;
  /** Callback when long press ends (key released) */
  onEnd?: () => void;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
}

// Note: This hook uses callbacks (onStart/onEnd) for state communication
// so the return value is minimal - just for potential status checking

/**
 * Hook to detect Ctrl+Space (or Cmd+Space) for voice recording.
 * Falls back to just Space when not in an input field.
 * Only triggers after holding for the threshold duration.
 */
export function useLongPress({
  threshold = 200,
  onStart,
  onEnd,
  enabled = true,
}: UseLongPressOptions = {}): void {
  const isPressedRef = useRef(false);
  const thresholdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTriggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (thresholdTimerRef.current) {
      clearTimeout(thresholdTimerRef.current);
      thresholdTimerRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Only handle spacebar
      if (event.code !== 'Space') return;

      // Check if Ctrl/Cmd is held
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      // Check if focus is in an editable field
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isEditable =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable;

      // If in editable field, require Ctrl/Cmd modifier
      // If not in editable field, spacebar alone works
      if (isEditable && !isCtrlOrCmd) return;

      // Ignore if already pressed (prevent repeat events)
      if (isPressedRef.current) return;

      // Prevent default behavior (scrolling or typing space)
      event.preventDefault();

      isPressedRef.current = true;
      hasTriggeredRef.current = false;

      // Start threshold timer
      thresholdTimerRef.current = setTimeout(() => {
        hasTriggeredRef.current = true;
        onStart?.();
      }, threshold);
    },
    [enabled, threshold, onStart]
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Handle spacebar release (don't require Ctrl to still be held)
      if (event.code !== 'Space') return;

      // Only process if we were tracking this press
      if (!isPressedRef.current) return;

      event.preventDefault();

      clearTimer();
      isPressedRef.current = false;

      // Only call onEnd if the threshold was reached
      if (hasTriggeredRef.current) {
        hasTriggeredRef.current = false;
        onEnd?.();
      }
    },
    [enabled, clearTimer, onEnd]
  );

  const handleBlur = useCallback(() => {
    // Cancel on window blur (tab switching, etc.)
    if (isPressedRef.current) {
      clearTimer();
      isPressedRef.current = false;

      if (hasTriggeredRef.current) {
        hasTriggeredRef.current = false;
        onEnd?.();
      }
    }
  }, [clearTimer, onEnd]);

  const handleVisibilityChange = useCallback(() => {
    // Cancel when page becomes hidden
    if (document.hidden && isPressedRef.current) {
      clearTimer();
      isPressedRef.current = false;

      if (hasTriggeredRef.current) {
        hasTriggeredRef.current = false;
        onEnd?.();
      }
    }
  }, [clearTimer, onEnd]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimer();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, handleKeyDown, handleKeyUp, handleBlur, handleVisibilityChange, clearTimer]);

}
