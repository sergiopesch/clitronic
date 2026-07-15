import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeStructuredResponse,
  StructuredResponseContractError,
} from '@/lib/ai/response-contract';

const validTextResponse = {
  intent: 'explain_voltage_divider',
  mode: 'text',
  ui: null,
  text: 'A voltage divider scales a voltage using two series resistors.',
  behavior: null,
  voice: null,
} as const;

test('decodes a valid server response before client state can consume it', () => {
  const structured = decodeStructuredResponse(validTextResponse);

  assert.equal(structured.intent, validTextResponse.intent);
  assert.equal(structured.text, validTextResponse.text);
});

test('rejects malformed successful payloads with one safe contract error', () => {
  const malformedPayloads: unknown[] = [
    null,
    'not an object',
    { intent: 'rate_limit' },
    {
      ...validTextResponse,
      mode: 'ui',
      text: null,
      ui: {
        type: 'card',
        component: 'unknownCard',
        data: {},
      },
    },
    {
      ...validTextResponse,
      ui: {
        type: 'card',
        component: 'explanationCard',
        data: {
          title: 'Conflicting card',
          summary: 'This card must not coexist with text mode.',
          keyPoints: ['One mode owns the response.'],
        },
      },
    },
  ];

  for (const payload of malformedPayloads) {
    assert.throws(
      () => decodeStructuredResponse(payload),
      (error: unknown) => {
        assert.ok(error instanceof StructuredResponseContractError);
        assert.equal(error.message, 'The server returned an invalid response. Please try again.');
        return true;
      }
    );
  }
});
