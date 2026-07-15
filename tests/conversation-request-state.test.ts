import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isActiveRequest,
  resolveDraftAfterSubmission,
  selectRecentAssistantIndexes,
} from '@/hooks/conversation-request-state';

test('only the current non-aborted conversation request owns state updates', () => {
  const first = new AbortController();
  const second = new AbortController();

  assert.equal(isActiveRequest(first, first), true);
  assert.equal(isActiveRequest(second, first), false);
  second.abort();
  assert.equal(isActiveRequest(second, second), false);
});

test('opening an older answer keeps the newest answer available in recent turns', () => {
  assert.deepEqual(selectRecentAssistantIndexes([1, 3, 5], 1), [3, 5]);
  assert.deepEqual(selectRecentAssistantIndexes([1, 3, 5], 5), [1, 3]);
});

test('failed prompts remain retryable and successful prompts do not erase newer edits', () => {
  assert.equal(resolveDraftAfterSubmission('Explain PWM', 'Explain PWM', false), 'Explain PWM');
  assert.equal(resolveDraftAfterSubmission('Explain PWM', 'Explain PWM', true), '');
  assert.equal(
    resolveDraftAfterSubmission('Explain PWM with a diagram', 'Explain PWM', true),
    'Explain PWM with a diagram'
  );
});

test('rate-limited prompts use the failed-submission path so they remain retryable', () => {
  assert.equal(
    resolveDraftAfterSubmission('Show motor wiring', 'Show motor wiring', false),
    'Show motor wiring'
  );
});
