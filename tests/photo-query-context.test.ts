/**
 * Regression tests for the history-walking tightening in
 * `derivePhotoQueryFromContext` (app/api/chat/route.ts).
 *
 * Previously, if a direct query produced no candidate, the function walked
 * the history and returned the first `derivePhotoQuery` result from ANY
 * entry's stripped content. That meant a history like:
 *
 *   user:      "hi"
 *   assistant: "hi there"
 *   user:      "show me one"
 *
 * would silently resolve "show me one" to `"hi there"` and trigger an image
 * search for unrelated chat prose.
 *
 * The tightening requires either:
 *   (a) an explicit `(searched: X)` marker that we ourselves emitted from a
 *       previous imageBlock response, or
 *   (b) an assistant message that starts with our structured
 *       `[Showed <component>]` marker.
 *
 * Free-form chat text is no longer used as a fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePhotoQueryFromContext } from '@/app/api/chat/route';

test('derivePhotoQueryFromContext: returns null for arbitrary greeting-only history', () => {
  const history = [
    { role: 'user' as const, content: 'hello' },
    { role: 'assistant' as const, content: 'hi there' },
  ];
  assert.equal(derivePhotoQueryFromContext('show me one', history), null);
});

test('derivePhotoQueryFromContext: still resolves from a (searched: X) marker', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about ESP32' },
    {
      role: 'assistant' as const,
      content: '[Showed imageBlock] Photo of ESP32 (searched: ESP32)',
    },
  ];
  assert.equal(derivePhotoQueryFromContext('show me one', history), 'esp32');
});

test('derivePhotoQueryFromContext: resolves from a structured specCard summary', () => {
  // useConversationState summarizes a specCard as:
  //   "[Showed specCard] — ATmega328P — ..."
  const history = [
    { role: 'user' as const, content: 'Tell me about the ATmega328P' },
    {
      role: 'assistant' as const,
      content: '[Showed specCard] — ATmega328P — 8-bit AVR microcontroller',
    },
  ];
  const result = derivePhotoQueryFromContext('show me one', history);
  assert.ok(result);
  assert.match(result!, /atmega328p/i);
});

test('derivePhotoQueryFromContext: does NOT treat a user message as a photo-query source', () => {
  // User messages are not curated. Without a (searched:) marker or a
  // [Showed ...] prefix this should return null even if the user said
  // something that looks like a product name.
  const history = [{ role: 'user' as const, content: 'raspberry pi pico' }];
  assert.equal(derivePhotoQueryFromContext('show me one', history), null);
});

test('derivePhotoQueryFromContext: a direct query still wins over history', () => {
  // Verify the tightening did not accidentally change the precedence:
  // when the user *does* give us a direct query, we must still return it
  // and never fall through to the (possibly irrelevant) history entry.
  const history = [
    {
      role: 'assistant' as const,
      content: '[Showed imageBlock] Photo of Arduino (searched: Arduino)',
    },
  ];
  assert.equal(derivePhotoQueryFromContext('show me an ESP32', history), 'esp32');
});
