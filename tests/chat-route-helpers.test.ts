import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRequestedImageCount, derivePhotoQueryFromContext } from '@/app/api/chat/route';

// ---------------------------------------------------------------------------
// deriveRequestedImageCount
// ---------------------------------------------------------------------------

test('deriveRequestedImageCount: default is 1 for empty/undefined input', () => {
  assert.equal(deriveRequestedImageCount(undefined), 1);
  assert.equal(deriveRequestedImageCount(''), 1);
  assert.equal(deriveRequestedImageCount('   '), 1);
});

test('deriveRequestedImageCount: explicit numeric counts 2-6 are respected', () => {
  assert.equal(deriveRequestedImageCount('show me 2 images of an Arduino'), 2);
  assert.equal(deriveRequestedImageCount('show me 3 pictures of an ESP32'), 3);
  assert.equal(deriveRequestedImageCount('show me 4 photos of a breadboard'), 4);
  assert.equal(deriveRequestedImageCount('show me 5 images'), 5);
  assert.equal(deriveRequestedImageCount('show me 6 pictures'), 6);
});

test('deriveRequestedImageCount: "a few" and "few more" map to 3', () => {
  assert.equal(deriveRequestedImageCount('show me a few Arduino photos'), 3);
  assert.equal(deriveRequestedImageCount('can I see a few more images?'), 3);
  assert.equal(deriveRequestedImageCount('show more pictures please'), 3);
});

test('deriveRequestedImageCount: "several/multiple/many" hints map to 3', () => {
  assert.equal(deriveRequestedImageCount('show several Arduino boards'), 3);
  assert.equal(deriveRequestedImageCount('show multiple variants'), 3);
  assert.equal(deriveRequestedImageCount('show many options'), 3);
});

test('deriveRequestedImageCount: "1 image" falls back to default (documented limitation)', () => {
  // The explicit regex captures 2-6 only; "1 image" falls through to default 1,
  // which is correct in aggregate but worth locking in so behavior doesn't
  // accidentally change.
  assert.equal(deriveRequestedImageCount('show me 1 image'), 1);
});

test('deriveRequestedImageCount: counts above 6 are capped at default 1 (documented limitation)', () => {
  // Current regex captures 2-6 only. Values like "10 images" therefore match
  // neither the explicit nor the MULTI_IMAGE_HINTS path and return 1. This is
  // a known rough edge; test locks it in so a future change is intentional.
  assert.equal(deriveRequestedImageCount('show me 10 images of Arduino'), 1);
});

// ---------------------------------------------------------------------------
// derivePhotoQueryFromContext  ("show me one" after a previous turn)
// ---------------------------------------------------------------------------

test('derivePhotoQueryFromContext: resolves "show me one" after an imageBlock search', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about the ESP32' },
    {
      role: 'assistant' as const,
      // Shape matches summarizeAssistantResponse() output in useConversationState
      content: '[Showed imageBlock] Photo of ESP32 (searched: ESP32)',
    },
  ];
  assert.equal(derivePhotoQueryFromContext('show me one', history), 'esp32');
});

test('derivePhotoQueryFromContext: resolves vague follow-up from a specCard summary', () => {
  // This is the realistic dialog the README highlights:
  //   User: "Tell me about the ESP32"
  //   Assistant: renders a specCard summarized as "[Showed specCard] ESP32 — ..."
  //   User: "show me one"
  const history = [
    { role: 'user' as const, content: 'Tell me about the ESP32' },
    {
      role: 'assistant' as const,
      content: '[Showed specCard] — ESP32 — Wi-Fi microcontroller with Bluetooth.',
    },
  ];
  const result = derivePhotoQueryFromContext('show me one', history);
  assert.ok(result, 'expected a fallback photo query to be derived');
  assert.match(result!, /esp32/);
});

test('derivePhotoQueryFromContext: prefers most recent (searched:) marker', () => {
  const history = [
    { role: 'assistant' as const, content: '[Showed imageBlock] (searched: Arduino Uno)' },
    { role: 'user' as const, content: 'cool' },
    { role: 'assistant' as const, content: '[Showed imageBlock] (searched: Raspberry Pi Pico)' },
  ];
  assert.equal(derivePhotoQueryFromContext('show me one', history), 'raspberry pi pico');
});

test('derivePhotoQueryFromContext: LIMITATION — falls back to any non-low-signal text', () => {
  // Current behavior: derivePhotoQuery only filters against LOW_SIGNAL_PHOTO_QUERY
  // (it/this/that/one/...). A greeting like "hi there" is not in that set, so
  // it is returned as-is and would trigger an unrelated photo search.
  //
  // This test locks in current behavior so a future tightening is an
  // intentional change, not an accidental regression. See review notes in
  // PR #12's companion review for suggested remediation (entity allow-list,
  // confidence threshold, or requiring a previous imageBlock turn).
  const history = [
    { role: 'user' as const, content: 'hello' },
    { role: 'assistant' as const, content: 'hi there' },
  ];
  assert.equal(derivePhotoQueryFromContext('show me one', history), 'hi there');
});
