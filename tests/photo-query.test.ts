import test from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePhotoQuery,
  derivePhotoQueryFromContext,
  refineStructuredResponseForRequest,
} from '@/app/api/chat/route';

test('derivePhotoQuery removes generic image wording from direct requests', () => {
  assert.equal(derivePhotoQuery('show me an Arduino image'), 'arduino');
  assert.equal(derivePhotoQuery('can you show me a photo of the ESP32 board'), 'esp32 board');
});

test('derivePhotoQuery prefers concrete subjects in long visual prompts', () => {
  assert.equal(
    derivePhotoQuery(
      'I want images of real DIY electronics workbench setups, not generic offices.'
    ),
    'pegboard oscilloscope soldering station component drawers'
  );
  assert.equal(
    derivePhotoQuery(
      'Show me practical photos of structured media panels with patch panels and PoE switches.'
    ),
    'patch panel poe switch cable labels service loops'
  );
  assert.equal(
    derivePhotoQuery(
      'Show me inspiration images for an ESP32 and sensor prototyping station with breadboards.'
    ),
    'esp32 breadboard jumper wires oscilloscope'
  );
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

test('refineStructuredResponseForRequest improves shallow model photo queries', () => {
  const refined = refineStructuredResponseForRequest(
    {
      intent: 'show_image',
      mode: 'ui',
      ui: {
        type: 'image',
        component: 'imageBlock',
        data: {
          imageMode: 'photo',
          searchQuery: 'DIY electronics workbench',
          caption: 'DIY electronics workbench setups',
        },
      },
      text: null,
      behavior: null,
    },
    'I want images of real DIY electronics workbench setups, not generic modern offices.'
  );

  assert.equal(refined.mode, 'ui');
  assert.equal(refined.ui?.component, 'imageBlock');
  assert.equal(
    refined.ui?.data.searchQuery,
    'pegboard oscilloscope soldering station component drawers'
  );
});

test('refineStructuredResponseForRequest converts named recommendations to comparisons', () => {
  const refined = refineStructuredResponseForRequest(
    {
      intent: 'choose_sensor',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'recommendationCard',
        data: {
          items: [
            { name: 'Reed switch', reason: 'Best for simple closed/open detection.' },
            { name: 'Tilt sensor', reason: 'Useful when the angle matters.' },
          ],
          highlights: ['Reed switches are easiest to make reliable.'],
        },
      },
      text: null,
      behavior: null,
    },
    'Should I use a reed switch, tilt sensor, accelerometer, or optical sensor?'
  );

  assert.equal(refined.mode, 'ui');
  assert.equal(refined.ui?.component, 'comparisonCard');
  assert.deepEqual(refined.ui?.data.items, ['Reed switch', 'Tilt sensor']);
});

test('refineStructuredResponseForRequest preserves open-ended recommendations', () => {
  const refined = refineStructuredResponseForRequest(
    {
      intent: 'shed_architecture',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'recommendationCard',
        data: {
          items: [
            { name: 'ESP32', reason: 'Main controller for sensors and Home Assistant.' },
            { name: 'PIR sensor', reason: 'Motion input for lighting automation.' },
          ],
          highlights: ['Use weatherproof enclosures in a shed.'],
        },
      },
      text: null,
      behavior: null,
    },
    'What architecture and parts should I use for an ESP32 shed sensor node?'
  );

  assert.equal(refined.mode, 'ui');
  assert.equal(refined.ui?.component, 'recommendationCard');
});

test('refineStructuredResponseForRequest converts design specs to recommendations', () => {
  const refined = refineStructuredResponseForRequest(
    {
      intent: 'charging_station',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'specCard',
        data: {
          title: 'Wall-mounted charging station',
          keySpecs: [
            { label: 'Shelves', value: 'Separate power tools from loose Li-ion packs.' },
            { label: 'Power', value: 'Use a switched strip and visible cable routing.' },
          ],
        },
      },
      text: null,
      behavior: null,
    },
    'Help me design a wall-mounted charging station for power tools and Li-ion packs.'
  );

  assert.equal(refined.mode, 'ui');
  assert.equal(refined.ui?.component, 'recommendationCard');
  assert.deepEqual(
    refined.ui?.data.items.map((item) => item.name),
    ['Shelves', 'Power']
  );
});
