'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanTranscriptLight } from '@/lib/ai/transcript-utils';

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
  onFinalTranscript?: (payload: { raw: string; cleaned: string }) => void | Promise<void>;
  onTurnStart?: () => void;
  debugEnabled?: boolean;
};

type RealtimeSessionResponse = {
  client_secret?: {
    value?: string;
  };
};

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  text?: string;
  response?: {
    status?: string;
  };
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

const REALTIME_REPLY_INSTRUCTIONS =
  'You are Clitronic, a voice-first electronics assistant. Always answer in English only, even if the user mixes languages. Reply in plain spoken language, 1-2 short sentences, practical and concise. Prioritize safety warnings first when relevant. If the user asks to show, see, picture, image, or photo of something, say that you are showing it on screen now. Only answer electronics/hardware topics; for off-topic requests, briefly say you can only help with electronics.';
const REALTIME_SESSION_TIMEOUT_MS = 12000;
const REALTIME_SDP_TIMEOUT_MS = 15000;
const DATA_CHANNEL_TIMEOUT_MS = 10000;

const SERVER_VAD_CONFIG = {
  type: 'server_vad',
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 550,
  create_response: true,
  interrupt_response: true,
} as const;

export type VoiceDebugInfo = {
  transport: 'openai-realtime-webrtc';
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
  const [hasMounted, setHasMounted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const [debug, setDebug] = useState<VoiceDebugInfo>({
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
  });

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

  const isSupported =
    hasMounted &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = isMuted;
    }
    if (isMuted && isSpeaking) {
      setIsSpeaking(false);
    }
  }, [isMuted, isSpeaking]);

  const finalizeTurn = useCallback(
    async (transcriptOverride?: string) => {
      if (isFinalizingTurnRef.current) return;
      isFinalizingTurnRef.current = true;

      const raw = (transcriptOverride ?? finalBufferRef.current).trim();
      const cleaned = cleanTranscriptLight(raw);
      finalBufferRef.current = '';
      setPartialTranscript('');

      if (!cleaned) {
        const isTrackEnabled = Boolean(audioTrackRef.current?.enabled);
        setVoiceState(isTrackEnabled ? 'listening' : 'idle');
        isFinalizingTurnRef.current = false;
        return;
      }

      if (cleaned === lastFinalizedTranscriptRef.current) {
        const isTrackEnabled = Boolean(audioTrackRef.current?.enabled);
        setVoiceState(isTrackEnabled ? 'listening' : 'idle');
        isFinalizingTurnRef.current = false;
        return;
      }

      lastFinalizedTranscriptRef.current = cleaned;
      setFinalTranscript(cleaned);

      if (!onFinalTranscript) {
        const isTrackEnabled = Boolean(audioTrackRef.current?.enabled);
        setVoiceState(isTrackEnabled ? 'listening' : 'idle');
        isFinalizingTurnRef.current = false;
        return;
      }

      setVoiceState((prev) => (prev === 'speaking' ? prev : 'processing'));

      try {
        await onFinalTranscript({ raw, cleaned });
        setVoiceState((prev) => {
          if (prev === 'speaking') return prev;
          const isTrackEnabled = Boolean(audioTrackRef.current?.enabled);
          return isTrackEnabled ? 'listening' : 'idle';
        });
      } catch {
        setVoiceState('error');
        setError('Could not process voice input.');
      } finally {
        isFinalizingTurnRef.current = false;
      }
    },
    [onFinalTranscript]
  );

  const fetchWithTimeout = useCallback(
    async (url: string, init: RequestInit, timeoutMs: number) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        return response;
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    []
  );

  const sendRealtimeEvent = useCallback(
    (payload: Record<string, unknown>) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') return;
      const sentType = typeof payload.type === 'string' ? payload.type : null;
      if (sentType && debugEnabled) {
        setDebug((prev) => ({
          ...prev,
          sentEventCount: prev.sentEventCount + 1,
          lastSentEvent: sentType,
        }));
      }
      channel.send(JSON.stringify(payload));
    },
    [debugEnabled]
  );

  const interruptAssistant = useCallback(() => {
    const hasResponseInFlight =
      responseInProgressRef.current || voiceState === 'processing' || voiceState === 'speaking';
    const hasOutputPlayback = isSpeaking || voiceState === 'speaking';

    if (hasResponseInFlight) {
      sendRealtimeEvent({ type: 'response.cancel' });
    }
    if (hasOutputPlayback) {
      sendRealtimeEvent({ type: 'output_audio_buffer.clear' });
    }

    responseInProgressRef.current = false;
    assistantBufferRef.current = '';
    setAssistantPartialTranscript('');
    setIsSpeaking(false);
    smoothedOutputRef.current = 0;
    setOutputLevel(0);
    setVoiceState((prev) => {
      if (prev === 'capturing' || prev === 'transcribing') return prev;
      return audioTrackRef.current?.enabled ? 'listening' : 'idle';
    });
  }, [isSpeaking, sendRealtimeEvent, voiceState]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (!event?.type) return;
      if (debugEnabled) {
        setDebug((prev) => ({
          ...prev,
          receivedEventCount: prev.receivedEventCount + 1,
          lastReceivedEvent: event.type ?? null,
          lastEvents: [event.type!, ...prev.lastEvents].slice(0, 12),
        }));
      }

      if (event.type === 'response.created') {
        responseInProgressRef.current = true;
        setVoiceState((prev) => {
          if (prev === 'capturing' || prev === 'transcribing') return prev;
          return prev === 'speaking' ? prev : 'processing';
        });
        return;
      }

      if (event.type === 'input_audio_buffer.speech_started') {
        finalBufferRef.current = '';
        assistantBufferRef.current = '';
        lastFinalizedTranscriptRef.current = '';
        setPartialTranscript('');
        setFinalTranscript('');
        setAssistantPartialTranscript('');
        setAssistantFinalTranscript('');
        setIsSpeaking(false);
        smoothedOutputRef.current = 0;
        setOutputLevel(0);
        onTurnStart?.();
        if (audioTrackRef.current?.enabled) {
          setVoiceState('capturing');
        }
        return;
      }

      if (event.type === 'input_audio_buffer.speech_stopped') {
        if (audioTrackRef.current?.enabled) {
          setVoiceState('transcribing');
        }
        return;
      }

      if (USER_TRANSCRIPT_DELTA_EVENTS.has(event.type)) {
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
        const transcript = (event.transcript || '').trim();
        const resolvedTranscript = transcript || finalBufferRef.current.trim();
        if (resolvedTranscript) {
          finalBufferRef.current = resolvedTranscript;
        }
        if (resolvedTranscript) {
          setPartialTranscript(resolvedTranscript);
          if (audioTrackRef.current?.enabled) {
            void finalizeTurn(resolvedTranscript);
          }
        }
        return;
      }

      if (ASSISTANT_AUDIO_DELTA_EVENTS.has(event.type)) {
        responseInProgressRef.current = true;
        setIsSpeaking((prev) => (prev ? prev : true));
        setVoiceState((prev) => (prev === 'speaking' ? prev : 'speaking'));
        return;
      }

      if (ASSISTANT_TRANSCRIPT_DELTA_EVENTS.has(event.type)) {
        const delta = event.delta || event.text || '';
        if (!delta) return;
        responseInProgressRef.current = true;
        assistantBufferRef.current = `${assistantBufferRef.current}${delta}`;
        setAssistantPartialTranscript((prev) => `${prev}${delta}`);
        return;
      }

      if (ASSISTANT_TRANSCRIPT_DONE_EVENTS.has(event.type)) {
        const transcript = (event.transcript || event.text || '').trim();
        const resolved = transcript || assistantBufferRef.current.trim();
        if (resolved) {
          assistantBufferRef.current = resolved;
          setAssistantFinalTranscript(resolved);
        }
        setAssistantPartialTranscript('');
        return;
      }

      if (ASSISTANT_AUDIO_DONE_EVENTS.has(event.type)) {
        setIsSpeaking(false);
        smoothedOutputRef.current = 0;
        setOutputLevel(0);
        return;
      }

      if (event.type === 'output_audio_buffer.cleared') {
        responseInProgressRef.current = false;
        assistantBufferRef.current = '';
        setAssistantPartialTranscript('');
        setIsSpeaking(false);
        smoothedOutputRef.current = 0;
        setOutputLevel(0);
        setVoiceState((prev) => {
          const trackEnabled = Boolean(audioTrackRef.current?.enabled);
          if (prev === 'capturing' || prev === 'transcribing') return prev;
          return trackEnabled ? 'listening' : 'idle';
        });
        return;
      }

      if (event.type === 'response.done') {
        responseInProgressRef.current = false;
        const responseStatus = event.response?.status ?? null;
        if (responseStatus !== 'cancelled') {
          setAssistantFinalTranscript((prev) => prev || assistantBufferRef.current.trim());
        } else {
          assistantBufferRef.current = '';
        }
        setAssistantPartialTranscript('');
        setIsSpeaking(false);
        smoothedOutputRef.current = 0;
        setOutputLevel(0);
        setVoiceState((prev) => {
          const trackEnabled = Boolean(audioTrackRef.current?.enabled);
          if (prev === 'capturing' || prev === 'transcribing' || prev === 'processing') return prev;
          return trackEnabled ? 'listening' : 'idle';
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
        remoteAnalyser && remoteData && !isMuted
          ? readNormalizedLevel(remoteAnalyser, remoteData)
          : 0;

      smoothedInputRef.current = smoothedInputRef.current * 0.65 + rawInput * 0.35;
      smoothedOutputRef.current = smoothedOutputRef.current * 0.6 + rawOutput * 0.4;

      const nextInput = smoothedInputRef.current < 0.015 ? 0 : smoothedInputRef.current;
      const nextOutput = smoothedOutputRef.current < 0.015 ? 0 : smoothedOutputRef.current;

      setInputLevel((prev) => (Math.abs(prev - nextInput) > 0.012 ? nextInput : prev));
      setOutputLevel((prev) => (Math.abs(prev - nextOutput) > 0.012 ? nextOutput : prev));
    }, 66);
  }, [isMuted]);

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
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    return ctx;
  }, []);

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

  const teardownConnection = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioTrackRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
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
    setInputLevel(0);
    setOutputLevel(0);
    setSessionReady(false);
    setDebug((prev) => ({
      ...prev,
      sessionReady: false,
      pcConnectionState: 'none',
      iceConnectionState: 'none',
      dataChannelState: 'none',
      lastReceivedEvent: null,
      lastSentEvent: null,
      lastEvents: [],
    }));
  }, []);

  const ensureRealtimeConnection = useCallback(async () => {
    if (!isSupported) return false;
    if (pcRef.current && dataChannelRef.current?.readyState === 'open') {
      setSessionReady(true);
      setDebug((prev) => ({ ...prev, sessionReady: true }));
      return true;
    }

    setVoiceState('requesting_mic');
    setError(null);
    setSessionReady(false);
    setDebug((prev) => ({ ...prev, sessionReady: false }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      await attachMicAnalyser(stream);
      const track = stream.getAudioTracks()[0] ?? null;
      if (!track) throw new Error('No audio track available.');
      track.enabled = false;
      audioTrackRef.current = track;

      setVoiceState('connecting_realtime');

      const sessionRes = await fetchWithTimeout(
        '/api/realtime/session',
        { method: 'POST' },
        REALTIME_SESSION_TIMEOUT_MS
      );
      if (!sessionRes.ok) {
        throw new Error('Could not create realtime session.');
      }
      const sessionData = (await sessionRes.json()) as RealtimeSessionResponse;
      const ephemeralKey = sessionData.client_secret?.value;
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
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          setSessionReady(false);
          responseInProgressRef.current = false;
          setDebug((prev) => ({ ...prev, sessionReady: false }));
        }
        if (!debugEnabled) return;
        setDebug((prev) => ({ ...prev, pcConnectionState: pc.connectionState }));
      };

      pc.oniceconnectionstatechange = () => {
        if (!debugEnabled) return;
        setDebug((prev) => ({ ...prev, iceConnectionState: pc.iceConnectionState }));
      };

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (!remoteStream) return;
        if (!remoteAudioRef.current) {
          remoteAudioRef.current = new Audio();
          remoteAudioRef.current.autoplay = true;
        }
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.muted = isMuted;
        void remoteAudioRef.current.play().catch(() => {});
        void attachRemoteAnalyser(remoteStream);
      };

      const channel = pc.createDataChannel('oai-events');
      dataChannelRef.current = channel;
      setDebug((prev) => ({ ...prev, dataChannelState: channel.readyState }));

      channel.onmessage = (event) => {
        try {
          handleRealtimeEvent(JSON.parse(event.data) as RealtimeEvent);
        } catch {
          // Ignore malformed events.
        }
      };

      const channelReady = new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          setSessionReady(false);
          setDebug((prev) => ({ ...prev, sessionReady: false }));
          reject(new Error('Realtime data channel timed out.'));
        }, DATA_CHANNEL_TIMEOUT_MS);
        channel.onopen = () => {
          window.clearTimeout(timeoutId);
          setSessionReady(true);
          setDebug((prev) => ({
            ...prev,
            dataChannelState: channel.readyState,
            sessionReady: true,
          }));
          resolve();
        };
        channel.onerror = () => {
          window.clearTimeout(timeoutId);
          setSessionReady(false);
          responseInProgressRef.current = false;
          setDebug((prev) => ({
            ...prev,
            dataChannelState: channel.readyState,
            sessionReady: false,
          }));
          reject(new Error('Realtime data channel error.'));
        };
        channel.onclose = () => {
          window.clearTimeout(timeoutId);
          setSessionReady(false);
          responseInProgressRef.current = false;
          setDebug((prev) => ({
            ...prev,
            dataChannelState: channel.readyState,
            sessionReady: false,
          }));
        };
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetchWithTimeout(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
            'OpenAI-Beta': 'realtime=v1',
          },
        },
        REALTIME_SDP_TIMEOUT_MS
      );

      if (!sdpRes.ok) {
        throw new Error('Realtime SDP negotiation failed.');
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      await channelReady;

      sendRealtimeEvent({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          voice: 'alloy',
          output_audio_format: 'pcm16',
          instructions: REALTIME_REPLY_INSTRUCTIONS,
          turn_detection: SERVER_VAD_CONFIG,
          input_audio_transcription: {
            model: 'gpt-4o-mini-transcribe',
            language: 'en',
          },
        },
      });

      return true;
    } catch (error) {
      // Clean up any partially-initialized resources (mic stream, PeerConnection,
      // AudioContext, analysers) before bubbling up so retries don't leak.
      teardownConnection();
      throw error;
    }
  }, [
    attachMicAnalyser,
    attachRemoteAnalyser,
    debugEnabled,
    fetchWithTimeout,
    handleRealtimeEvent,
    isMuted,
    isSupported,
    sendRealtimeEvent,
    teardownConnection,
  ]);

  const startCapture = useCallback(async () => {
    if (!isSupported) {
      setVoiceState('error');
      setError('Voice input is not supported in this browser.');
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
        setVoiceState('idle');
        return;
      }
      finalBufferRef.current = '';
      lastFinalizedTranscriptRef.current = '';
      setFinalTranscript('');
      setPartialTranscript('');
      setAssistantPartialTranscript('');
      setAssistantFinalTranscript('');
      assistantBufferRef.current = '';
      setError(null);
      smoothedInputRef.current = 0;
      smoothedOutputRef.current = 0;
      setInputLevel(0);
      setOutputLevel(0);
      sendRealtimeEvent({ type: 'input_audio_buffer.clear' });
      interruptAssistant();
      track.enabled = true;
      setVoiceState('listening');
    } catch {
      setVoiceState('error');
      setError('Could not start voice capture.');
      setSessionReady(false);
      setDebug((prev) => ({ ...prev, sessionReady: false }));
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
    setPartialTranscript('');
    setFinalTranscript('');
    setAssistantPartialTranscript('');
    setAssistantFinalTranscript('');
    setInputLevel(0);
    setOutputLevel(0);
    smoothedInputRef.current = 0;
    smoothedOutputRef.current = 0;
    setVoiceState('idle');
    setSessionReady(
      Boolean(dataChannelRef.current && dataChannelRef.current.readyState === 'open')
    );
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
      teardownConnection();
      startCancelledRef.current = false;
      setDebug((prev) => ({
        ...prev,
        receivedEventCount: 0,
        sentEventCount: 0,
      }));
    };
  }, [stopMeterLoop, teardownConnection]);

  return {
    isSupported,
    sessionReady,
    voiceState,
    isSpeaking,
    isMuted,
    setIsMuted,
    partialTranscript,
    finalTranscript,
    assistantPartialTranscript,
    assistantFinalTranscript,
    error,
    debug,
    inputLevel,
    outputLevel,
    startCapture,
    stopCapture,
    cancelCapture,
    stopSpeaking,
  };
}
