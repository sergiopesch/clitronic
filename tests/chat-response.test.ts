import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeVisibleResponse } from '@/app/api/chat/route';
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

test('accepts optional voice payload with spoken summary', () => {
  const payload = {
    intent: 'troubleshoot_led',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'troubleshootingCard',
      data: {
        issue: 'LED not blinking',
        steps: [{ label: 'Pin mode', detail: 'Set pin 13 as OUTPUT' }],
        tips: ['Check polarity'],
      },
    },
    text: 'Check pin mode and polarity.',
    behavior: { animation: 'expand', state: 'open' },
    voice: {
      spokenSummary: 'Set pin 13 to output, then verify LED polarity.',
      canInterrupt: true,
    },
  };

  const validated = validateStructuredResponse(payload);
  assert.ok(validated);
  assert.equal(validated?.voice?.spokenSummary, 'Set pin 13 to output, then verify LED polarity.');
});

test('sanitizes internal reasoning text from visible response fields', () => {
  const payload = {
    intent: 'explain_pwm',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'explanationCard',
      data: {
        title: 'PWM basics',
        summary:
          'The user is asking how PWM works. A visual would make this better. PWM rapidly switches voltage on and off to simulate an average output level.',
        keyPoints: [
          'Step 1 - What is the user asking for?',
          'PWM duty cycle controls the average delivered power.',
        ],
      },
    },
    text: 'Here is my reasoning. PWM is useful for dimming LEDs and controlling motor speed.',
    behavior: { animation: 'fadeIn', state: 'open' },
    voice: {
      spokenSummary:
        'I should use an explanation card here. PWM changes average power by varying duty cycle.',
    },
  };

  const sanitized = sanitizeVisibleResponse(payload);

  assert.equal(
    sanitized.ui.data.summary,
    'PWM rapidly switches voltage on and off to simulate an average output level.'
  );
  assert.deepEqual(sanitized.ui.data.keyPoints, [
    'PWM duty cycle controls the average delivered power.',
  ]);
  assert.equal(sanitized.text, 'PWM is useful for dimming LEDs and controlling motor speed.');
  assert.equal(sanitized.voice.spokenSummary, 'PWM changes average power by varying duty cycle.');
});

test('preserves normal user-facing card content during sanitization', () => {
  const payload = {
    intent: 'troubleshoot_led',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'troubleshootingCard',
      data: {
        issue: 'LED stays off',
        steps: [
          { label: 'Power', detail: 'Confirm the board is powered and ground is connected.' },
        ],
        tips: ['Check LED polarity and resistor value.'],
      },
    },
    text: 'Verify power first, then check LED polarity.',
    behavior: { animation: 'expand', state: 'open' },
    voice: {
      spokenSummary: 'Check power and LED polarity first.',
    },
  };

  const sanitized = sanitizeVisibleResponse(payload);

  assert.deepEqual(sanitized, payload);
});
