'use client';

import type { VoiceDebugInfo, VoiceState } from '@/hooks/useVoiceInteraction';

interface VoiceDebugPanelProps {
  debug: VoiceDebugInfo;
  voiceState: VoiceState;
  isLoading: boolean;
  isSpeaking: boolean;
  partialTranscript: string;
  finalTranscript: string;
  voiceError: string | null;
}

export function VoiceDebugPanel({
  debug,
  voiceState,
  isLoading,
  isSpeaking,
  partialTranscript,
  finalTranscript,
  voiceError,
}: VoiceDebugPanelProps) {
  return (
    <div className="border-border bg-surface-1/95 text-text-secondary fixed right-3 bottom-3 z-40 w-[min(420px,calc(100vw-24px))] rounded-xl border p-3 font-mono text-[11px] shadow-xl backdrop-blur">
      <div className="text-text-primary mb-2 text-xs">Voice Debug (dev)</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>transport</span>
        <span className="text-text-primary">{debug.transport}</span>
        <span>voiceState</span>
        <span className="text-text-primary">{voiceState}</span>
        <span>sessionReady</span>
        <span className="text-text-primary">{String(debug.sessionReady)}</span>
        <span>pc/ice</span>
        <span className="text-text-primary">
          {debug.pcConnectionState} / {debug.iceConnectionState}
        </span>
        <span>dataChannel</span>
        <span className="text-text-primary">{debug.dataChannelState}</span>
        <span>events rx/tx</span>
        <span className="text-text-primary">
          {debug.receivedEventCount} / {debug.sentEventCount}
        </span>
        <span>lastRecv</span>
        <span className="text-text-primary">{debug.lastReceivedEvent ?? '-'}</span>
        <span>isLoading</span>
        <span className="text-text-primary">{String(isLoading)}</span>
        <span>isSpeaking</span>
        <span className="text-text-primary">{String(isSpeaking)}</span>
        <span>lastSent</span>
        <span className="text-text-primary">{debug.lastSentEvent ?? '-'}</span>
      </div>

      <div className="mt-2">
        <div className="mb-1">lastEvents</div>
        <div className="bg-surface-2/70 max-h-24 overflow-auto rounded p-2 text-[10px]">
          {debug.lastEvents.length ? debug.lastEvents.join('\n') : '-'}
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-1">partial</div>
        <div className="bg-surface-2/70 max-h-14 overflow-auto rounded p-2 text-[10px]">
          {partialTranscript || '-'}
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-1">final</div>
        <div className="bg-surface-2/70 max-h-14 overflow-auto rounded p-2 text-[10px]">
          {finalTranscript || '-'}
        </div>
      </div>

      {voiceError && (
        <div className="text-error mt-2 max-h-14 overflow-auto rounded border border-red-500/30 bg-red-500/10 p-2 text-[10px]">
          {voiceError}
        </div>
      )}
    </div>
  );
}
