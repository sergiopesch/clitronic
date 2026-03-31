'use client';

import type { VoiceState } from '@/hooks/useVoiceInteraction';

interface VoiceOrbProps {
  state: VoiceState;
  inputLevel?: number;
  outputLevel?: number;
}

const LABELS: Record<VoiceState, string> = {
  idle: 'Idle',
  requesting_mic: 'Requesting mic',
  connecting_realtime: 'Connecting',
  listening: 'Listening',
  capturing: 'Capturing',
  transcribing: 'Transcribing',
  processing: 'Processing',
  speaking: 'Speaking',
  error: 'Error',
};

export function VoiceOrb({ state, inputLevel = 0, outputLevel = 0 }: VoiceOrbProps) {
  const isActive =
    state === 'listening' ||
    state === 'capturing' ||
    state === 'transcribing' ||
    state === 'processing' ||
    state === 'speaking';
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening' || state === 'capturing';
  const isError = state === 'error';
  const activeLevel = isSpeaking
    ? outputLevel
    : isListening
      ? inputLevel
      : Math.max(inputLevel, outputLevel);
  const reactiveScale = 1 + activeLevel * 0.11;
  const glowOpacity = isError ? 1 : isActive ? 0.45 + activeLevel * 0.45 : 0;
  const ringOpacity = 0.18 + activeLevel * 0.36;
  const bar1 = 6 + Math.round(activeLevel * 10);
  const bar2 = 9 + Math.round(activeLevel * 14);
  const bar3 = 6 + Math.round(activeLevel * 10);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-16 w-16">
        {(isListening || isSpeaking) && (
          <>
            <span
              className={`border-accent/35 absolute inset-0 rounded-full border ${
                isListening ? 'animate-ping opacity-35' : 'animate-ping opacity-25'
              }`}
              style={{
                animationDuration: isListening ? '1.8s' : '1.4s',
                opacity: ringOpacity,
                transform: `scale(${1 + activeLevel * 0.05})`,
              }}
            />
            <span
              className={`border-accent/20 absolute inset-0 rounded-full border ${
                isListening ? 'animate-ping opacity-20' : 'animate-ping opacity-15'
              }`}
              style={{
                animationDuration: isListening ? '2.6s' : '2s',
                animationDelay: '280ms',
                opacity: ringOpacity * 0.75,
                transform: `scale(${1 + activeLevel * 0.08})`,
              }}
            />
          </>
        )}
        <div
          className={`absolute inset-0 rounded-full blur-xl transition-opacity duration-200 ${
            isError
              ? 'bg-error/40 opacity-100'
              : isActive
                ? 'bg-accent/35 opacity-100'
                : 'opacity-0'
          }`}
          style={!isError ? { opacity: glowOpacity } : undefined}
        />
        <div
          className="border-border bg-surface-1 relative flex h-full w-full items-center justify-center rounded-full border transition-transform duration-150"
          style={{ transform: `scale(${reactiveScale})` }}
        >
          {isListening ? (
            <div className="flex items-end gap-[2px]">
              <span
                className="bg-accent/90 inline-block w-[2px] rounded-full"
                style={{
                  height: `${bar1}px`,
                  animation: 'thinking-dots 1s ease-in-out infinite',
                  animationDelay: '0ms',
                }}
              />
              <span
                className="bg-accent inline-block w-[2px] rounded-full"
                style={{
                  height: `${bar2}px`,
                  animation: 'thinking-dots 1s ease-in-out infinite',
                  animationDelay: '140ms',
                }}
              />
              <span
                className="bg-accent/90 inline-block w-[2px] rounded-full"
                style={{
                  height: `${bar3}px`,
                  animation: 'thinking-dots 1s ease-in-out infinite',
                  animationDelay: '280ms',
                }}
              />
            </div>
          ) : (
            <div
              className={`h-3 w-3 rounded-full ${
                isError
                  ? 'bg-error'
                  : isSpeaking
                    ? 'bg-success'
                    : isActive
                      ? 'bg-accent'
                      : 'bg-text-muted/40'
              } ${isActive ? 'animate-pulse' : ''}`}
            />
          )}
        </div>
      </div>
      <span className="text-text-muted text-xs">{LABELS[state]}</span>
    </div>
  );
}
