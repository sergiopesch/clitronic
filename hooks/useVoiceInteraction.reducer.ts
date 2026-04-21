import type { VoiceDebugInfo, VoiceState } from './useVoiceInteraction.types';

/**
 * Consolidated reducer state for useVoiceInteraction.
 *
 * Previously this was spread across ~12 `useState` hooks which made
 * ordering subtle (e.g. setting `voiceState` and `isSpeaking` in two
 * separate commits could render an inconsistent in-between frame).
 * A single reducer gives us atomic transitions and makes the state
 * machine self-documenting via the action log.
 */
export type VoiceReducerState = {
  voiceState: VoiceState;
  partialTranscript: string;
  finalTranscript: string;
  assistantPartialTranscript: string;
  assistantFinalTranscript: string;
  error: string | null;
  hasMounted: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  inputLevel: number;
  outputLevel: number;
  sessionReady: boolean;
  debug: VoiceDebugInfo;
};

export const initialVoiceState: VoiceReducerState = {
  voiceState: 'idle',
  partialTranscript: '',
  finalTranscript: '',
  assistantPartialTranscript: '',
  assistantFinalTranscript: '',
  error: null,
  hasMounted: false,
  isSpeaking: false,
  isMuted: false,
  inputLevel: 0,
  outputLevel: 0,
  sessionReady: false,
  debug: {
    transport: 'openai-realtime-webrtc',
    sessionReady: false,
    pcConnectionState: 'none',
    iceConnectionState: 'none',
    dataChannelState: 'none',
    receivedEventCount: 0,
    sentEventCount: 0,
    lastReceivedEvent: null,
    lastEvents: [],
    lastSentEvent: null,
  },
};

export type VoiceAction =
  | { type: 'MOUNTED' }
  | { type: 'SET_STATE'; state: VoiceState }
  | { type: 'SET_ERROR'; error: string | null; state?: VoiceState }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'SET_SESSION_READY'; ready: boolean }
  | { type: 'SET_SPEAKING'; speaking: boolean }
  | { type: 'USER_TURN_STARTED' }
  | { type: 'USER_TRANSCRIPT_DELTA'; delta: string; trackEnabled: boolean }
  | { type: 'USER_TRANSCRIPT_COMMITTED'; transcript: string }
  | { type: 'USER_FINAL_SET'; transcript: string }
  | { type: 'ASSISTANT_DELTA'; delta: string }
  | { type: 'ASSISTANT_DONE'; transcript: string }
  | { type: 'ASSISTANT_AUDIO_DONE' }
  | { type: 'ASSISTANT_CLEARED'; trackEnabled: boolean }
  | { type: 'RESPONSE_DONE'; trackEnabled: boolean; finalizeAssistant: boolean }
  | { type: 'LEVELS_TICK'; input: number; output: number }
  | { type: 'RESET_TRANSCRIPTS' }
  | { type: 'CLEAR_OUTPUT_LEVEL' }
  | {
      type: 'DEBUG_PATCH';
      patch: Partial<VoiceDebugInfo>;
      incrementReceived?: string | null;
      incrementSent?: string | null;
    }
  | { type: 'CLEANUP' };

function pushEvent(list: string[], entry: string): string[] {
  return [entry, ...list].slice(0, 12);
}

export function voiceReducer(state: VoiceReducerState, action: VoiceAction): VoiceReducerState {
  switch (action.type) {
    case 'MOUNTED':
      return { ...state, hasMounted: true };

    case 'SET_STATE':
      return { ...state, voiceState: action.state };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
        voiceState: action.state ?? state.voiceState,
      };

    case 'SET_MUTED': {
      const next: VoiceReducerState = { ...state, isMuted: action.muted };
      if (action.muted && state.isSpeaking) next.isSpeaking = false;
      return next;
    }

    case 'SET_SESSION_READY':
      return {
        ...state,
        sessionReady: action.ready,
        debug: { ...state.debug, sessionReady: action.ready },
      };

    case 'SET_SPEAKING':
      return { ...state, isSpeaking: action.speaking };

    case 'USER_TURN_STARTED':
      return {
        ...state,
        partialTranscript: '',
        finalTranscript: '',
        assistantPartialTranscript: '',
        assistantFinalTranscript: '',
        isSpeaking: false,
        outputLevel: 0,
      };

    case 'USER_TRANSCRIPT_DELTA':
      return {
        ...state,
        partialTranscript: `${state.partialTranscript}${action.delta}`,
        voiceState: action.trackEnabled ? 'capturing' : state.voiceState,
      };

    case 'USER_TRANSCRIPT_COMMITTED':
      return { ...state, partialTranscript: action.transcript };

    case 'USER_FINAL_SET':
      return { ...state, finalTranscript: action.transcript, partialTranscript: '' };

    case 'ASSISTANT_DELTA':
      return {
        ...state,
        assistantPartialTranscript: `${state.assistantPartialTranscript}${action.delta}`,
      };

    case 'ASSISTANT_DONE':
      return {
        ...state,
        assistantPartialTranscript: '',
        assistantFinalTranscript: action.transcript || state.assistantFinalTranscript,
      };

    case 'ASSISTANT_AUDIO_DONE':
      return { ...state, isSpeaking: false, outputLevel: 0 };

    case 'ASSISTANT_CLEARED': {
      const nextVoiceState: VoiceState =
        state.voiceState === 'capturing' || state.voiceState === 'transcribing'
          ? state.voiceState
          : action.trackEnabled
            ? 'listening'
            : 'idle';
      return {
        ...state,
        assistantPartialTranscript: '',
        isSpeaking: false,
        outputLevel: 0,
        voiceState: nextVoiceState,
      };
    }

    case 'RESPONSE_DONE': {
      const nextAssistantFinal = action.finalizeAssistant
        ? state.assistantFinalTranscript || state.assistantPartialTranscript.trim()
        : state.assistantFinalTranscript;
      const nextVoiceState: VoiceState =
        state.voiceState === 'capturing' ||
        state.voiceState === 'transcribing' ||
        state.voiceState === 'processing'
          ? state.voiceState
          : action.trackEnabled
            ? 'listening'
            : 'idle';
      return {
        ...state,
        assistantFinalTranscript: nextAssistantFinal,
        assistantPartialTranscript: '',
        isSpeaking: false,
        outputLevel: 0,
        voiceState: nextVoiceState,
      };
    }

    case 'LEVELS_TICK': {
      const next: VoiceReducerState = { ...state };
      if (Math.abs(state.inputLevel - action.input) > 0.012) next.inputLevel = action.input;
      if (Math.abs(state.outputLevel - action.output) > 0.012) next.outputLevel = action.output;
      return next;
    }

    case 'RESET_TRANSCRIPTS':
      return {
        ...state,
        partialTranscript: '',
        finalTranscript: '',
        assistantPartialTranscript: '',
        assistantFinalTranscript: '',
        inputLevel: 0,
        outputLevel: 0,
        error: null,
      };

    case 'CLEAR_OUTPUT_LEVEL':
      return { ...state, outputLevel: 0 };

    case 'DEBUG_PATCH': {
      const nextDebug: VoiceDebugInfo = { ...state.debug, ...action.patch };
      if (action.incrementReceived) {
        nextDebug.receivedEventCount = state.debug.receivedEventCount + 1;
        nextDebug.lastReceivedEvent = action.incrementReceived;
        nextDebug.lastEvents = pushEvent(state.debug.lastEvents, action.incrementReceived);
      }
      if (action.incrementSent) {
        nextDebug.sentEventCount = state.debug.sentEventCount + 1;
        nextDebug.lastSentEvent = action.incrementSent;
      }
      return { ...state, debug: nextDebug };
    }

    case 'CLEANUP':
      return {
        ...state,
        inputLevel: 0,
        outputLevel: 0,
        sessionReady: false,
        debug: {
          ...state.debug,
          sessionReady: false,
          pcConnectionState: 'none',
          iceConnectionState: 'none',
          dataChannelState: 'none',
          receivedEventCount: 0,
          sentEventCount: 0,
          lastReceivedEvent: null,
          lastSentEvent: null,
          lastEvents: [],
        },
      };

    default:
      return state;
  }
}
