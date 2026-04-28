import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENAI_REALTIME_CLIENT_SECRET_CONFIG,
  OPENAI_REALTIME_CLIENT_SECRETS_URL,
  OPENAI_REALTIME_MODEL,
  OPENAI_REALTIME_SDP_URL,
  OPENAI_REALTIME_SESSION_UPDATE_CONFIG,
} from '@/lib/ai/openai-config';

test('realtime config uses GA endpoints and flagship voice model', () => {
  assert.equal(OPENAI_REALTIME_MODEL, 'gpt-realtime-1.5');
  assert.equal(
    OPENAI_REALTIME_CLIENT_SECRETS_URL,
    'https://api.openai.com/v1/realtime/client_secrets'
  );
  assert.equal(OPENAI_REALTIME_SDP_URL, 'https://api.openai.com/v1/realtime/calls');
});

test('realtime client secret payload wraps a GA realtime session', () => {
  assert.equal(OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session.type, 'realtime');
  assert.equal(OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session.model, 'gpt-realtime-1.5');
  assert.deepEqual(OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session.output_modalities, ['audio']);
  assert.equal(OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session.audio.output.voice, 'marin');
});

test('realtime session update keeps transcription and VAD under audio input', () => {
  assert.equal(OPENAI_REALTIME_SESSION_UPDATE_CONFIG.type, 'realtime');
  assert.equal(OPENAI_REALTIME_SESSION_UPDATE_CONFIG.audio.input.format.type, 'audio/pcm');
  assert.equal(OPENAI_REALTIME_SESSION_UPDATE_CONFIG.audio.input.format.rate, 24000);
  assert.equal(
    OPENAI_REALTIME_SESSION_UPDATE_CONFIG.audio.input.transcription.model,
    'gpt-4o-mini-transcribe'
  );
  assert.equal(OPENAI_REALTIME_SESSION_UPDATE_CONFIG.audio.input.turn_detection.type, 'server_vad');
  assert.equal(OPENAI_REALTIME_SESSION_UPDATE_CONFIG.audio.output.format.rate, 24000);
});
