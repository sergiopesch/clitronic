export const OPENAI_CHAT_MODEL = 'gpt-4o-mini';
export const OPENAI_CHAT_MAX_TOKENS = 1200;

export const OPENAI_REALTIME_MODEL = 'gpt-realtime-1.5';
export const OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
export const OPENAI_REALTIME_VOICE = 'marin';
export const OPENAI_REALTIME_OUTPUT_MODALITIES = ['audio'] as const;
export const OPENAI_REALTIME_TRANSPORT = 'openai-realtime-webrtc';
export const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets';
export const OPENAI_REALTIME_SDP_URL = 'https://api.openai.com/v1/realtime/calls';

export const OPENAI_REALTIME_SESSION_TIMEOUT_MS = 12_000;
export const OPENAI_REALTIME_SDP_TIMEOUT_MS = 15_000;
export const OPENAI_REALTIME_DATA_CHANNEL_TIMEOUT_MS = 10_000;

export const OPENAI_REALTIME_SESSION_INSTRUCTIONS =
  'You are Clitronic, a voice-first electronics assistant. Always understand and respond in English only. Keep replies concise and practical.';

export const OPENAI_REALTIME_REPLY_INSTRUCTIONS =
  'You are Clitronic, a voice-first electronics assistant. Always answer in English only, even if the user mixes languages. Reply in plain spoken language, 1-2 short sentences, practical and concise. Prioritize safety warnings first when relevant. If the user asks to show, see, picture, image, or photo of something, say that you are showing it on screen now. Only answer electronics/hardware topics; for off-topic requests, briefly say you can only help with electronics.';

export const OPENAI_REALTIME_SERVER_VAD_CONFIG = {
  type: 'server_vad',
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 550,
  create_response: true,
  interrupt_response: true,
} as const;

export const OPENAI_REALTIME_SESSION_CONFIG = {
  type: 'realtime',
  model: OPENAI_REALTIME_MODEL,
  output_modalities: OPENAI_REALTIME_OUTPUT_MODALITIES,
  instructions: OPENAI_REALTIME_SESSION_INSTRUCTIONS,
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
    output: {
      format: {
        type: 'audio/pcm',
        rate: 24000,
      },
      voice: OPENAI_REALTIME_VOICE,
    },
  },
} as const;

export const OPENAI_REALTIME_CLIENT_SECRET_CONFIG = {
  session: OPENAI_REALTIME_SESSION_CONFIG,
} as const;

export const OPENAI_REALTIME_SESSION_UPDATE_CONFIG = {
  ...OPENAI_REALTIME_SESSION_CONFIG,
  instructions: OPENAI_REALTIME_REPLY_INSTRUCTIONS,
} as const;
