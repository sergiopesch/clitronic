import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENAI_REALTIME_CLIENT_SECRET_CONFIG,
  OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  OPENAI_REALTIME_CLIENT_SECRETS_URL,
  OPENAI_REALTIME_SDP_URL,
} from '@/lib/ai/openai-config';

test('realtime config uses GA client-secret and WebRTC endpoints', () => {
  assert.equal(
    OPENAI_REALTIME_CLIENT_SECRETS_URL,
    'https://api.openai.com/v1/realtime/client_secrets'
  );
  assert.equal(OPENAI_REALTIME_SDP_URL, 'https://api.openai.com/v1/realtime/calls');
});

test('realtime client secret payload wraps a transcription-only session', () => {
  assert.equal(OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS, 60);
  assert.equal(OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session.type, 'transcription');
  assert.equal('model' in OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session, false);
  assert.equal('instructions' in OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session, false);
  assert.equal('output_modalities' in OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session, false);
  assert.equal('max_output_tokens' in OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session, false);
  assert.equal('output' in OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session.audio, false);
  assert.deepEqual(OPENAI_REALTIME_CLIENT_SECRET_CONFIG.expires_after, {
    anchor: 'created_at',
    seconds: OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  });
});

test('realtime session keeps transcription and non-generating VAD under audio input', () => {
  const session = OPENAI_REALTIME_CLIENT_SECRET_CONFIG.session;
  assert.equal(session.audio.input.format.type, 'audio/pcm');
  assert.equal(session.audio.input.format.rate, 24000);
  assert.equal(session.audio.input.transcription.model, 'gpt-4o-mini-transcribe');
  assert.equal(session.audio.input.turn_detection.type, 'server_vad');
  assert.equal(session.audio.input.turn_detection.silence_duration_ms, 450);
  assert.equal(session.audio.input.turn_detection.create_response, false);
  assert.equal(session.audio.input.turn_detection.interrupt_response, false);
});
