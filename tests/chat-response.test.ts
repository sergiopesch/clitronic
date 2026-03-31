import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAndNormalizeResponse } from '@/app/api/chat/response-normalizer';
import { validateStructuredResponse } from '@/app/api/chat/response-validator';

test('normalizes flat root response into ui.data', () => {
  const raw = JSON.stringify({
    intent: 'spec',
    mode: 'ui',
    title: 'ATmega328P',
    keySpecs: [{ label: 'Clock', value: '16 MHz' }],
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal((normalized?.ui as { component?: string })?.component, 'specCard');
  assert.deepEqual((normalized?.ui as { data?: unknown })?.data, {
    title: 'ATmega328P',
    keySpecs: [{ label: 'Clock', value: '16 MHz' }],
  });
});

test('normalizes component aliases inside ui block', () => {
  const raw = JSON.stringify({
    intent: 'show_image',
    mode: 'ui',
    ui: {
      type: 'image',
      component: 'photo',
      data: {
        imageMode: 'photo',
        searchQuery: 'breadboard',
        caption: 'Breadboard',
      },
    },
    text: null,
    behavior: { animation: 'fadeIn', state: 'open' },
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal((normalized?.ui as { component?: string })?.component, 'imageBlock');
});

test('rejects invalid structured payloads at runtime', () => {
  const invalidPayload = {
    intent: 'oops',
    mode: 'ui',
    ui: null,
    text: null,
    behavior: null,
  };

  const validated = validateStructuredResponse(invalidPayload);
  assert.equal(validated, null);
});

test('accepts valid chart response after normalization and validation', () => {
  const raw = JSON.stringify({
    intent: 'compare_power',
    mode: 'ui',
    ui: {
      type: 'chart',
      component: 'chart',
      data: {
        title: 'Power Draw',
        bars: [
          { label: 'ESP32', value: '240', unit: 'mA' },
          { label: 'ESP8266', value: '170', unit: 'mA' },
        ],
      },
    },
    text: null,
    behavior: { animation: 'slideUp', state: 'open' },
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  const validated = validateStructuredResponse(normalized);
  assert.ok(validated);
  assert.equal(validated?.ui?.component, 'chartCard');
});
