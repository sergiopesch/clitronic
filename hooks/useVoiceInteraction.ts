'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { cleanTranscriptLight } from '@/lib/ai/transcript-utils';
import { REALTIME_VOICE_INSTRUCTIONS } from '@/lib/ai/voice-prompts';
import { initialVoiceState, voiceReducer } from './useVoiceInteraction.reducer';
import { createDefaultRealtimeTransport } from './useVoiceInteraction.transport';
import type { RealtimeEvent, RealtimeTransport } from './useVoiceInteraction.types';

export type { VoiceDebugInfo, VoiceState } from './useVoiceInteraction.types';

type UseVoiceInteractionOptions = {
  onFinalTranscript?: (payload: { raw: string; cleaned: string }) => void | Promise<void>;
  onTurnStart?: () => void;
  debugEnabled?: boolean;
  /**
   * Optional transport override. Production code uses the default WebRTC
   * transport; tests inject a fake to exercise the state machine without
   * a real browser or OpenAI connection.
   */
  transport?: RealtimeTransport;
};

const USER_TRANSCRIPT_DELTA_EVENTS = new Set([
  'conversation.item.input_audio_transcription.delta',
  'conversation.item.input_audio_transcript.delta',
  'input_audio_transcription.delta',
]);

const USER_TRANSCRIPT_DONE_EVENTS = new Set([
  'conversation.item.input_audio_transcription.completed',
  'conversation.item.input_audio_transcript.completed',
  'input_audio_transcription.completed',
]);

const ASSISTANT_TRANSCRIPT_DELTA_EVENTS = new Set([
  'response.audio_transcript.delta',
  'response.output_audio_transcript.delta',
  'response.text.delta',
  'response.output_text.delta',
]);

const ASSISTANT_TRANSCRIPT_DONE_EVENTS = new Set([
  'response.audio_transcript.done',
  'response.output_audio_transcript.done',
  'response.text.done',
  'response.output_text.done',
]);

const ASSISTANT_AUDIO_DELTA_EVENTS = new Set([
  'response.audio.delta',
  'response.output_audio.delta',
]);

const ASSISTANT_AUDIO_DONE_EVENTS = new Set(['response.audio.done', 'response.output_audio.done']);

const DATA_CHANNEL_TIMEOUT_MS = 10000;

const SERVER_VAD_CONFIG = {
  type: 'server_vad',
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 550,
  create_response: true,
  interrupt_response: true,
} as const;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function readNormalizedLevel(analyser: AnalyserNode, binBuffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(binBuffer);
  let sum = 0;
  for (let i = 0; i < binBuffer.length; i++) {
    const normalized = (binBuffer[i] - 128) / 128;
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / binBuffer.length);
  return clamp01((rms - 0.02) / 0.24);
}

export function useVoiceInteraction({
  onFinalTranscript,
  onTurnStart,
  debugEnabled = false,
  transport: providedTransport,
}: UseVoiceInteractionOptions = {}) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);

  // Resolve the transport once per hook instance. In SSR we still want a
  // stable object; the default transport's `isSupported` flag is safe to
  // read pre-mount because it gates on `typeof window`.
  const transport = useMemo(
    () => providedTransport ?? createDefaultRealtimeTransport(),
    [providedTransport]
  );

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const finalBufferRef = useRef('');
  const assistantBufferRef = useRef('');
  const lastFinalizedTranscriptRef = useRef('');
  const isFinalizingTurnRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const remoteDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const smoothedInputRef = useRef(0);
  const smoothedOutputRef = useRef(0);
  const responseInProgressRef = useRef(false);
  const startCancelledRef = useRef(false);
  const isMutedRef = useRef(state.isMuted);
  const voiceStateRef = useRef(state.voiceState);
  const isSpeakingRef = useRef(state.isSpeaking);

  useEffect(() => {
    isMutedRef.current = state.isMuted;
  }, [state.isMuted]);
  useEffect(() => {
    voiceStateRef.current = state.voiceState;
  }, [state.voiceState]);
  useEffect(() => {
    isSpeakingRef.current = state.isSpeaking;
  }, [state.isSpeaking]);

  const isSupported = state.hasMounted && transport.isSupported;

  useEffect(() => {
    dispatch({ type: 'MOUNTED' });
  }, []);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = state.isMuted;
    }
  }, [state.isMuted]);

  const setIsMuted = useCallback((muted: boolean | ((prev: boolean) => boolean)) => {
    dispatch({
      type: 'SET_MUTED',
      muted: typeof muted === 'function' ? muted(isMutedRef.current) : muted,
    });
  }, []);

  const finalizeTurn = useCallback(
    async (transcriptOverride?: string) => {
      if (isFinalizingTurnRef.current) return;
      isFinalizingTurnRef.current = true;

      const raw = (transcriptOverride ?? finalBufferRef.current).trim();
      const cleaned = cleanTranscriptLight(raw);
      finalBufferRef.current = '';
      dispatch({ type: 'USER_TRANSCRIPT_COMMITTED', transcript: '' });

      const trackEnabled = Boolean(audioTrackRef.current?.enabled);

      if (!cleaned || cleaned === lastFinalizedTranscriptRef.current) {
        dispatch({ type: 'SET_STATE', state: trackEnabled ? 'listening' : 'idle' });
        isFinalizingTurnRef.current = false;
        return;
      }

      lastFinalizedTranscriptRef.current = cleaned;
      dispatch({ type: 'USER_FINAL_SET', transcript: cleaned });

      if (!onFinalTranscript) {
        dispatch({ type: 'SET_STATE', state: trackEnabled ? 'listening' : 'idle' });
        isFinalizingTurnRef.current = false;
        return;
      }

      if (voiceStateRef.current !== 'speaking') {
        dispatch({ type: 'SET_STATE', state: 'processing' });
      }

      try {
        await onFinalTranscript({ raw, cleaned });
        if (voiceStateRef.current !== 'speaking') {
          const nextTrackEnabled = Boolean(audioTrackRef.current?.enabled);
          dispatch({ type: 'SET_STATE', state: nextTrackEnabled ? 'listening' : 'idle' });
        }
      } catch {
        dispatch({
          type: 'SET_ERROR',
          error: 'Could not process voice input.',
          state: 'error',
        });
      } finally {
        isFinalizingTurnRef.current = false;
      }
    },
    [onFinalTranscript]
  );

  const sendRealtimeEvent = useCallback(
    (payload: Record<string, unknown>) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') return;
      const sentType = typeof payload.type === 'string' ? payload.type : null;
      if (sentType && debugEnabled) {
        dispatch({ type: 'DEBUG_PATCH', patch: {}, incrementSent: sentType });
      }
      channel.send(JSON.stringify(payload));
    },
    [debugEnabled]
  );

  const interruptAssistant = useCallback(() => {
    const currentVoiceState = voiceStateRef.current;
    const hasResponseInFlight =
      responseInProgressRef.current ||
      currentVoiceState === 'processing' ||
      currentVoiceState === 'speaking';
    const hasOutputPlayback = isSpeakingRef.current || currentVoiceState === 'speaking';

    if (hasResponseInFlight) {
      sendRealtimeEvent({ type: 'response.cancel' });
    }
    if (hasOutputPlayback) {
      sendRealtimeEvent({ type: 'output_audio_buffer.clear' });
    }

    responseInProgressRef.current = false;
    assistantBufferRef.current = '';
    smoothedOutputRef.current = 0;
    const trackEnabled = Boolean(audioTrackRef.current?.enabled);
    dispatch({ type: 'ASSISTANT_CLEARED', trackEnabled });
  }, [sendRealtimeEvent]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (!event?.type) return;
      if (debugEnabled) {
        dispatch({
          type: 'DEBUG_PATCH',
          patch: {},
          incrementReceived: event.type ?? null,
        });
      }

      if (event.type === 'response.created') {
        responseInProgressRef.current = true;
        const current = voiceStateRef.current;
        if (current !== 'capturing' && current !== 'transcribing' && current !== 'speaking') {
          dispatch({ type: 'SET_STATE', state: 'processing' });
        }
        return;
      }

      if (event.type === 'input_audio_buffer.speech_started') {
        finalBufferRef.current = '';
        assistantBufferRef.current = '';
        lastFinalizedTranscriptRef.current = '';
        smoothedOutputRef.current = 0;
        dispatch({ type: 'USER_TURN_STARTED' });
        onTurnStart?.();
        if (audioTrackRef.current?.enabled) {
          dispatch({ type: 'SET_STATE', state: 'capturing' });
        }
        return;
      }

      if (event.type === 'input_audio_buffer.speech_stopped') {
        if (audioTrackRef.current?.enabled) {
          dispatch({ type: 'SET_STATE', state: 'transcribing' });
        }
        return;
      }

      if (USER_TRANSCRIPT_DELTA_EVENTS.has(event.type)) {
        const delta = event.delta || event.text || '';
        if (delta) {
          finalBufferRef.current = `${finalBufferRef.current}${delta}`;
          dispatch({
            type: 'USER_TRANSCRIPT_DELTA',
            delta,
            trackEnabled: Boolean(audioTrackRef.current?.enabled),
          });
        }
        return;
      }

      if (USER_TRANSCRIPT_DONE_EVENTS.has(event.type)) {
        const transcript = (event.transcript || '').trim();
        const resolvedTranscript = transcript || finalBufferRef.current.trim();
        if (resolvedTranscript) {
          finalBufferRef.current = resolvedTranscript;
          dispatch({ type: 'USER_TRANSCRIPT_COMMITTED', transcript: resolvedTranscript });
          if (audioTrackRef.current?.enabled) {
            void finalizeTurn(resolvedTranscript);
          }
        }
        return;
      }

      if (ASSISTANT_AUDIO_DELTA_EVENTS.has(event.type)) {
        responseInProgressRef.current = true;
        if (!isSpeakingRef.current) dispatch({ type: 'SET_SPEAKING', speaking: true });
        if (voiceStateRef.current !== 'speaking') {
          dispatch({ type: 'SET_STATE', state: 'speaking' });
        }
        return;
      }

      if (ASSISTANT_TRANSCRIPT_DELTA_EVENTS.has(event.type)) {
        const delta = event.delta || event.text || '';
        if (!delta) return;
        responseInProgressRef.current = true;
        assistantBufferRef.current = `${assistantBufferRef.current}${delta}`;
        dispatch({ type: 'ASSISTANT_DELTA', delta });
        return;
      }

      if (ASSISTANT_TRANSCRIPT_DONE_EVENTS.has(event.type)) {
        const transcript = (event.transcript || event.text || '').trim();
        const resolved = transcript || assistantBufferRef.current.trim();
        if (resolved) {
          assistantBufferRef.current = resolved;
        }
        dispatch({ type: 'ASSISTANT_DONE', transcript: resolved });
        return;
      }

      if (ASSISTANT_AUDIO_DONE_EVENTS.has(event.type)) {
        smoothedOutputRef.current = 0;
        dispatch({ type: 'ASSISTANT_AUDIO_DONE' });
        return;
      }

      if (event.type === 'output_audio_buffer.cleared') {
        responseInProgressRef.current = false;
        assistantBufferRef.current = '';
        smoothedOutputRef.current = 0;
        dispatch({
          type: 'ASSISTANT_CLEARED',
          trackEnabled: Boolean(audioTrackRef.current?.enabled),
        });
        return;
      }

      if (event.type === 'response.done') {
        responseInProgressRef.current = false;
        const responseStatus = event.response?.status ?? null;
        const finalizeAssistant = responseStatus !== 'cancelled';
        if (!finalizeAssistant) assistantBufferRef.current = '';
        smoothedOutputRef.current = 0;
        dispatch({
          type: 'RESPONSE_DONE',
          trackEnabled: Boolean(audioTrackRef.current?.enabled),
          finalizeAssistant,
        });
      }
    },
    [debugEnabled, finalizeTurn, onTurnStart]
  );

  const startMeterLoop = useCallback(() => {
    if (meterTimerRef.current !== null) return;
    meterTimerRef.current = window.setInterval(() => {
      const micAnalyser = micAnalyserRef.current;
      const remoteAnalyser = remoteAnalyserRef.current;
      const micData = micDataRef.current;
      const remoteData = remoteDataRef.current;
      const micTrackEnabled = Boolean(audioTrackRef.current?.enabled);

      const rawInput =
        micAnalyser && micData && micTrackEnabled ? readNormalizedLevel(micAnalyser, micData) : 0;
      const rawOutput =
        remoteAnalyser && remoteData && !isMutedRef.current
          ? readNormalizedLevel(remoteAnalyser, remoteData)
          : 0;

      smoothedInputRef.current = smoothedInputRef.current * 0.65 + rawInput * 0.35;
      smoothedOutputRef.current = smoothedOutputRef.current * 0.6 + rawOutput * 0.4;

      const nextInput = smoothedInputRef.current < 0.015 ? 0 : smoothedInputRef.current;
      const nextOutput = smoothedOutputRef.current < 0.015 ? 0 : smoothedOutputRef.current;

      dispatch({ type: 'LEVELS_TICK', input: nextInput, output: nextOutput });
    }, 66);
  }, []);

  const stopMeterLoop = useCallback(() => {
    if (meterTimerRef.current !== null) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
  }, []);

  const ensureAudioContext = useCallback(async () => {
    const existing = audioContextRef.current;
    if (existing) {
      if (existing.state === 'suspended') {
        await existing.resume().catch(() => {});
      }
      return existing;
    }
    const ctx = transport.createAudioContext();
    audioContextRef.current = ctx;
    return ctx;
  }, [transport]);

  const attachMicAnalyser = useCallback(
    async (stream: MediaStream) => {
      const ctx = await ensureAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
      micDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      startMeterLoop();
    },
    [ensureAudioContext, startMeterLoop]
  );

  const attachRemoteAnalyser = useCallback(
    async (stream: MediaStream) => {
      const ctx = await ensureAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      remoteAnalyserRef.current = analyser;
      remoteDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      startMeterLoop();
    },
    [ensureAudioContext, startMeterLoop]
  );

  const ensureRealtimeConnection = useCallback(async () => {
    if (!isSupported) return false;
    if (pcRef.current && dataChannelRef.current?.readyState === 'open') {
      dispatch({ type: 'SET_SESSION_READY', ready: true });
      return true;
    }

    dispatch({ type: 'SET_STATE', state: 'requesting_mic' });
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_SESSION_READY', ready: false });

    const stream = await transport.acquireMicrophone();
    streamRef.current = stream;
    await attachMicAnalyser(stream);
    const track = stream.getAudioTracks()[0] ?? null;
    if (!track) throw new Error('No audio track available.');
    track.enabled = false;
    audioTrackRef.current = track;

    dispatch({ type: 'SET_STATE', state: 'connecting_realtime' });

    const sessionData = await transport.createSession(new AbortController().signal);
    const ephemeralKey = sessionData.client_secret?.value;
    if (!ephemeralKey) {
      throw new Error('Realtime session is missing ephemeral key.');
    }

    const pc = transport.createPeerConnection();
    pcRef.current = pc;
    pc.addTrack(track, stream);
    dispatch({
      type: 'DEBUG_PATCH',
      patch: {
        pcConnectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        sessionReady: false,
      },
    });

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        responseInProgressRef.current = false;
        dispatch({ type: 'SET_SESSION_READY', ready: false });
      }
      if (!debugEnabled) return;
      dispatch({ type: 'DEBUG_PATCH', patch: { pcConnectionState: pc.connectionState } });
    };

    pc.oniceconnectionstatechange = () => {
      if (!debugEnabled) return;
      dispatch({ type: 'DEBUG_PATCH', patch: { iceConnectionState: pc.iceConnectionState } });
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (!remoteStream) return;
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = transport.createAudioElement();
      }
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.muted = isMutedRef.current;
      void remoteAudioRef.current.play?.().catch(() => {});
      void attachRemoteAnalyser(remoteStream);
    };

    const channel = pc.createDataChannel('oai-events');
    dataChannelRef.current = channel;
    dispatch({ type: 'DEBUG_PATCH', patch: { dataChannelState: channel.readyState } });

    channel.onmessage = (event) => {
      try {
        handleRealtimeEvent(JSON.parse(event.data) as RealtimeEvent);
      } catch {
        // Ignore malformed events.
      }
    };

    const channelReady = new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        dispatch({ type: 'SET_SESSION_READY', ready: false });
        reject(new Error('Realtime data channel timed out.'));
      }, DATA_CHANNEL_TIMEOUT_MS);
      channel.onopen = () => {
        window.clearTimeout(timeoutId);
        dispatch({
          type: 'DEBUG_PATCH',
          patch: { dataChannelState: channel.readyState },
        });
        dispatch({ type: 'SET_SESSION_READY', ready: true });
        resolve();
      };
      channel.onerror = () => {
        window.clearTimeout(timeoutId);
        responseInProgressRef.current = false;
        dispatch({
          type: 'DEBUG_PATCH',
          patch: { dataChannelState: channel.readyState },
        });
        dispatch({ type: 'SET_SESSION_READY', ready: false });
        reject(new Error('Realtime data channel error.'));
      };
      channel.onclose = () => {
        window.clearTimeout(timeoutId);
        responseInProgressRef.current = false;
        dispatch({
          type: 'DEBUG_PATCH',
          patch: { dataChannelState: channel.readyState },
        });
        dispatch({ type: 'SET_SESSION_READY', ready: false });
      };
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const answerSdp = await transport.negotiateSdp(
      offer.sdp ?? '',
      ephemeralKey,
      new AbortController().signal
    );
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    await channelReady;

    sendRealtimeEvent({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        voice: 'alloy',
        output_audio_format: 'pcm16',
        instructions: REALTIME_VOICE_INSTRUCTIONS,
        turn_detection: SERVER_VAD_CONFIG,
        input_audio_transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'en',
        },
      },
    });

    return true;
  }, [
    attachMicAnalyser,
    attachRemoteAnalyser,
    debugEnabled,
    handleRealtimeEvent,
    isSupported,
    sendRealtimeEvent,
    transport,
  ]);

  const startCapture = useCallback(async () => {
    if (!isSupported) {
      dispatch({
        type: 'SET_ERROR',
        error: 'Voice input is not supported in this browser.',
        state: 'error',
      });
      return;
    }

    try {
      startCancelledRef.current = false;
      const connected = await ensureRealtimeConnection();
      if (!connected) throw new Error('Failed to connect realtime session.');
      const track = audioTrackRef.current;
      if (!track) throw new Error('Audio track unavailable.');
      if (startCancelledRef.current) {
        track.enabled = false;
        dispatch({ type: 'SET_STATE', state: 'idle' });
        return;
      }
      finalBufferRef.current = '';
      lastFinalizedTranscriptRef.current = '';
      assistantBufferRef.current = '';
      smoothedInputRef.current = 0;
      smoothedOutputRef.current = 0;
      dispatch({ type: 'RESET_TRANSCRIPTS' });
      sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
      interruptAssistant();
      track.enabled = true;
      dispatch({ type: 'SET_STATE', state: 'listening' });
    } catch {
      dispatch({
        type: 'SET_ERROR',
        error: 'Could not start voice capture.',
        state: 'error',
      });
      dispatch({ type: 'SET_SESSION_READY', ready: false });
    }
  }, [ensureRealtimeConnection, interruptAssistant, isSupported, sendRealtimeEvent]);

  const stopCapture = useCallback(() => {
    startCancelledRef.current = true;
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = false;
    }
    sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
    interruptAssistant();
    finalBufferRef.current = '';
    assistantBufferRef.current = '';
    lastFinalizedTranscriptRef.current = '';
    responseInProgressRef.current = false;
    smoothedInputRef.current = 0;
    smoothedOutputRef.current = 0;
    dispatch({ type: 'RESET_TRANSCRIPTS' });
    dispatch({ type: 'SET_STATE', state: 'idle' });
    dispatch({
      type: 'SET_SESSION_READY',
      ready: Boolean(dataChannelRef.current && dataChannelRef.current.readyState === 'open'),
    });
  }, [interruptAssistant, sendRealtimeEvent]);

  const cancelCapture = useCallback(() => {
    stopCapture();
  }, [stopCapture]);

  const stopSpeaking = useCallback(() => {
    interruptAssistant();
  }, [interruptAssistant]);

  useEffect(() => {
    return () => {
      stopMeterLoop();
      dataChannelRef.current?.close();
      dataChannelRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      audioTrackRef.current = null;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause?.();
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current = null;
      }
      micAnalyserRef.current = null;
      remoteAnalyserRef.current = null;
      micDataRef.current = null;
      remoteDataRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      responseInProgressRef.current = false;
      startCancelledRef.current = false;
      dispatch({ type: 'CLEANUP' });
    };
  }, [stopMeterLoop]);

  return {
    isSupported,
    sessionReady: state.sessionReady,
    voiceState: state.voiceState,
    isSpeaking: state.isSpeaking,
    isMuted: state.isMuted,
    setIsMuted: setIsMuted as Dispatch<SetStateAction<boolean>>,
    partialTranscript: state.partialTranscript,
    finalTranscript: state.finalTranscript,
    assistantPartialTranscript: state.assistantPartialTranscript,
    assistantFinalTranscript: state.assistantFinalTranscript,
    error: state.error,
    debug: state.debug,
    inputLevel: state.inputLevel,
    outputLevel: state.outputLevel,
    startCapture,
    stopCapture,
    cancelCapture,
    stopSpeaking,
  };
}
