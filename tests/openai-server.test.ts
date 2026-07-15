import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOpenAISafetyIdentifier,
  createOpenAIClient,
  getOpenAIApiKey,
  OpenAIConfigurationError,
} from '@/lib/ai/openai-server';
import { OPENAI_CHAT_MAX_RETRIES, OPENAI_CHAT_TIMEOUT_MS } from '@/lib/ai/openai-config';

test('reads and trims the OpenAI key from the supplied server environment', () => {
  assert.equal(getOpenAIApiKey({ OPENAI_API_KEY: '  test-key-one  ' }), 'test-key-one');
});

test('reads a replacement key on the next request', () => {
  const env: { OPENAI_API_KEY?: string } = { OPENAI_API_KEY: 'test-key-one' };
  assert.equal(getOpenAIApiKey(env), 'test-key-one');

  env.OPENAI_API_KEY = 'test-key-two';
  assert.equal(getOpenAIApiKey(env), 'test-key-two');
});

test('creates a fresh client with the currently supplied key', () => {
  const first = createOpenAIClient({ OPENAI_API_KEY: 'test-key-one' });
  const second = createOpenAIClient({ OPENAI_API_KEY: 'test-key-two' });

  assert.notEqual(first, second);
  assert.equal(first.apiKey, 'test-key-one');
  assert.equal(second.apiKey, 'test-key-two');
  assert.equal(first.timeout, OPENAI_CHAT_TIMEOUT_MS);
  assert.equal(first.maxRetries, OPENAI_CHAT_MAX_RETRIES);
});

test('creates a stable, keyed pseudonymous Realtime safety identifier', () => {
  const firstEnvironment = { OPENAI_SAFETY_ID_SECRET: 'deployment-secret-one' };
  const identifier = createOpenAISafetyIdentifier('198.51.100.42', firstEnvironment);

  assert.equal(identifier, createOpenAISafetyIdentifier('198.51.100.42', firstEnvironment));
  assert.notEqual(
    identifier,
    createOpenAISafetyIdentifier('198.51.100.42', {
      OPENAI_SAFETY_ID_SECRET: 'deployment-secret-two',
    })
  );
  assert.match(identifier, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(identifier, /198\.51\.100\.42/);
});

test('rejects missing, blank, and example OpenAI keys', () => {
  for (const value of [undefined, '', '   ', 'your_openai_api_key_here', 'replace-me']) {
    assert.throws(() => getOpenAIApiKey({ OPENAI_API_KEY: value }), OpenAIConfigurationError);
  }
});
