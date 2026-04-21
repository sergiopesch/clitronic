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

export type VoiceDebugInfo = {
  transport: 'openai-realtime-webrtc' | 'fake';
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

export type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  text?: string;
  response?: {
    status?: string;
  };
};

/**
 * Dependency-injection seam for the Realtime session + WebRTC transport.
 *
 * Default production implementation wraps `navigator.mediaDevices`,
 * `RTCPeerConnection`, `AudioContext`, and `/api/realtime/session`.
 * Tests inject a fake so the hook's state machine can be exercised
 * without a real browser or OpenAI connection.
 */
export interface RealtimeTransport {
  isSupported: boolean;
  /** POST /api/realtime/session -> returns the parsed session JSON. */
  createSession: (signal: AbortSignal) => Promise<{ client_secret?: { value?: string } }>;
  /** Acquire the microphone stream. */
  acquireMicrophone: () => Promise<MediaStream>;
  /** Build an RTCPeerConnection. */
  createPeerConnection: () => RTCPeerConnection;
  /** Post the SDP offer to OpenAI Realtime. */
  negotiateSdp: (offerSdp: string, ephemeralKey: string, signal: AbortSignal) => Promise<string>;
  /** Build a playback audio element; lets tests no-op in jsdom. */
  createAudioElement: () => HTMLAudioElement;
  /** Build an AudioContext; tests can return a stub. */
  createAudioContext: () => AudioContext;
}
