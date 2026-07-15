import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONVERSATION_CONTEXT_MAX_CHARS,
  serializeStructuredResponseContext,
} from '@/lib/ai/conversation-context';
import type { StructuredResponse } from '@/lib/ai/response-schema';

const behavior = { animation: 'fadeIn', state: 'open' } as const;

test('preserves calculation inputs, formula, result, and the exact spoken answer for follow-ups', () => {
  const response: StructuredResponse = {
    intent: 'calculate_led_resistor',
    mode: 'ui',
    behavior,
    text: 'Use the nearest standard value.',
    voice: { spokenSummary: 'Use a 330 ohm resistor for this LED.' },
    ui: {
      type: 'card',
      component: 'calculationCard',
      data: {
        title: 'LED resistor',
        formula: 'R = (Vs - Vf) / I',
        inputs: [
          { label: 'Vs', value: '5 V' },
          { label: 'Vf', value: '2 V' },
          { label: 'I', value: '10 mA' },
        ],
        result: { label: 'Resistance', value: '300 ohm', note: 'Choose 330 ohm.' },
      },
    },
  };

  const context = serializeStructuredResponseContext(response);
  assert.match(context, /Spoken answer: Use a 330 ohm resistor for this LED\./);
  assert.match(context, /Formula: R = \(Vs - Vf\) \/ I/);
  assert.match(context, /Vs=5 V/);
  assert.match(context, /Resistance=300 ohm/);
  assert.match(context, /Choose 330 ohm/);
});

test('retains wiring steps and warnings in canonical conversation history', () => {
  const response: StructuredResponse = {
    intent: 'wire_sensor',
    mode: 'ui',
    behavior,
    text: null,
    voice: null,
    ui: {
      type: 'card',
      component: 'wiringCard',
      data: {
        title: 'Sensor wiring',
        steps: [{ from: 'VCC', to: '3.3V', wire: 'red', note: 'Do not use 5V.' }],
        warnings: ['Disconnect power before wiring.'],
      },
    },
  };

  const context = serializeStructuredResponseContext(response);
  assert.match(context, /VCC -> 3\.3V \(red\)/);
  assert.match(context, /Do not use 5V/);
  assert.match(context, /Disconnect power before wiring/);
});

test('bounds large history entries while keeping the spoken answer at the front', () => {
  const response: StructuredResponse = {
    intent: 'explain',
    mode: 'ui',
    behavior,
    text: 'Visible details '.repeat(200),
    voice: { spokenSummary: 'The short answer users heard.' },
    ui: {
      type: 'card',
      component: 'explanationCard',
      data: {
        title: 'Long explanation',
        summary: 'Summary '.repeat(100),
        keyPoints: ['Point '.repeat(100)],
      },
    },
  };

  const context = serializeStructuredResponseContext(response);
  assert.ok(context.length <= CONVERSATION_CONTEXT_MAX_CHARS);
  assert.match(
    context,
    /^\[Rendered explanationCard\] — Spoken answer: The short answer users heard\./
  );
  assert.ok(context.endsWith('…'));
});
