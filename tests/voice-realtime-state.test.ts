import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeardownVoiceDebugInfo,
  createInitialVoiceDebugInfo,
  createVoiceTeardownSnapshot,
} from '@/hooks/voice-realtime-state';

test('startup-failure teardown preserves debug counters for retry diagnostics', () => {
  const previous = {
    ...createInitialVoiceDebugInfo(),
    sessionReady: true,
    pcConnectionState: 'connected' as const,
    iceConnectionState: 'connected' as const,
    dataChannelState: 'open' as const,
    receivedEventCount: 7,
    sentEventCount: 3,
    lastReceivedEvent: 'response.created',
    lastSentEvent: 'session.update',
    lastEvents: ['response.created', 'input_audio_buffer.speech_started'],
  };

  const next = buildTeardownVoiceDebugInfo(previous);

  assert.equal(next.sessionReady, false);
  assert.equal(next.pcConnectionState, 'none');
  assert.equal(next.iceConnectionState, 'none');
  assert.equal(next.dataChannelState, 'none');
  assert.equal(next.receivedEventCount, 7);
  assert.equal(next.sentEventCount, 3);
  assert.equal(next.lastReceivedEvent, 'response.created');
  assert.equal(next.lastSentEvent, 'session.update');
  assert.deepEqual(next.lastEvents, ['response.created', 'input_audio_buffer.speech_started']);
});

test('full teardown reset clears debug counters for unmount cleanup', () => {
  const previous = {
    ...createInitialVoiceDebugInfo(),
    sessionReady: true,
    pcConnectionState: 'failed' as const,
    iceConnectionState: 'failed' as const,
    dataChannelState: 'closed' as const,
    receivedEventCount: 12,
    sentEventCount: 4,
    lastReceivedEvent: 'response.done',
    lastSentEvent: 'response.cancel',
    lastEvents: ['response.done'],
  };

  const next = buildTeardownVoiceDebugInfo(previous, { resetDebugCounters: true });

  assert.equal(next.sessionReady, false);
  assert.equal(next.pcConnectionState, 'none');
  assert.equal(next.iceConnectionState, 'none');
  assert.equal(next.dataChannelState, 'none');
  assert.equal(next.receivedEventCount, 0);
  assert.equal(next.sentEventCount, 0);
  assert.equal(next.lastReceivedEvent, null);
  assert.equal(next.lastSentEvent, null);
  assert.deepEqual(next.lastEvents, []);
});

test('voice teardown snapshot clears UI state exposed by the hook', () => {
  assert.deepEqual(createVoiceTeardownSnapshot(), {
    partialTranscript: '',
    finalTranscript: '',
    assistantPartialTranscript: '',
    assistantFinalTranscript: '',
    inputLevel: 0,
    outputLevel: 0,
    isSpeaking: false,
    sessionReady: false,
  });
});
