import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPcm16LeDecodeState,
  decodePcm16LeChunk,
  hasPendingPcm16LeByte,
} from '@/lib/ai/pcm-stream';

test('decodes signed 16-bit little-endian PCM into normalized Web Audio samples', () => {
  const state = createPcm16LeDecodeState();
  const samples = decodePcm16LeChunk(
    Uint8Array.from([
      0x00,
      0x80, // -32768
      0x00,
      0x00, // 0
      0xff,
      0x7f, // 32767
    ]),
    state
  );

  assert.deepEqual(Array.from(samples), [-1, 0, 32767 / 32768]);
  assert.equal(hasPendingPcm16LeByte(state), false);
});

test('preserves a split sample across streamed PCM chunk boundaries', () => {
  const state = createPcm16LeDecodeState();

  assert.deepEqual(Array.from(decodePcm16LeChunk(Uint8Array.from([0x00]), state)), []);
  assert.equal(hasPendingPcm16LeByte(state), true);
  assert.deepEqual(
    Array.from(decodePcm16LeChunk(Uint8Array.from([0x40, 0x00, 0xc0]), state)),
    [0.5, -0.5]
  );
  assert.equal(hasPendingPcm16LeByte(state), false);
});
