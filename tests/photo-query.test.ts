import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePhotoQuery, derivePhotoQueryFromContext } from '@/app/api/chat/route';

test('derivePhotoQuery removes generic image wording from direct requests', () => {
  assert.equal(derivePhotoQuery('show me an Arduino image'), 'arduino');
  assert.equal(derivePhotoQuery('can you show me a photo of the ESP32 board'), 'esp32 board');
});

test('derivePhotoQueryFromContext resolves vague follow-up requests from history', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about the ESP32.' },
    {
      role: 'assistant' as const,
      content:
        '[Showed imageBlock] ESP32 Dev Board — Compact Wi-Fi microcontroller (searched: esp32)',
    },
  ];

  assert.equal(derivePhotoQueryFromContext('show me one', history), 'esp32');
});

test('derivePhotoQuery returns null for low-signal requests without context', () => {
  assert.equal(derivePhotoQuery('show me one'), null);
  assert.equal(derivePhotoQueryFromContext('show me one', []), null);
});
