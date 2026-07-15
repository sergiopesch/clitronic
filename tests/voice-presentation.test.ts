import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_SPEECH_MAX_CHARS, getCanonicalSpeechText } from '@/lib/ai/voice-presentation';
import type { StructuredResponse, UIBlock } from '@/lib/ai/response-schema';

function uiResponse(ui: UIBlock, overrides: Partial<StructuredResponse> = {}): StructuredResponse {
  return {
    intent: 'test',
    mode: 'ui',
    ui,
    text: null,
    behavior: null,
    ...overrides,
  } as StructuredResponse;
}

test('prefers a normalized spoken summary over response text and derived card copy', () => {
  const response = uiResponse(
    {
      type: 'card',
      component: 'explanationCard',
      data: { title: 'Derived title', summary: 'Derived summary', keyPoints: ['Derived point'] },
    },
    {
      text: 'Text fallback',
      voice: { spokenSummary: '  Preferred\n\nspoken\t summary.  ' },
    }
  );

  assert.equal(getCanonicalSpeechText(response), 'Preferred spoken summary.');
});

test('uses normalized text when the spoken summary is empty', () => {
  const response: StructuredResponse = {
    intent: 'answer',
    mode: 'text',
    ui: null,
    text: '  Use   the  measured\nvalue. ',
    behavior: null,
    voice: { spokenSummary: '   \n ' },
  };

  assert.equal(getCanonicalSpeechText(response), 'Use the measured value.');
});

test('derives useful speech for every visual-card component', () => {
  const cases: Array<{ ui: UIBlock; expected: string[] }> = [
    {
      ui: {
        type: 'card',
        component: 'specCard',
        data: {
          title: 'NE555 timer',
          subtitle: 'Bipolar timer IC',
          keySpecs: [{ label: 'Supply', value: '4.5 V to 16 V' }],
          optionalDetails: [{ label: 'Package', value: 'DIP-8' }],
        },
      },
      expected: ['NE555 timer', 'Supply: 4.5 V to 16 V', 'Package: DIP-8'],
    },
    {
      ui: {
        type: 'card',
        component: 'comparisonCard',
        data: {
          items: ['ESP32', 'RP2040'],
          attributes: [{ name: 'Wireless', values: ['Wi-Fi and Bluetooth', 'None built in'] }],
          keyDifferences: ['ESP32 includes wireless'],
          useCases: [{ item: 'RP2040', useCase: 'Deterministic PIO tasks' }],
        },
      },
      expected: [
        'Comparison: ESP32; RP2040',
        'ESP32: Wi-Fi and Bluetooth',
        'RP2040: None built in',
      ],
    },
    {
      ui: {
        type: 'card',
        component: 'explanationCard',
        data: {
          title: 'Pull-up resistor',
          summary: 'It defines the idle logic level.',
          keyPoints: ['The input reads high when the switch is open'],
        },
      },
      expected: ['Pull-up resistor', 'defines the idle logic level', 'input reads high'],
    },
    {
      ui: {
        type: 'card',
        component: 'recommendationCard',
        data: {
          items: [{ name: 'Bench supply', reason: 'Provides adjustable current limiting' }],
          highlights: ['Set the current limit before energizing'],
        },
      },
      expected: [
        'Bench supply',
        'adjustable current limiting',
        'Set the current limit before energizing',
      ],
    },
    {
      ui: {
        type: 'card',
        component: 'troubleshootingCard',
        data: {
          issue: 'The LED does not light',
          steps: [{ label: 'Check polarity', detail: 'Confirm anode and cathode orientation' }],
          tips: ['Measure the supply under load'],
        },
      },
      expected: [
        'Issue: The LED does not light',
        'Check polarity',
        'Measure the supply under load',
      ],
    },
    {
      ui: {
        type: 'card',
        component: 'calculationCard',
        data: {
          title: 'LED resistor',
          formula: 'R = (Vs - Vf) / I',
          inputs: [{ label: 'Supply', value: '5 V' }],
          result: { label: 'Resistance', value: '150 ohms', note: 'Use the next standard value' },
        },
      },
      expected: ['R = (Vs - Vf) / I', 'Supply: 5 V', 'Resistance: 150 ohms'],
    },
    {
      ui: {
        type: 'card',
        component: 'pinoutCard',
        data: {
          component: 'NE555',
          description: 'Eight-pin timer',
          pins: [{ number: 1, label: 'GND', type: 'ground' }],
        },
      },
      expected: ['Pinout for NE555', 'Eight-pin timer', '1, GND, ground'],
    },
    {
      ui: {
        type: 'chart',
        component: 'chartCard',
        data: {
          title: 'Current draw',
          subtitle: 'Measured at five volts',
          bars: [{ label: 'Idle', value: 42, unit: 'mA', color: 'accent' }],
        },
      },
      expected: ['Current draw', 'Measured at five volts', 'Idle: 42 mA'],
    },
    {
      ui: {
        type: 'card',
        component: 'wiringCard',
        data: {
          title: 'Sensor connection',
          description: 'Low-voltage I squared C bus',
          steps: [{ from: 'Sensor SDA', to: 'MCU SDA', wire: 'blue', note: 'Keep it short' }],
          warnings: ['Disconnect power before changing connections'],
        },
      },
      expected: [
        'Sensor connection',
        'Sensor SDA to MCU SDA',
        'Disconnect power before changing connections',
      ],
    },
    {
      ui: {
        type: 'image',
        component: 'imageBlock',
        data: {
          imageMode: 'diagram',
          diagramType: 'voltage-divider',
          labels: { VIN: 'Input voltage', VOUT: 'Divided output' },
          caption: 'Voltage-divider diagram',
          description: 'Two resistors between the input and ground',
          notes: ['Values determine the ratio'],
        },
      },
      expected: ['Voltage-divider diagram', 'VIN: Input voltage', 'Values determine the ratio'],
    },
  ];

  for (const { ui, expected } of cases) {
    const speech = getCanonicalSpeechText(uiResponse(ui));
    assert.ok(speech, `expected speech for ${ui.component}`);
    for (const fragment of expected) {
      assert.match(speech, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
  }
});

test('retains wiring safety warnings even when preferred speech must be shortened', () => {
  const warning = 'Isolate mains power and have a licensed electrician verify the circuit';
  const response = uiResponse(
    {
      type: 'card',
      component: 'wiringCard',
      data: {
        title: 'Mains planning overview',
        steps: [{ from: 'Supply', to: 'Load' }],
        warnings: [warning],
      },
    },
    { voice: { spokenSummary: `Overview ${'measurement '.repeat(80)}` } }
  );

  const speech = getCanonicalSpeechText(response);
  assert.ok(speech);
  assert.ok(speech.length <= CANONICAL_SPEECH_MAX_CHARS);
  assert.match(speech, new RegExp(warning));
  assert.match(speech, /… Isolate mains power/);
});

test('does not add electrical precautions that are absent from a wiring card', () => {
  const response = uiResponse({
    type: 'card',
    component: 'wiringCard',
    data: {
      title: 'LED breadboard connection',
      steps: [{ from: 'GPIO 4', to: 'Resistor' }],
    },
  });

  assert.equal(
    getCanonicalSpeechText(response),
    'LED breadboard connection. Connections: 1, GPIO 4 to Resistor.'
  );
});

test('uses card facts for UI narration and retains recommendation highlights', () => {
  const response = uiResponse(
    {
      type: 'card',
      component: 'recommendationCard',
      data: {
        items: [{ name: 'Fuse holder', reason: 'Matches the enclosure' }],
        highlights: ['Use the specified fuse type and rating'],
      },
    },
    { text: 'The card contains the recommended part.' }
  );

  assert.equal(
    getCanonicalSpeechText(response),
    'Recommendations: Fuse holder: Matches the enclosure. Use the specified fuse type and rating.'
  );
});

test('rejects a concise summary whose calculated value contradicts the card', () => {
  const response = uiResponse(
    {
      type: 'card',
      component: 'calculationCard',
      data: {
        title: 'LED resistor',
        formula: 'R = (Vs - Vf) / I',
        inputs: [
          { label: 'Supply', value: '5 V' },
          { label: 'Rejected candidate', value: '100 ohms' },
        ],
        result: { label: 'Resistance', value: '330 ohms' },
      },
    },
    { voice: { spokenSummary: 'Use a 100 ohm resistor.' } }
  );

  const speech = getCanonicalSpeechText(response);
  assert.ok(speech);
  assert.match(speech, /Resistance: 330 ohms/);
  assert.notEqual(speech, 'Use a 100 ohm resistor.');
  assert.match(speech, /Rejected candidate: 100 ohms/);
});

test('narrates deterministic safety augmentation from every supported card destination', () => {
  const guidance = 'Power safety: disconnect power and verify polarity before continuing.';
  const cases: UIBlock[] = [
    {
      type: 'card',
      component: 'troubleshootingCard',
      data: {
        issue: 'Motor stalls',
        steps: [{ label: 'Inspect', detail: 'Check the shaft' }],
        tips: [guidance],
      },
    },
    {
      type: 'card',
      component: 'explanationCard',
      data: { title: 'Power planning', summary: 'Plan the load.', keyPoints: [guidance] },
    },
    {
      type: 'card',
      component: 'comparisonCard',
      data: {
        items: ['Option A', 'Option B'],
        attributes: [{ name: 'Voltage', values: ['5 V', '12 V'] }],
        keyDifferences: [guidance],
      },
    },
    {
      type: 'image',
      component: 'imageBlock',
      data: { imageMode: 'photo', caption: 'Power module', notes: [guidance] },
    },
    {
      type: 'card',
      component: 'specCard',
      data: {
        title: 'Bench supply',
        keySpecs: [{ label: 'Output', value: '12 V' }],
        optionalDetails: [{ label: 'Safety', value: guidance }],
      },
    },
  ];

  for (const ui of cases) {
    const speech = getCanonicalSpeechText(
      uiResponse(ui, { voice: { spokenSummary: 'Here is the practical overview.' } })
    );
    assert.ok(speech, `expected speech for ${ui.component}`);
    assert.match(speech, new RegExp(guidance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('bounds long output to 600 characters at a word boundary', () => {
  const response: StructuredResponse = {
    intent: 'long answer',
    mode: 'text',
    ui: null,
    text: Array.from({ length: 180 }, (_, index) => `word${index}`).join(' '),
    behavior: null,
  };

  const speech = getCanonicalSpeechText(response);
  assert.ok(speech);
  assert.ok(speech.length <= CANONICAL_SPEECH_MAX_CHARS);
  assert.match(speech, /\u2026$/u);
  const speechWithoutEllipsis = speech.slice(0, -1);
  assert.equal(response.text.slice(0, speechWithoutEllipsis.length), speechWithoutEllipsis);
  assert.equal(response.text[speechWithoutEllipsis.length], ' ');
});

test('returns null when all available speech sources are empty', () => {
  const response = {
    intent: 'empty',
    mode: 'text',
    ui: null,
    text: ' \n ',
    behavior: null,
    voice: { spokenSummary: '\t' },
  } as StructuredResponse;

  assert.equal(getCanonicalSpeechText(response), null);
});
