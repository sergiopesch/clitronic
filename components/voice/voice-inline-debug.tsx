'use client';

import type { VoiceDebugInfo, VoiceState } from '@/hooks/useVoiceInteraction';

interface VoiceInlineDebugProps {
  debug: VoiceDebugInfo;
  voiceState: VoiceState;
  isSpeaking: boolean;
  isLoading: boolean;
}

export function VoiceInlineDebug({
  debug,
  voiceState,
  isSpeaking,
  isLoading,
}: VoiceInlineDebugProps) {
  return (
    <details className="border-border bg-surface-1/55 w-full rounded-xl border px-3 py-2 text-xs">
      <summary className="text-text-muted cursor-pointer list-none select-none">
        Debug details
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-text-muted">state</span>
        <span className="text-text-primary">{voiceState}</span>
        <span className="text-text-muted">session</span>
        <span className="text-text-primary">{debug.sessionReady ? 'ready' : 'not ready'}</span>
        <span className="text-text-muted">pc / ice</span>
        <span className="text-text-primary">
          {debug.pcConnectionState} / {debug.iceConnectionState}
        </span>
        <span className="text-text-muted">data channel</span>
        <span className="text-text-primary">{debug.dataChannelState}</span>
        <span className="text-text-muted">events rx/tx</span>
        <span className="text-text-primary">
          {debug.receivedEventCount} / {debug.sentEventCount}
        </span>
        <span className="text-text-muted">last recv</span>
        <span className="text-text-primary">{debug.lastReceivedEvent ?? '-'}</span>
        <span className="text-text-muted">speaking</span>
        <span className="text-text-primary">{isSpeaking ? 'yes' : 'no'}</span>
        <span className="text-text-muted">rendering card</span>
        <span className="text-text-primary">{isLoading ? 'yes' : 'no'}</span>
        <span className="text-text-muted">last sent</span>
        <span className="text-text-primary">{debug.lastSentEvent ?? '-'}</span>
      </div>
      <div className="mt-2">
        <div className="text-text-muted mb-1 text-[10px] tracking-[0.08em] uppercase">
          Recent events
        </div>
        <div className="bg-surface-2/70 text-text-secondary max-h-24 overflow-auto rounded px-2 py-1.5 font-mono text-[10px]">
          {debug.lastEvents.length ? debug.lastEvents.join('\n') : '-'}
        </div>
      </div>
    </details>
  );
}
