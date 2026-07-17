import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeardownVoiceDebugInfo,
  canAcceptVoiceTurnEvent,
  canReuseRealtimeConnection,
  canStartVoiceInputTurn,
  canToggleVoiceMute,
  completeVoiceTurn,
  createInitialVoiceDebugInfo,
  createVoiceStartAttempt,
  createVoiceTeardownSnapshot,
  createVoiceTurnTracker,
  decodeRealtimeSessionSecret,
  decodeRealtimeVoiceEvent,
  getVoiceMuteAction,
  getVoicePrimaryStopAction,
  isActiveVoiceStartAttempt,
  isActiveVoiceTurn,
  invalidateVoiceTurn,
  resolveCompletedVoiceTranscript,
  shouldIgnoreVoiceStartFailure,
  startVoiceTurn,
  trySendRealtimeEvent,
} from '@/hooks/voice-realtime-state';

test('reuses only a fully connected peer with an open data channel', () => {
  assert.equal(canReuseRealtimeConnection('connected', 'open', 'live'), true);
  assert.equal(canReuseRealtimeConnection('failed', 'open', 'live'), false);
  assert.equal(canReuseRealtimeConnection('connected', 'closed', 'live'), false);
  assert.equal(canReuseRealtimeConnection('connected', 'open', 'ended'), false);
  assert.equal(canReuseRealtimeConnection(undefined, undefined, undefined), false);
});

test('a muted idle microphone can always be unmuted unless voice is locked', () => {
  assert.equal(canToggleVoiceMute('idle', true, false), true);
  assert.equal(canToggleVoiceMute('idle', false, false), false);
  assert.equal(canToggleVoiceMute('requesting_mic', false, false), false);
  assert.equal(canToggleVoiceMute('requesting_mic', true, false), false);
  assert.equal(canToggleVoiceMute('connecting_realtime', true, false), false);
  assert.equal(canToggleVoiceMute('listening', false, false), true);
  assert.equal(canToggleVoiceMute('listening', true, true), false);
});

test('only cancellation or replacement suppresses a voice startup failure', () => {
  const active = createVoiceStartAttempt();

  assert.equal(shouldIgnoreVoiceStartFailure(active, active), false);

  active.controller.abort();
  assert.equal(shouldIgnoreVoiceStartFailure(active, active), true);

  const replacement = createVoiceStartAttempt();
  assert.equal(shouldIgnoreVoiceStartFailure(replacement, active), true);
});

test('a cancelled voice startup cannot become current after a replacement starts', () => {
  const first = createVoiceStartAttempt();
  const second = createVoiceStartAttempt();

  assert.equal(isActiveVoiceStartAttempt(first, first), true);
  first.controller.abort();
  assert.equal(isActiveVoiceStartAttempt(first, first), false);
  assert.equal(isActiveVoiceStartAttempt(second, first), false);
  assert.equal(isActiveVoiceStartAttempt(second, second), true);
});

test('voice turns accept only the active realtime item and deduplicate completion', () => {
  const tracker = createVoiceTurnTracker();

  assert.equal(startVoiceTurn(tracker, 'item-a'), true);
  assert.equal(startVoiceTurn(tracker, 'item-a'), false);
  assert.equal(isActiveVoiceTurn(tracker, 'item-a'), true);
  assert.equal(isActiveVoiceTurn(tracker, 'item-b'), false);
  assert.equal(completeVoiceTurn(tracker, 'item-a'), true);
  assert.equal(canAcceptVoiceTurnEvent(tracker, 'item-a'), false);
  assert.equal(completeVoiceTurn(tracker, 'item-a'), false);
  assert.equal(startVoiceTurn(tracker, 'item-a'), false);

  assert.equal(startVoiceTurn(tracker, 'item-b'), true);
  assert.equal(isActiveVoiceTurn(tracker, 'item-a'), false);
  assert.equal(completeVoiceTurn(tracker, 'item-a'), false);
  assert.equal(completeVoiceTurn(tracker, 'item-b'), true);
});

test('decodes only structurally valid item-correlated realtime events', () => {
  assert.deepEqual(
    decodeRealtimeVoiceEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: ' item-a ',
      transcript: 'Use a 330 ohm resistor.',
    }),
    {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-a',
      transcript: 'Use a 330 ohm resistor.',
    }
  );
  assert.equal(
    decodeRealtimeVoiceEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-a',
      transcript: 42,
    }),
    null
  );
  assert.equal(
    decodeRealtimeVoiceEvent({ type: 'input_audio_buffer.speech_started', item_id: '' }),
    null
  );
  assert.equal(decodeRealtimeVoiceEvent({ type: 7 }), null);
  assert.deepEqual(decodeRealtimeVoiceEvent({ type: 'rate_limits.updated', junk: true }), {
    type: 'rate_limits.updated',
  });
});

test('accepts only the projected realtime client-secret response', () => {
  assert.equal(
    decodeRealtimeSessionSecret({ value: 'ek_test_123', expires_at: 123 }),
    'ek_test_123'
  );
  assert.equal(decodeRealtimeSessionSecret({ client_secret: { value: 'legacy' } }), null);
  assert.equal(decodeRealtimeSessionSecret({ value: 42 }), null);
  assert.equal(decodeRealtimeSessionSecret({ value: ' key with spaces ' }), null);
  assert.equal(decodeRealtimeSessionSecret(null), null);
});

test('voice turn invalidation rejects late transcript events', () => {
  const tracker = createVoiceTurnTracker();
  assert.equal(startVoiceTurn(tracker, undefined), false);
  assert.equal(startVoiceTurn(tracker, 'item-a'), true);

  invalidateVoiceTurn(tracker);

  assert.equal(isActiveVoiceTurn(tracker, 'item-a'), false);
  assert.equal(completeVoiceTurn(tracker, 'item-a'), false);
});

test('late speech-start events cannot create a turn while capture is muted or disabled', () => {
  assert.equal(canStartVoiceInputTurn(false, true), true);
  assert.equal(canStartVoiceInputTurn(true, true), false);
  assert.equal(canStartVoiceInputTurn(false, false), false);
  assert.equal(canStartVoiceInputTurn(true, false), false);
});

test('completed transcripts prefer the authoritative final and ignore empty ambient turns', () => {
  assert.equal(
    resolveCompletedVoiceTranscript('  Use 330 ohms.  ', 'partial text'),
    'Use 330 ohms.'
  );
  assert.equal(resolveCompletedVoiceTranscript('', '  buffered fallback  '), 'buffered fallback');
  assert.equal(resolveCompletedVoiceTranscript('   ', '  '), null);
  assert.equal(resolveCompletedVoiceTranscript(undefined, ''), null);
});

test('microphone mute discards open input without cancelling processing or speech output', () => {
  assert.equal(getVoiceMuteAction('listening'), 'go-idle');
  assert.equal(getVoiceMuteAction('capturing'), 'discard-input');
  assert.equal(getVoiceMuteAction('transcribing'), 'discard-input');
  assert.equal(getVoiceMuteAction('processing'), 'preserve-output');
  assert.equal(getVoiceMuteAction('speaking'), 'preserve-output');
  assert.equal(getVoiceMuteAction('error'), 'preserve-output');
});

test('stopping model output preserves the hot voice session', () => {
  assert.equal(getVoicePrimaryStopAction('processing'), 'interrupt-output');
  assert.equal(getVoicePrimaryStopAction('speaking'), 'interrupt-output');
  assert.equal(getVoicePrimaryStopAction('listening'), 'stop-session');
  assert.equal(getVoicePrimaryStopAction('capturing'), 'stop-session');
  assert.equal(getVoicePrimaryStopAction('connecting_realtime'), 'stop-session');
});

test('realtime event sending is non-throwing when the channel closes during send', () => {
  const throwingChannel = {
    readyState: 'open' as const,
    send() {
      throw new Error('channel closed');
    },
  };

  assert.equal(trySendRealtimeEvent(throwingChannel, { type: 'input_audio_buffer.clear' }), false);
  assert.equal(trySendRealtimeEvent(null, { type: 'input_audio_buffer.clear' }), false);
});

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
    lastSentEvent: 'input_audio_buffer.clear',
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
  assert.equal(next.lastSentEvent, 'input_audio_buffer.clear');
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
