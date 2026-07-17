'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  OPENAI_REALTIME_DATA_CHANNEL_TIMEOUT_MS,
  OPENAI_REALTIME_SDP_TIMEOUT_MS,
  OPENAI_REALTIME_SDP_URL,
  OPENAI_REALTIME_SESSION_TIMEOUT_MS,
  OPENAI_SPEECH_PCM_SAMPLE_RATE,
} from '@/lib/ai/openai-config';
import {
  createPcm16LeDecodeState,
  decodePcm16LeChunk,
  hasPendingPcm16LeByte,
} from '@/lib/ai/pcm-stream';
import type { StructuredResponse } from '@/lib/ai/response-schema';
import { getCanonicalSpeechText } from '@/lib/ai/voice-presentation';
import { cleanTranscriptLight } from '@/lib/ai/transcript-utils';
import {
  buildTeardownVoiceDebugInfo,
  canAcceptVoiceTurnEvent,
  canReuseRealtimeConnection,
  canStartVoiceInputTurn,
  completeVoiceTurn,
  createVoiceStartAttempt,
  createInitialVoiceDebugInfo,
  createVoiceTeardownSnapshot,
  createVoiceTurnTracker,
  decodeRealtimeVoiceEvent,
  decodeRealtimeSessionSecret,
  getVoiceMuteAction,
  invalidateVoiceTurn,
  isActiveVoiceStartAttempt,
  isActiveVoiceTurn,
  resolveCompletedVoiceTranscript,
  shouldIgnoreVoiceStartFailure,
  startVoiceTurn,
  trySendRealtimeEvent,
  type VoiceDebugInfo,
  type RealtimeVoiceEvent,
  type VoiceStartAttempt,
} from './voice-realtime-state';
export type { VoiceDebugInfo } from './voice-realtime-state';

export type VoiceState =
  | 'idle'
  | 'requesting_mic'
  | 'connecting_realtime'
  | 'listening'
  | 'capturing'
  | 'transcribing'
  | 'processing'
  | 'speaking'
  | 'error';

type UseVoiceInteractionOptions = {
  onFinalTranscript?: (payload: {
    raw: string;
    cleaned: string;
  }) => StructuredResponse | null | Promise<StructuredResponse | null>;
  onTurnStart?: () => void;
  debugEnabled?: boolean;
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

const PCM_PLAYBACK_START_BUFFER_SECONDS = 0.08;
const PCM_PLAYBACK_MIN_LEAD_SECONDS = 0.02;

function subscribeToClientSnapshot() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function safelyCleanup(cleanup: () => void): void {
  try {
    cleanup();
  } catch {
    // Cleanup is best-effort; one browser resource must not block the others.
  }
}

function readNormalizedLevel(analyser: AnalyserNode, binBuffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(binBuffer);
  let sum = 0;
  for (let i = 0; i < binBuffer.length; i++) {
    const normalized = (binBuffer[i] - 128) / 128;
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / binBuffer.length);
  // Gate room noise and compress into a stable 0-1 range.
  return clamp01((rms - 0.02) / 0.24);
}

export function useVoiceInteraction({
  onFinalTranscript,
  onTurnStart,
  debugEnabled = false,
}: UseVoiceInteractionOptions = {}) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [assistantPartialTranscript, setAssistantPartialTranscript] = useState('');
  const [assistantFinalTranscript, setAssistantFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [speechWarning, setSpeechWarning] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMicMuted, setIsMicMutedState] = useState(false);
  const isMicMutedRef = useRef(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const [debug, setDebug] = useState<VoiceDebugInfo>(createInitialVoiceDebugInfo);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const speechControllerRef = useRef<AbortController | null>(null);
  const speechSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const speechPlaybackTimerRef = useRef<number | null>(null);
  const speechItemIdRef = useRef<string | null>(null);
  const turnTrackerRef = useRef(createVoiceTurnTracker());
  const finalBufferRef = useRef('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const disconnectTimerRef = useRef<number | null>(null);
  const smoothedInputRef = useRef(0);
  const startAttemptRef = useRef<VoiceStartAttempt | null>(null);
  const handleRealtimeEventRef = useRef<(event: RealtimeVoiceEvent) => void>(() => {});
  const hasMounted = useSyncExternalStore(
    subscribeToClientSnapshot,
    getClientSnapshot,
    getServerSnapshot
  );

  const isSupported =
    hasMounted &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const ensureAudioContext = useCallback(async () => {
    const existing = audioContextRef.current;
    if (existing) {
      if (existing.state === 'suspended') {
        await existing.resume().catch(() => {});
      }
      return existing;
    }
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    return ctx;
  }, []);

  const stopSpeechPlayback = useCallback((restoreVoiceState = true) => {
    speechControllerRef.current?.abort();
    speechControllerRef.current = null;
    speechItemIdRef.current = null;

    if (speechPlaybackTimerRef.current !== null) {
      window.clearTimeout(speechPlaybackTimerRef.current);
      speechPlaybackTimerRef.current = null;
    }
    speechSourcesRef.current.forEach((source) => {
      source.onended = null;
      safelyCleanup(() => source.stop());
      safelyCleanup(() => source.disconnect());
    });
    speechSourcesRef.current.clear();

    setAssistantPartialTranscript('');
    setIsSpeaking(false);
    setOutputLevel(0);
    if (restoreVoiceState) {
      setVoiceState((previous) => {
        if (previous === 'capturing' || previous === 'transcribing') return previous;
        return audioTrackRef.current?.enabled ? 'listening' : 'idle';
      });
    }
  }, []);

  const playSpeechForTurn = useCallback(
    async (itemId: string, structured: StructuredResponse): Promise<boolean> => {
      const speechText = getCanonicalSpeechText(structured);
      if (!speechText || !isActiveVoiceTurn(turnTrackerRef.current, itemId)) return false;

      stopSpeechPlayback(false);
      const controller = new AbortController();
      speechControllerRef.current = controller;
      speechItemIdRef.current = itemId;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        const response = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: speechText }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Speech request failed.');
        if (!response.body) throw new Error('Speech response was empty.');

        const sampleRate = Number(response.headers.get('x-audio-sample-rate'));
        if (sampleRate !== OPENAI_SPEECH_PCM_SAMPLE_RATE) {
          throw new Error('Speech response sample rate was invalid.');
        }

        const audioContext = await ensureAudioContext();
        if (
          controller.signal.aborted ||
          speechControllerRef.current !== controller ||
          !isActiveVoiceTurn(turnTrackerRef.current, itemId)
        ) {
          return false;
        }

        reader = response.body.getReader();
        const decoderState = createPcm16LeDecodeState();
        let scheduledEnd = audioContext.currentTime;
        let playbackStarted = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (
            controller.signal.aborted ||
            speechControllerRef.current !== controller ||
            !isActiveVoiceTurn(turnTrackerRef.current, itemId)
          ) {
            return false;
          }

          const samples = decodePcm16LeChunk(value, decoderState);
          if (samples.length === 0) continue;

          const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
          audioBuffer.copyToChannel(samples, 0);
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          speechSourcesRef.current.add(source);
          source.onended = () => {
            speechSourcesRef.current.delete(source);
            safelyCleanup(() => source.disconnect());
          };

          const minimumStart =
            audioContext.currentTime +
            (playbackStarted ? PCM_PLAYBACK_MIN_LEAD_SECONDS : PCM_PLAYBACK_START_BUFFER_SECONDS);
          const startsAt = Math.max(scheduledEnd, minimumStart);
          source.start(startsAt);
          scheduledEnd = startsAt + audioBuffer.duration;

          if (!playbackStarted) {
            playbackStarted = true;
            setAssistantFinalTranscript(speechText);
            setAssistantPartialTranscript('');
            setIsSpeaking(true);
            setOutputLevel(0.55);
            setVoiceState('speaking');
          }
        }

        if (!playbackStarted || hasPendingPcm16LeByte(decoderState)) {
          throw new Error('Speech response contained invalid PCM audio.');
        }

        await new Promise<void>((resolve, reject) => {
          const handleAbort = () => {
            reject(new DOMException('Speech cancelled.', 'AbortError'));
          };
          const remainingMs = Math.max(0, (scheduledEnd - audioContext.currentTime) * 1000);
          speechPlaybackTimerRef.current = window.setTimeout(() => {
            speechPlaybackTimerRef.current = null;
            controller.signal.removeEventListener('abort', handleAbort);
            resolve();
          }, remainingMs);
          controller.signal.addEventListener('abort', handleAbort, { once: true });
          if (controller.signal.aborted) handleAbort();
        });
        return true;
      } catch {
        if (!controller.signal.aborted && isActiveVoiceTurn(turnTrackerRef.current, itemId)) {
          setSpeechWarning('The answer is ready, but speech playback was unavailable.');
        }
        return false;
      } finally {
        if (reader && controller.signal.aborted) {
          void reader.cancel().catch(() => {});
        }
        if (speechControllerRef.current === controller) {
          stopSpeechPlayback(false);
          if (isActiveVoiceTurn(turnTrackerRef.current, itemId)) {
            setVoiceState(audioTrackRef.current?.enabled ? 'listening' : 'idle');
          }
        }
      }
    },
    [ensureAudioContext, stopSpeechPlayback]
  );

  const finalizeTurn = useCallback(
    async (itemId: string, transcriptOverride?: string) => {
      if (!isActiveVoiceTurn(turnTrackerRef.current, itemId)) return;

      const raw = (transcriptOverride ?? finalBufferRef.current).trim();
      const cleaned = cleanTranscriptLight(raw);
      finalBufferRef.current = '';
      setPartialTranscript('');

      if (!cleaned) {
        setVoiceState(audioTrackRef.current?.enabled ? 'listening' : 'idle');
        return;
      }

      setFinalTranscript(cleaned);
      if (!onFinalTranscript) {
        setVoiceState(audioTrackRef.current?.enabled ? 'listening' : 'idle');
        return;
      }

      setVoiceState('processing');
      try {
        const structured = await onFinalTranscript({ raw, cleaned });
        if (!structured || !isActiveVoiceTurn(turnTrackerRef.current, itemId)) {
          if (isActiveVoiceTurn(turnTrackerRef.current, itemId)) {
            setVoiceState(audioTrackRef.current?.enabled ? 'listening' : 'idle');
          }
          return;
        }
        const played = await playSpeechForTurn(itemId, structured);
        if (!played && isActiveVoiceTurn(turnTrackerRef.current, itemId)) {
          setVoiceState(audioTrackRef.current?.enabled ? 'listening' : 'idle');
        }
      } catch {
        if (!isActiveVoiceTurn(turnTrackerRef.current, itemId)) return;
        setVoiceState('error');
        setError('Could not process voice input.');
      }
    },
    [onFinalTranscript, playSpeechForTurn]
  );

  const fetchWithTimeout = useCallback(
    async (url: string, init: RequestInit, timeoutMs: number) => {
      const controller = new AbortController();
      const parentSignal = init.signal;
      const abortFromParent = () => controller.abort();
      if (parentSignal?.aborted) controller.abort();
      else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        return response;
      } finally {
        window.clearTimeout(timeoutId);
        parentSignal?.removeEventListener('abort', abortFromParent);
      }
    },
    []
  );

  const sendRealtimeEvent = useCallback(
    (payload: Record<string, unknown>): boolean => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') return false;
      const sentType = typeof payload.type === 'string' ? payload.type : null;
      if (sentType && debugEnabled) {
        setDebug((prev) => ({
          ...prev,
          sentEventCount: prev.sentEventCount + 1,
          lastSentEvent: sentType,
        }));
      }
      return trySendRealtimeEvent(channel, payload);
    },
    [debugEnabled]
  );

  const setIsMuted = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextValue) => {
      const previousValue = isMicMutedRef.current;
      const nextMuted =
        typeof nextValue === 'function'
          ? (nextValue as (value: boolean) => boolean)(previousValue)
          : nextValue;
      if (nextMuted === previousValue) return;

      isMicMutedRef.current = nextMuted;
      setIsMicMutedState(nextMuted);

      const track = audioTrackRef.current;
      if (nextMuted) {
        if (track) track.enabled = false;
        sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
        smoothedInputRef.current = 0;
        setInputLevel(0);

        // The mute button owns microphone input only. Discard an unfinished
        // utterance, but let an already-processing answer and local TTS finish.
        const muteAction = getVoiceMuteAction(voiceState);
        if (muteAction === 'discard-input') {
          invalidateVoiceTurn(turnTrackerRef.current);
          finalBufferRef.current = '';
          setPartialTranscript('');
          setFinalTranscript('');
          setVoiceState('idle');
        } else if (muteAction === 'go-idle') {
          setVoiceState('idle');
        }
      } else if (
        track &&
        canReuseRealtimeConnection(
          pcRef.current?.connectionState,
          dataChannelRef.current?.readyState,
          track.readyState
        )
      ) {
        track.enabled = true;
        setVoiceState((prev) => (prev === 'idle' || prev === 'error' ? 'listening' : prev));
      }
    },
    [sendRealtimeEvent, voiceState]
  );

  const interruptAssistant = useCallback(() => {
    stopSpeechPlayback();
  }, [stopSpeechPlayback]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeVoiceEvent) => {
      if (!event?.type) return;
      if (debugEnabled) {
        setDebug((prev) => ({
          ...prev,
          receivedEventCount: prev.receivedEventCount + 1,
          lastReceivedEvent: event.type ?? null,
          lastEvents: [event.type!, ...prev.lastEvents].slice(0, 12),
        }));
      }

      if (event.type === 'error') {
        // A Realtime event error belongs to the transcription transport. Local
        // TTS playback has separate ownership and must not be stopped or visually
        // marked idle by an unrelated, recoverable transport event. Fatal
        // transport failures are handled by the peer/data-channel callbacks.
        return;
      }

      if (event.type === 'input_audio_buffer.speech_started') {
        if (
          !canStartVoiceInputTurn(isMicMutedRef.current, Boolean(audioTrackRef.current?.enabled))
        ) {
          return;
        }
        if (!startVoiceTurn(turnTrackerRef.current, event.item_id)) return;
        stopSpeechPlayback(false);
        finalBufferRef.current = '';
        setPartialTranscript('');
        setFinalTranscript('');
        setAssistantPartialTranscript('');
        setAssistantFinalTranscript('');
        setIsSpeaking(false);
        setOutputLevel(0);
        setError(null);
        setSpeechWarning(null);
        onTurnStart?.();
        if (audioTrackRef.current?.enabled) {
          setVoiceState('capturing');
        }
        return;
      }

      if (event.type === 'input_audio_buffer.speech_stopped') {
        if (!canAcceptVoiceTurnEvent(turnTrackerRef.current, event.item_id)) return;
        if (audioTrackRef.current?.enabled) {
          setVoiceState('transcribing');
        }
        return;
      }

      if (USER_TRANSCRIPT_DELTA_EVENTS.has(event.type)) {
        if (!canAcceptVoiceTurnEvent(turnTrackerRef.current, event.item_id)) return;
        const delta = event.delta || event.text || '';
        if (delta) {
          // Keep a functional transcript buffer even when debug transcript UI is disabled.
          finalBufferRef.current = `${finalBufferRef.current}${delta}`;
          if (audioTrackRef.current?.enabled) {
            setVoiceState((prev) => (prev === 'capturing' ? prev : 'capturing'));
          }
          setPartialTranscript((prev) => `${prev}${delta}`);
        }
        return;
      }

      if (USER_TRANSCRIPT_DONE_EVENTS.has(event.type)) {
        if (!completeVoiceTurn(turnTrackerRef.current, event.item_id) || !event.item_id) return;
        const resolvedTranscript = resolveCompletedVoiceTranscript(
          event.transcript,
          finalBufferRef.current
        );
        if (resolvedTranscript) {
          finalBufferRef.current = resolvedTranscript;
          setPartialTranscript(resolvedTranscript);
          if (audioTrackRef.current?.enabled) {
            void finalizeTurn(event.item_id, resolvedTranscript);
          }
        } else {
          // VAD can occasionally produce an empty ambient-noise turn. It is not
          // actionable for the user, so return to listening without a stale alert.
          finalBufferRef.current = '';
          setPartialTranscript('');
          setError(null);
          setVoiceState(audioTrackRef.current?.enabled ? 'listening' : 'idle');
        }
        return;
      }

      if (event.type === 'conversation.item.input_audio_transcription.failed') {
        if (!completeVoiceTurn(turnTrackerRef.current, event.item_id)) return;
        finalBufferRef.current = '';
        setPartialTranscript('');
        setAssistantPartialTranscript('');
        setError('I could not transcribe that turn. Please try again.');
        setVoiceState(audioTrackRef.current?.enabled ? 'listening' : 'idle');
      }
    },
    [debugEnabled, finalizeTurn, onTurnStart, stopSpeechPlayback]
  );

  useEffect(() => {
    handleRealtimeEventRef.current = handleRealtimeEvent;
  }, [handleRealtimeEvent]);

  const startMeterLoop = useCallback(() => {
    if (meterTimerRef.current !== null) return;
    meterTimerRef.current = window.setInterval(() => {
      const micAnalyser = micAnalyserRef.current;
      const micData = micDataRef.current;
      const micTrackEnabled = Boolean(audioTrackRef.current?.enabled);

      const rawInput =
        micAnalyser && micData && micTrackEnabled ? readNormalizedLevel(micAnalyser, micData) : 0;

      smoothedInputRef.current = smoothedInputRef.current * 0.65 + rawInput * 0.35;

      const nextInput = smoothedInputRef.current < 0.015 ? 0 : smoothedInputRef.current;

      setInputLevel((prev) => (Math.abs(prev - nextInput) > 0.012 ? nextInput : prev));
    }, 66);
  }, []);

  const stopMeterLoop = useCallback(() => {
    if (meterTimerRef.current !== null) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
  }, []);

  const attachMicAnalyser = useCallback(
    async (stream: MediaStream, isCurrent: () => boolean) => {
      const ctx = await ensureAudioContext();
      if (!isCurrent()) return false;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
      micDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      startMeterLoop();
      return true;
    },
    [ensureAudioContext, startMeterLoop]
  );

  const teardownRealtimeSession = useCallback(
    ({ resetDebugCounters = false }: { resetDebugCounters?: boolean } = {}) => {
      stopMeterLoop();
      if (disconnectTimerRef.current !== null) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      stopSpeechPlayback(false);
      invalidateVoiceTurn(turnTrackerRef.current);

      const dataChannel = dataChannelRef.current;
      dataChannelRef.current = null;
      if (dataChannel) safelyCleanup(() => dataChannel.close());

      const peerConnection = pcRef.current;
      pcRef.current = null;
      if (peerConnection) safelyCleanup(() => peerConnection.close());

      streamRef.current?.getTracks().forEach((track) => {
        track.onended = null;
        safelyCleanup(() => track.stop());
      });
      streamRef.current = null;
      audioTrackRef.current = null;

      micAnalyserRef.current = null;
      micDataRef.current = null;

      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      finalBufferRef.current = '';

      smoothedInputRef.current = 0;
      const clearedState = createVoiceTeardownSnapshot();
      setInputLevel(0);
      setOutputLevel(0);
      setPartialTranscript(clearedState.partialTranscript);
      setFinalTranscript(clearedState.finalTranscript);
      setAssistantPartialTranscript(clearedState.assistantPartialTranscript);
      setAssistantFinalTranscript(clearedState.assistantFinalTranscript);
      setIsSpeaking(clearedState.isSpeaking);
      setSessionReady(clearedState.sessionReady);

      setDebug((prev) => buildTeardownVoiceDebugInfo(prev, { resetDebugCounters }));
      setSpeechWarning(null);
    },
    [stopMeterLoop, stopSpeechPlayback]
  );

  const ensureRealtimeConnection = useCallback(
    async (attempt: VoiceStartAttempt) => {
      const isCurrent = () => isActiveVoiceStartAttempt(startAttemptRef.current, attempt);
      if (!isSupported || !isCurrent()) return false;
      if (
        canReuseRealtimeConnection(
          pcRef.current?.connectionState,
          dataChannelRef.current?.readyState,
          audioTrackRef.current?.readyState
        )
      ) {
        setSessionReady(true);
        setDebug((prev) => ({ ...prev, sessionReady: true }));
        return true;
      }
      if (pcRef.current || dataChannelRef.current || streamRef.current) {
        teardownRealtimeSession();
      }

      setVoiceState('requesting_mic');
      setError(null);
      setSpeechWarning(null);
      setSessionReady(false);
      setDebug((prev) => ({ ...prev, sessionReady: false }));

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      streamRef.current = stream;
      const analyserAttached = await attachMicAnalyser(stream, isCurrent);
      if (!isCurrent() || !analyserAttached) {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) {
          streamRef.current = null;
          audioTrackRef.current = null;
        }
        return false;
      }
      const track = stream.getAudioTracks()[0] ?? null;
      if (!track) throw new Error('No audio track available.');
      track.enabled = false;
      audioTrackRef.current = track;
      track.onended = () => {
        if (audioTrackRef.current !== track) return;
        const activeAttempt = startAttemptRef.current;
        startAttemptRef.current = null;
        activeAttempt?.controller.abort();
        teardownRealtimeSession();
        setVoiceState('error');
        setError('Microphone disconnected. Please reconnect it and try again.');
      };

      setVoiceState('connecting_realtime');

      const sessionRes = await fetchWithTimeout(
        '/api/realtime/session',
        { method: 'POST', signal: attempt.controller.signal },
        OPENAI_REALTIME_SESSION_TIMEOUT_MS
      );
      if (!isCurrent()) {
        await sessionRes.body?.cancel();
        return false;
      }
      if (!sessionRes.ok) {
        throw new Error('Could not create realtime session.');
      }
      const sessionData: unknown = await sessionRes.json().catch(() => null);
      if (!isCurrent()) return false;
      const ephemeralKey = decodeRealtimeSessionSecret(sessionData);
      if (!ephemeralKey) {
        throw new Error('Realtime session is missing ephemeral key.');
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.addTrack(track, stream);
      setDebug((prev) => ({
        ...prev,
        pcConnectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        sessionReady: false,
      }));

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (disconnectTimerRef.current !== null && pc.connectionState !== 'disconnected') {
          window.clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          teardownRealtimeSession();
          setVoiceState('error');
          setError('Realtime voice connection failed. Please try again.');
          return;
        }
        if (pc.connectionState === 'disconnected' && disconnectTimerRef.current === null) {
          disconnectTimerRef.current = window.setTimeout(() => {
            disconnectTimerRef.current = null;
            if (pcRef.current !== pc || pc.connectionState !== 'disconnected') return;
            teardownRealtimeSession();
            setVoiceState('error');
            setError('Realtime voice connection was lost. Please try again.');
          }, 5_000);
        }
        if (!debugEnabled) return;
        setDebug((prev) => ({ ...prev, pcConnectionState: pc.connectionState }));
      };

      pc.oniceconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (!debugEnabled) return;
        setDebug((prev) => ({ ...prev, iceConnectionState: pc.iceConnectionState }));
      };

      const channel = pc.createDataChannel('oai-events');
      dataChannelRef.current = channel;
      setDebug((prev) => ({ ...prev, dataChannelState: channel.readyState }));

      channel.onmessage = (event) => {
        if (dataChannelRef.current !== channel) return;
        try {
          const decoded = decodeRealtimeVoiceEvent(JSON.parse(event.data) as unknown);
          if (decoded) handleRealtimeEventRef.current(decoded);
        } catch {
          // Ignore malformed events.
        }
      };

      let channelEstablished = false;
      const channelReady = new Promise<void>((resolve, reject) => {
        const abortError = () => new DOMException('Voice startup cancelled.', 'AbortError');
        const clearWaiters = () => {
          window.clearTimeout(timeoutId);
          attempt.controller.signal.removeEventListener('abort', handleAbort);
        };
        const handleAbort = () => {
          clearWaiters();
          reject(abortError());
        };
        const timeoutId = window.setTimeout(() => {
          clearWaiters();
          if (!isCurrent()) {
            reject(abortError());
            return;
          }
          setSessionReady(false);
          setDebug((prev) => ({ ...prev, sessionReady: false }));
          reject(new Error('Realtime data channel timed out.'));
        }, OPENAI_REALTIME_DATA_CHANNEL_TIMEOUT_MS);
        attempt.controller.signal.addEventListener('abort', handleAbort, { once: true });
        if (attempt.controller.signal.aborted) {
          handleAbort();
          return;
        }
        channel.onopen = () => {
          clearWaiters();
          if (!isCurrent()) {
            reject(abortError());
            return;
          }
          setSessionReady(true);
          setDebug((prev) => ({
            ...prev,
            dataChannelState: channel.readyState,
            sessionReady: true,
          }));
          channelEstablished = true;
          resolve();
        };
        channel.onerror = () => {
          clearWaiters();
          if (dataChannelRef.current !== channel || (!channelEstablished && !isCurrent())) {
            reject(abortError());
            return;
          }
          teardownRealtimeSession();
          setVoiceState('error');
          setError('Realtime voice connection failed. Please try again.');
          reject(new Error('Realtime data channel error.'));
        };
        channel.onclose = () => {
          clearWaiters();
          if (dataChannelRef.current !== channel || (!channelEstablished && !isCurrent())) {
            reject(abortError());
            return;
          }
          teardownRealtimeSession();
          setVoiceState('error');
          setError('Realtime voice connection closed. Please try again.');
          reject(new Error('Realtime data channel closed.'));
        };
      });
      // Avoid an unhandled rejection if SDP setup fails before this promise is awaited.
      void channelReady.catch(() => {});

      const offer = await pc.createOffer();
      if (!isCurrent()) return false;
      await pc.setLocalDescription(offer);
      if (!isCurrent()) return false;

      const sdpRes = await fetchWithTimeout(
        OPENAI_REALTIME_SDP_URL,
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
          signal: attempt.controller.signal,
        },
        OPENAI_REALTIME_SDP_TIMEOUT_MS
      );

      if (!isCurrent()) {
        await sdpRes.body?.cancel();
        return false;
      }
      if (!sdpRes.ok) {
        throw new Error('Realtime SDP negotiation failed.');
      }

      const answerSdp = await sdpRes.text();
      if (!isCurrent()) return false;
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });
      if (!isCurrent()) return false;

      await channelReady;

      return isCurrent();
    },
    [attachMicAnalyser, debugEnabled, fetchWithTimeout, isSupported, teardownRealtimeSession]
  );

  const startCapture = useCallback(async () => {
    if (!isSupported) {
      setVoiceState('error');
      setError('Voice input is not supported in this browser.');
      return;
    }

    startAttemptRef.current?.controller.abort();
    const attempt = createVoiceStartAttempt();
    startAttemptRef.current = attempt;

    try {
      const connected = await ensureRealtimeConnection(attempt);
      if (!isActiveVoiceStartAttempt(startAttemptRef.current, attempt)) return;
      if (!connected) throw new Error('Failed to connect realtime session.');
      const track = audioTrackRef.current;
      if (!track) throw new Error('Audio track unavailable.');
      invalidateVoiceTurn(turnTrackerRef.current);
      finalBufferRef.current = '';
      setFinalTranscript('');
      setPartialTranscript('');
      setAssistantPartialTranscript('');
      setAssistantFinalTranscript('');
      setError(null);
      setSpeechWarning(null);
      smoothedInputRef.current = 0;
      setInputLevel(0);
      setOutputLevel(0);
      sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
      interruptAssistant();
      const shouldRemainMuted = isMicMutedRef.current;
      track.enabled = !shouldRemainMuted;
      setVoiceState(shouldRemainMuted ? 'idle' : 'listening');
    } catch {
      if (shouldIgnoreVoiceStartFailure(startAttemptRef.current, attempt)) return;
      teardownRealtimeSession();
      setVoiceState('error');
      setError('Could not start voice capture.');
      setSessionReady(false);
      setDebug((prev) => ({ ...prev, sessionReady: false }));
    } finally {
      if (startAttemptRef.current === attempt) {
        startAttemptRef.current = null;
      }
    }
  }, [
    ensureRealtimeConnection,
    interruptAssistant,
    isSupported,
    sendRealtimeEvent,
    teardownRealtimeSession,
  ]);

  const stopCapture = useCallback(() => {
    const activeAttempt = startAttemptRef.current;
    startAttemptRef.current = null;
    activeAttempt?.controller.abort();
    try {
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = false;
      }
      sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
      interruptAssistant();
    } finally {
      teardownRealtimeSession();
      setError(null);
      setSpeechWarning(null);
      setVoiceState('idle');
    }
  }, [interruptAssistant, sendRealtimeEvent, teardownRealtimeSession]);

  const cancelCapture = useCallback(() => {
    stopCapture();
  }, [stopCapture]);

  const stopSpeaking = useCallback(() => {
    interruptAssistant();
  }, [interruptAssistant]);

  useEffect(() => {
    const stopForPrivacy = () => stopCapture();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stopForPrivacy();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopForPrivacy);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', stopForPrivacy);
    };
  }, [stopCapture]);

  useEffect(() => {
    return () => {
      startAttemptRef.current?.controller.abort();
      startAttemptRef.current = null;
      teardownRealtimeSession({ resetDebugCounters: true });
    };
  }, [teardownRealtimeSession]);

  return {
    isSupported,
    sessionReady,
    voiceState,
    isSpeaking,
    isMuted: isMicMuted,
    setIsMuted,
    partialTranscript,
    finalTranscript,
    assistantPartialTranscript,
    assistantFinalTranscript,
    error,
    speechWarning,
    debug,
    inputLevel,
    outputLevel,
    startCapture,
    stopCapture,
    cancelCapture,
    stopSpeaking,
  };
}
