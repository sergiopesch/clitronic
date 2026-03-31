import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTranscriptLight } from '@/lib/ai/transcript-utils';

test('cleans transcript lightly but preserves electronics tokens', () => {
  const raw = '  um um... GPIO13 on ESP32 at 3.3V??  ';
  const cleaned = cleanTranscriptLight(raw);
  assert.equal(cleaned, 'GPIO13 on ESP32 at 3.3V?');
});

test('removes edge fillers and collapses whitespace', () => {
  const raw = 'well   why is my LED not blinking   uh';
  const cleaned = cleanTranscriptLight(raw);
  assert.equal(cleaned, 'why is my LED not blinking');
});
