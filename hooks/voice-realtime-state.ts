import { OPENAI_REALTIME_TRANSPORT } from '@/lib/ai/openai-config';

export type VoiceDebugInfo = {
  transport: typeof OPENAI_REALTIME_TRANSPORT;
  sessionReady: boolean;
  pcConnectionState: RTCPeerConnectionState | 'none';
  iceConnectionState: RTCIceConnectionState | 'none';
  dataChannelState: RTCDataChannelState | 'none';
  receivedEventCount: number;
  sentEventCount: number;
  lastReceivedEvent: string | null;
  lastEvents: string[];
  lastSentEvent: string | null;
};

export type VoiceTeardownSnapshot = {
  partialTranscript: string;
  finalTranscript: string;
  assistantPartialTranscript: string;
  assistantFinalTranscript: string;
  inputLevel: number;
  outputLevel: number;
  isSpeaking: boolean;
  sessionReady: boolean;
};

export type VoiceStartAttempt = {
  controller: AbortController;
};

export type RealtimeVoiceEvent = {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  text?: string;
};

const ITEM_SCOPED_REALTIME_EVENTS = new Set([
  'input_audio_buffer.speech_started',
  'input_audio_buffer.speech_stopped',
  'conversation.item.input_audio_transcription.delta',
  'conversation.item.input_audio_transcript.delta',
  'input_audio_transcription.delta',
  'conversation.item.input_audio_transcription.completed',
  'conversation.item.input_audio_transcript.completed',
  'input_audio_transcription.completed',
  'conversation.item.input_audio_transcription.failed',
]);

export function decodeRealtimeVoiceEvent(payload: unknown): RealtimeVoiceEvent | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.type !== 'string' || !record.type.trim()) return null;

  const type = record.type.trim();
  const event: RealtimeVoiceEvent = { type };
  if (ITEM_SCOPED_REALTIME_EVENTS.has(type)) {
    if (typeof record.item_id !== 'string' || !record.item_id.trim()) return null;
    event.item_id = record.item_id.trim();
  }

  for (const field of ['delta', 'transcript', 'text'] as const) {
    if (record[field] === undefined) continue;
    if (typeof record[field] !== 'string') return null;
    event[field] = record[field];
  }

  return event;
}

export function decodeRealtimeSessionSecret(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).value;
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4_096 ||
    value !== value.trim() ||
    /\s/.test(value)
  ) {
    return null;
  }
  return value;
}

export type VoiceTurnTracker = {
  activeItemId: string | null;
  completedItemIds: Set<string>;
};

export function createVoiceTurnTracker(): VoiceTurnTracker {
  return {
    activeItemId: null,
    completedItemIds: new Set(),
  };
}

export function startVoiceTurn(tracker: VoiceTurnTracker, itemId: string | undefined): boolean {
  const normalizedItemId = itemId?.trim();
  if (!normalizedItemId) return false;
  if (tracker.activeItemId === normalizedItemId || tracker.completedItemIds.has(normalizedItemId)) {
    return false;
  }
  tracker.activeItemId = normalizedItemId;
  return true;
}

export function isActiveVoiceTurn(tracker: VoiceTurnTracker, itemId: string | undefined): boolean {
  return Boolean(itemId && tracker.activeItemId === itemId);
}

export function canAcceptVoiceTurnEvent(
  tracker: VoiceTurnTracker,
  itemId: string | undefined
): boolean {
  return Boolean(
    itemId && isActiveVoiceTurn(tracker, itemId) && !tracker.completedItemIds.has(itemId)
  );
}

export function canStartVoiceInputTurn(isMuted: boolean, trackEnabled: boolean): boolean {
  return !isMuted && trackEnabled;
}

export function resolveCompletedVoiceTranscript(
  completedTranscript: string | undefined,
  bufferedTranscript: string
): string | null {
  const completed = completedTranscript?.trim();
  if (completed) return completed;
  const buffered = bufferedTranscript.trim();
  return buffered || null;
}

export type VoiceMuteAction = 'discard-input' | 'go-idle' | 'preserve-output';

export function getVoiceMuteAction(voiceState: string): VoiceMuteAction {
  if (voiceState === 'capturing' || voiceState === 'transcribing') return 'discard-input';
  if (voiceState === 'listening') return 'go-idle';
  return 'preserve-output';
}

export type VoicePrimaryStopAction = 'interrupt-output' | 'stop-session';

export function getVoicePrimaryStopAction(voiceState: string): VoicePrimaryStopAction {
  return voiceState === 'processing' || voiceState === 'speaking'
    ? 'interrupt-output'
    : 'stop-session';
}

export function completeVoiceTurn(tracker: VoiceTurnTracker, itemId: string | undefined): boolean {
  if (!canAcceptVoiceTurnEvent(tracker, itemId) || !itemId) {
    return false;
  }
  tracker.completedItemIds.add(itemId);
  while (tracker.completedItemIds.size > 32) {
    const oldest = tracker.completedItemIds.values().next().value;
    if (!oldest) break;
    tracker.completedItemIds.delete(oldest);
  }
  return true;
}

export function invalidateVoiceTurn(tracker: VoiceTurnTracker): void {
  tracker.activeItemId = null;
}

export function trySendRealtimeEvent(
  channel: Pick<RTCDataChannel, 'readyState' | 'send'> | null,
  payload: Record<string, unknown>
): boolean {
  if (!channel || channel.readyState !== 'open') return false;
  try {
    channel.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function createVoiceStartAttempt(): VoiceStartAttempt {
  return { controller: new AbortController() };
}

export function isActiveVoiceStartAttempt(
  current: VoiceStartAttempt | null,
  candidate: VoiceStartAttempt
): boolean {
  return current === candidate && !candidate.controller.signal.aborted;
}

export function canReuseRealtimeConnection(
  peerState: RTCPeerConnectionState | undefined,
  dataChannelState: RTCDataChannelState | undefined,
  trackState: MediaStreamTrackState | undefined
): boolean {
  return peerState === 'connected' && dataChannelState === 'open' && trackState === 'live';
}

export function canToggleVoiceMute(
  voiceState: string,
  isMuted: boolean,
  isLocked: boolean
): boolean {
  if (isLocked) return false;
  if (['requesting_mic', 'connecting_realtime'].includes(voiceState)) return false;
  if (isMuted) return true;
  return !['idle', 'error'].includes(voiceState);
}

export function shouldIgnoreVoiceStartFailure(
  current: VoiceStartAttempt | null,
  candidate: VoiceStartAttempt
): boolean {
  return !isActiveVoiceStartAttempt(current, candidate);
}

export function createInitialVoiceDebugInfo(): VoiceDebugInfo {
  return {
    transport: OPENAI_REALTIME_TRANSPORT,
    sessionReady: false,
    pcConnectionState: 'none',
    iceConnectionState: 'none',
    dataChannelState: 'none',
    receivedEventCount: 0,
    sentEventCount: 0,
    lastReceivedEvent: null,
    lastEvents: [],
    lastSentEvent: null,
  };
}

export function buildTeardownVoiceDebugInfo(
  previous: VoiceDebugInfo,
  { resetDebugCounters = false }: { resetDebugCounters?: boolean } = {}
): VoiceDebugInfo {
  return {
    ...previous,
    sessionReady: false,
    pcConnectionState: 'none',
    iceConnectionState: 'none',
    dataChannelState: 'none',
    receivedEventCount: resetDebugCounters ? 0 : previous.receivedEventCount,
    sentEventCount: resetDebugCounters ? 0 : previous.sentEventCount,
    lastReceivedEvent: resetDebugCounters ? null : previous.lastReceivedEvent,
    lastSentEvent: resetDebugCounters ? null : previous.lastSentEvent,
    lastEvents: resetDebugCounters ? [] : previous.lastEvents,
  };
}

export function createVoiceTeardownSnapshot(): VoiceTeardownSnapshot {
  return {
    partialTranscript: '',
    finalTranscript: '',
    assistantPartialTranscript: '',
    assistantFinalTranscript: '',
    inputLevel: 0,
    outputLevel: 0,
    isSpeaking: false,
    sessionReady: false,
  };
}
