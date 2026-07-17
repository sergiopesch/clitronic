import type { RealtimeTranscriptionSessionCreateRequest } from 'openai/resources/realtime/realtime';
import type { ClientSecretCreateParams } from 'openai/resources/realtime/client-secrets';

export const OPENAI_CHAT_MODEL = 'gpt-4o-mini';
export const OPENAI_CHAT_MAX_TOKENS = 1200;
export const OPENAI_CHAT_TIMEOUT_MS = 20_000;
export const OPENAI_CHAT_MAX_RETRIES = 1;

export const OPENAI_SPEECH_MODEL = 'tts-1';
export const OPENAI_SPEECH_VOICE = 'alloy';
export const OPENAI_SPEECH_MAX_CHARACTERS = 600;
export const OPENAI_SPEECH_PCM_SAMPLE_RATE = 24_000;

export const OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
export const OPENAI_REALTIME_TRANSPORT = 'openai-realtime-webrtc';
export const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets';
export const OPENAI_REALTIME_SDP_URL = 'https://api.openai.com/v1/realtime/calls';

export const OPENAI_REALTIME_SESSION_TIMEOUT_MS = 12_000;
export const OPENAI_REALTIME_SDP_TIMEOUT_MS = 15_000;
export const OPENAI_REALTIME_DATA_CHANNEL_TIMEOUT_MS = 10_000;
export const OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS = 60;

export const OPENAI_REALTIME_SERVER_VAD_CONFIG = {
  type: 'server_vad',
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 450,
  create_response: false,
  interrupt_response: false,
} as const;

export const OPENAI_REALTIME_SESSION_CONFIG = {
  type: 'transcription',
  audio: {
    input: {
      format: {
        type: 'audio/pcm',
        rate: 24000,
      },
      turn_detection: OPENAI_REALTIME_SERVER_VAD_CONFIG,
      transcription: {
        model: OPENAI_REALTIME_TRANSCRIPTION_MODEL,
        language: 'en',
      },
    },
  },
} as const satisfies RealtimeTranscriptionSessionCreateRequest;

export const OPENAI_REALTIME_CLIENT_SECRET_CONFIG = {
  session: OPENAI_REALTIME_SESSION_CONFIG,
  expires_after: {
    anchor: 'created_at',
    seconds: OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  },
} as const satisfies ClientSecretCreateParams;
