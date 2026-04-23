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
