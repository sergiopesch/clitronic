import type { RealtimeTransport } from './useVoiceInteraction.types';

const REALTIME_SESSION_TIMEOUT_MS = 12000;
const REALTIME_SDP_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createDefaultRealtimeTransport(): RealtimeTransport {
  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  return {
    isSupported,

    async createSession() {
      const res = await fetchWithTimeout(
        '/api/realtime/session',
        { method: 'POST' },
        REALTIME_SESSION_TIMEOUT_MS
      );
      if (!res.ok) {
        throw new Error('Could not create realtime session.');
      }
      return (await res.json()) as { client_secret?: { value?: string } };
    },

    async acquireMicrophone() {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    },

    createPeerConnection() {
      return new RTCPeerConnection();
    },

    async negotiateSdp(offerSdp, ephemeralKey) {
      const res = await fetchWithTimeout(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
        {
          method: 'POST',
          body: offerSdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
            'OpenAI-Beta': 'realtime=v1',
          },
        },
        REALTIME_SDP_TIMEOUT_MS
      );
      if (!res.ok) {
        throw new Error('Realtime SDP negotiation failed.');
      }
      return res.text();
    },

    createAudioElement() {
      const el = new Audio();
      el.autoplay = true;
      return el;
    },

    createAudioContext() {
      return new AudioContext();
    },
  };
}
