import type { RealtimeTranscriptionSessionCreateRequest } from 'openai/resources/realtime/realtime';
import type { ClientSecretCreateParams } from 'openai/resources/realtime/client-secrets';

export const OPENAI_CHAT_MODEL = 'gpt-5.6-luna';
export const OPENAI_CHAT_MAX_TOKENS = 1200;
export const OPENAI_CHAT_REASONING_EFFORT = 'none';
export const OPENAI_CHAT_VERBOSITY = 'low';
export const OPENAI_CHAT_TIMEOUT_MS = 20_000;
export const OPENAI_CHAT_MAX_RETRIES = 1;

export const OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts';
export const OPENAI_SPEECH_VOICE = 'marin';
export const OPENAI_SPEECH_INSTRUCTIONS =
  'Speak like a calm, knowledgeable maker at a workbench: warm, direct, and natural. Use a conversational pace and pronounce electronics terms, units, pin labels, and numbers clearly.';
export const OPENAI_SPEECH_MAX_CHARACTERS = 600;
export const OPENAI_SPEECH_PCM_SAMPLE_RATE = 24_000;
export const OPENAI_SPEECH_PLAYBACK_START_BUFFER_SECONDS = 0.04;

export const OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
export const OPENAI_REALTIME_TRANSCRIPTION_PROMPT =
  'Keywords: ESP32, ESP8266, RP2040, Raspberry Pi Pico, Arduino, GPIO, I2C, SPI, UART, PWM, MOSFET, BJT, flyback diode, pull-up, pull-down, breadboard, ohm, kiloohm, microfarad, milliamp, 3.3 V, 5 V, 12 V, LiPo, LiFePO4, BME280, DHT22, WS2812B, Zigbee, Z-Wave, Matter, PoE, Cat6';
export const OPENAI_REALTIME_TRANSPORT = 'openai-realtime-webrtc';
export const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets';
export const OPENAI_REALTIME_SDP_URL = 'https://api.openai.com/v1/realtime/calls';

export const OPENAI_REALTIME_SESSION_TIMEOUT_MS = 12_000;
export const OPENAI_REALTIME_SDP_TIMEOUT_MS = 15_000;
export const OPENAI_REALTIME_DATA_CHANNEL_TIMEOUT_MS = 10_000;
export const OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS = 60;

export const OPENAI_REALTIME_TURN_DETECTION_CONFIG = {
  type: 'semantic_vad',
  eagerness: 'high',
} as const;

export const OPENAI_REALTIME_SESSION_CONFIG = {
  type: 'transcription',
  audio: {
    input: {
      format: {
        type: 'audio/pcm',
        rate: 24000,
      },
      noise_reduction: {
        type: 'far_field',
      },
      turn_detection: OPENAI_REALTIME_TURN_DETECTION_CONFIG,
      transcription: {
        model: OPENAI_REALTIME_TRANSCRIPTION_MODEL,
        language: 'en',
        prompt: OPENAI_REALTIME_TRANSCRIPTION_PROMPT,
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
