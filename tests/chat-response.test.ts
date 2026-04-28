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
          { label: 'ESP32', value: 240, unit: 'mA' },
          { label: 'ESP8266', value: 170, unit: 'mA' },
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

test('normalizes missing nullable top-level fields on valid ui responses', () => {
  const raw = JSON.stringify({
    intent: 'bench_plan',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'recommendationCard',
      data: {
        items: [
          {
            name: 'Bench power zone',
            reason: 'Use a current-limited bench supply and labeled outlets for projects.',
          },
        ],
        highlights: ['Keep power, soldering, storage, and test gear in separate zones.'],
      },
    },
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal(normalized.text, null);
  assert.equal(normalized.behavior, null);

  const validated = validateStructuredResponse(normalized);
  assert.ok(validated);
  assert.equal(validated?.ui?.component, 'recommendationCard');
});

test('normalizes missing intent from otherwise valid ui responses', () => {
  const raw = JSON.stringify({
    mode: 'ui',
    ui: {
      type: 'image',
      component: 'imageBlock',
      data: {
        imageMode: 'photo',
        searchQuery: 'diy electronics workbench',
        caption: 'DIY electronics workbench',
      },
    },
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal(normalized.intent, 'imageBlock');
  assert.ok(validateStructuredResponse(normalized));
});

test('normalizes missing troubleshooting issue from intent', () => {
  const raw = JSON.stringify({
    intent: 'reed switch noise',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'troubleshootingCard',
      data: {
        steps: [{ label: 'Cable', detail: 'Route the reed switch cable away from mains.' }],
        tips: ['Use pull-up and debounce.'],
      },
    },
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  const validated = validateStructuredResponse(normalized);
  assert.ok(validated);
  assert.equal((validated?.ui?.data as { issue?: string }).issue, 'reed switch noise');
});

test('normalization preserves existing valid top-level text and behavior fields', () => {
  const raw = JSON.stringify({
    intent: 'explain_pwm',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'explanationCard',
      data: {
        title: 'PWM basics',
        summary: 'PWM varies average power by changing duty cycle.',
        keyPoints: ['Higher duty cycle means more average on-time.'],
      },
    },
    text: 'PWM varies average power by changing duty cycle.',
    behavior: { animation: 'fadeIn', state: 'open' },
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal(normalized.text, 'PWM varies average power by changing duty cycle.');
  assert.deepEqual(normalized.behavior, { animation: 'fadeIn', state: 'open' });
});

test('normalization does not hide invalid nested ui data', () => {
  const raw = JSON.stringify({
    intent: 'bad_recommendation',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'recommendationCard',
      data: {
        items: [],
        highlights: [],
      },
    },
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal(normalized.text, null);
  assert.equal(normalized.behavior, null);
  assert.equal(validateStructuredResponse(normalized), null);
});

test('normalization leaves text mode without text invalid', () => {
  const raw = JSON.stringify({
    intent: 'quick_answer',
    mode: 'text',
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal(normalized.ui, null);
  assert.equal(normalized.text, null);
  assert.equal(validateStructuredResponse(normalized), null);
});

test('normalization leaves ui mode without ui invalid', () => {
  const raw = JSON.stringify({
    intent: 'show_plan',
    mode: 'ui',
  });

  const normalized = parseAndNormalizeResponse(raw);
  assert.ok(normalized);
  assert.equal(normalized.text, null);
  assert.equal(normalized.behavior, null);
  assert.equal(validateStructuredResponse(normalized), null);
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

test('rejects component payloads that are missing required fields', () => {
  const invalidPayload = {
    intent: 'calc',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'calculationCard',
      data: {},
    },
    text: null,
    behavior: null,
  };

  const validated = validateStructuredResponse(invalidPayload);
  assert.equal(validated, null);
});

test('rejects mismatched component type declarations', () => {
  const invalidPayload = {
    intent: 'show_image',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'imageBlock',
      data: {
        imageMode: 'photo',
        caption: 'Arduino Uno',
        searchQuery: 'arduino uno',
      },
    },
    text: null,
    behavior: { animation: 'fadeIn', state: 'open' },
  };

  const validated = validateStructuredResponse(invalidPayload);
  assert.equal(validated, null);
});

test('rejects text mode responses without visible text', () => {
  const invalidPayload = {
    intent: 'explain_pwm',
    mode: 'text',
    ui: null,
    text: null,
    behavior: { animation: 'fadeIn', state: 'open' },
  };

  const validated = validateStructuredResponse(invalidPayload);
  assert.equal(validated, null);
});

test('rejects image responses that omit a caption', () => {
  const invalidPayload = {
    intent: 'show_image',
    mode: 'ui',
    ui: {
      type: 'image',
      component: 'imageBlock',
      data: {
        imageMode: 'photo',
        searchQuery: 'arduino uno',
      },
    },
    text: 'Arduino Uno board',
    behavior: { animation: 'fadeIn', state: 'open' },
  };

  const validated = validateStructuredResponse(invalidPayload);
  assert.equal(validated, null);
});

test('rejects pinout responses with unsupported pin types', () => {
  const invalidPayload = {
    intent: 'show_pinout',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'pinoutCard',
      data: {
        component: 'ATmega328P',
        pins: [{ number: 1, label: 'VCC', type: 'voltage' }],
      },
    },
    text: 'Pin 1 is VCC.',
    behavior: { animation: 'fadeIn', state: 'open' },
  };

  const validated = validateStructuredResponse(invalidPayload);
  assert.equal(validated, null);
});

test('rejects chart responses with non-finite values', () => {
  const invalidPayload = {
    intent: 'compare_power',
    mode: 'ui',
    ui: {
      type: 'chart',
      component: 'chartCard',
      data: {
        title: 'Power Draw',
        bars: [{ label: 'ESP32', value: Number.NaN, unit: 'mA' }],
      },
    },
    text: 'ESP32 power draw comparison.',
    behavior: { animation: 'slideUp', state: 'open' },
  };

  const validated = validateStructuredResponse(invalidPayload);
  assert.equal(validated, null);
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
