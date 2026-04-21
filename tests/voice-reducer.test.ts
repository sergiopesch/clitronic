import test from 'node:test';
import assert from 'node:assert/strict';
import { initialVoiceState, voiceReducer } from '@/hooks/useVoiceInteraction.reducer';

test('USER_TURN_STARTED clears prior turn transcripts', () => {
  const primed = {
    ...initialVoiceState,
    partialTranscript: 'hello',
    finalTranscript: 'previous answer',
    assistantPartialTranscript: 'thinking...',
    assistantFinalTranscript: 'old reply',
    isSpeaking: true,
    outputLevel: 0.42,
  };
  const next = voiceReducer(primed, { type: 'USER_TURN_STARTED' });

  assert.equal(next.partialTranscript, '');
  assert.equal(next.finalTranscript, '');
  assert.equal(next.assistantPartialTranscript, '');
  assert.equal(next.assistantFinalTranscript, '');
  assert.equal(next.isSpeaking, false);
  assert.equal(next.outputLevel, 0);
});

test('USER_TRANSCRIPT_DELTA appends and flips to capturing when track is enabled', () => {
  const next = voiceReducer(
    { ...initialVoiceState, voiceState: 'listening' },
    { type: 'USER_TRANSCRIPT_DELTA', delta: 'hi ', trackEnabled: true }
  );
  assert.equal(next.partialTranscript, 'hi ');
  assert.equal(next.voiceState, 'capturing');

  const next2 = voiceReducer(next, {
    type: 'USER_TRANSCRIPT_DELTA',
    delta: 'there',
    trackEnabled: true,
  });
  assert.equal(next2.partialTranscript, 'hi there');
});

test('USER_TRANSCRIPT_DELTA does not change voiceState when track is disabled', () => {
  const next = voiceReducer(
    { ...initialVoiceState, voiceState: 'idle' },
    { type: 'USER_TRANSCRIPT_DELTA', delta: 'x', trackEnabled: false }
  );
  assert.equal(next.voiceState, 'idle');
});

test('RESPONSE_DONE retains cancelled assistant final transcript unchanged', () => {
  // When a response is cancelled, the caller passes finalizeAssistant=false
  // so we should NOT promote the partial buffer into `assistantFinalTranscript`.
  const primed = {
    ...initialVoiceState,
    assistantFinalTranscript: 'original',
    assistantPartialTranscript: 'ignored-partial',
    isSpeaking: true,
  };
  const next = voiceReducer(primed, {
    type: 'RESPONSE_DONE',
    trackEnabled: true,
    finalizeAssistant: false,
  });
  assert.equal(next.assistantFinalTranscript, 'original');
  assert.equal(next.assistantPartialTranscript, '');
  assert.equal(next.isSpeaking, false);
  // Should return to listening because the mic track is enabled.
  assert.equal(next.voiceState, 'listening');
});

test('RESPONSE_DONE promotes partial transcript when finalizeAssistant=true', () => {
  const primed = {
    ...initialVoiceState,
    assistantFinalTranscript: '',
    assistantPartialTranscript: '   streamed response   ',
    voiceState: 'speaking' as const,
  };
  const next = voiceReducer(primed, {
    type: 'RESPONSE_DONE',
    trackEnabled: false,
    finalizeAssistant: true,
  });
  assert.equal(next.assistantFinalTranscript, 'streamed response');
  assert.equal(next.voiceState, 'idle');
});

test('SET_MUTED while speaking also clears isSpeaking', () => {
  const primed = { ...initialVoiceState, isSpeaking: true };
  const next = voiceReducer(primed, { type: 'SET_MUTED', muted: true });
  assert.equal(next.isMuted, true);
  assert.equal(next.isSpeaking, false);
});

test('LEVELS_TICK ignores jitter below 0.012 threshold', () => {
  const primed = { ...initialVoiceState, inputLevel: 0.5, outputLevel: 0.5 };
  const same = voiceReducer(primed, { type: 'LEVELS_TICK', input: 0.505, output: 0.51 });
  assert.equal(same.inputLevel, 0.5, 'small input delta is dropped');
  assert.equal(same.outputLevel, 0.5, 'small output delta is dropped');

  const next = voiceReducer(primed, { type: 'LEVELS_TICK', input: 0.7, output: 0.5 });
  assert.equal(next.inputLevel, 0.7);
  assert.equal(next.outputLevel, 0.5);
});

test('DEBUG_PATCH with incrementReceived bumps counters and event log', () => {
  const next = voiceReducer(initialVoiceState, {
    type: 'DEBUG_PATCH',
    patch: {},
    incrementReceived: 'response.audio.delta',
  });
  assert.equal(next.debug.receivedEventCount, 1);
  assert.equal(next.debug.lastReceivedEvent, 'response.audio.delta');
  assert.deepEqual(next.debug.lastEvents, ['response.audio.delta']);
});

test('CLEANUP resets transport-observable debug fields', () => {
  const primed = {
    ...initialVoiceState,
    sessionReady: true,
    inputLevel: 0.3,
    outputLevel: 0.4,
    debug: {
      ...initialVoiceState.debug,
      sessionReady: true,
      pcConnectionState: 'connected' as RTCPeerConnectionState,
      receivedEventCount: 12,
      lastEvents: ['a', 'b'],
    },
  };
  const next = voiceReducer(primed, { type: 'CLEANUP' });
  assert.equal(next.sessionReady, false);
  assert.equal(next.inputLevel, 0);
  assert.equal(next.outputLevel, 0);
  assert.equal(next.debug.sessionReady, false);
  assert.equal(next.debug.pcConnectionState, 'none');
  assert.equal(next.debug.receivedEventCount, 0);
  assert.deepEqual(next.debug.lastEvents, []);
});
