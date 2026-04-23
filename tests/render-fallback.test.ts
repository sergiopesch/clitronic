import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RENDER_FALLBACK_MESSAGE,
  getVisibleFallbackText,
} from '@/components/ui/render-fallback';
import type { StructuredResponse } from '@/lib/ai/response-schema';

test('prefers spoken summary for visible fallback text', () => {
  const response: StructuredResponse = {
    intent: 'show_image',
    mode: 'ui',
    ui: {
      type: 'image',
      component: 'imageBlock',
      data: {
        imageMode: 'photo',
        searchQuery: 'breadboard',
        caption: 'Breadboard',
      },
    },
    text: 'Here is a breadboard.',
    behavior: { animation: 'fadeIn', state: 'open' },
    voice: {
      spokenSummary: 'This is a solderless breadboard.',
    },
  };

  assert.equal(getVisibleFallbackText(response), 'This is a solderless breadboard.');
});

test('falls back to response text when spoken summary is missing', () => {
  const response: StructuredResponse = {
    intent: 'explain_pwm',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'explanationCard',
      data: {
        title: 'PWM basics',
        summary: 'Pulse-width modulation varies average power.',
        keyPoints: ['Duty cycle changes average output.'],
      },
    },
    text: 'Duty cycle changes the average output.',
    behavior: { animation: 'fadeIn', state: 'open' },
    voice: null,
  };

  assert.equal(getVisibleFallbackText(response), 'Duty cycle changes the average output.');
});

test('uses a generic message when no visible fallback text exists', () => {
  const response: StructuredResponse = {
    intent: 'compare_boards',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'comparisonCard',
      data: {
        items: ['Uno', 'Pico'],
        attributes: [{ name: 'CPU', values: ['AVR', 'ARM'] }],
        keyDifferences: ['Pico is faster.'],
      },
    },
    text: null,
    behavior: { animation: 'fadeIn', state: 'open' },
    voice: { spokenSummary: null },
  };

  assert.equal(getVisibleFallbackText(response), DEFAULT_RENDER_FALLBACK_MESSAGE);
});
