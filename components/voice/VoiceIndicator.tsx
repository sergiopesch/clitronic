'use client';

import { useEffect, useState } from 'react';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

interface VoiceIndicatorProps {
  state: VoiceState;
}

/**
 * Visual indicator for voice mode states
 * Shows recording animation with waveform bars or transcribing spinner
 * Positioned fixed at bottom center of screen
 */
export function VoiceIndicator({ state }: VoiceIndicatorProps) {
  const [waveHeights, setWaveHeights] = useState<number[]>([0.3, 0.5, 0.7, 0.5, 0.3]);

  // Animate waveform bars during recording
  useEffect(() => {
    if (state !== 'recording') return;

    const interval = setInterval(() => {
      setWaveHeights(
        Array.from({ length: 5 }, () => 0.2 + Math.random() * 0.8)
      );
    }, 100);

    return () => clearInterval(interval);
  }, [state]);

  if (state === 'idle') return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform">
      <div
        className={`flex items-center gap-3 rounded-full px-5 py-3 shadow-lg backdrop-blur-sm ${
          state === 'recording'
            ? 'bg-red-950/90 border border-red-500/50'
            : 'bg-zinc-900/90 border border-cyan-500/50'
        }`}
      >
        {state === 'recording' ? (
          <>
            {/* Pulsing red dot */}
            <div className="relative">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <div className="absolute inset-0 h-3 w-3 rounded-full bg-red-500 animate-ping opacity-75" />
            </div>

            {/* Animated waveform bars */}
            <div className="flex items-center gap-[3px] h-5">
              {waveHeights.map((height, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-red-400 transition-all duration-100"
                  style={{ height: `${height * 20}px` }}
                />
              ))}
            </div>

            {/* Recording text */}
            <span className="text-sm font-medium text-red-400">
              Recording...
            </span>
          </>
        ) : (
          <>
            {/* Spinner */}
            <div className="relative h-4 w-4">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
            </div>

            {/* Transcribing text */}
            <span className="text-sm font-medium text-cyan-400">
              Transcribing...
            </span>
          </>
        )}
      </div>
    </div>
  );
}
