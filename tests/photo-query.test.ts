import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveDisplaySubject,
  derivePhotoQuery,
  derivePhotoQueryFromContext,
  extractNamedOptions,
  refineStructuredResponseForRequest,
  stabilizeStructuredResponseForRequest,
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

test('extractNamedOptions resolves common comparison phrasing', () => {
  assert.deepEqual(extractNamedOptions('Compare Arduino Uno vs Raspberry Pi Pico'), [
    'Arduino Uno',
    'Raspberry Pi Pico',
  ]);
  assert.deepEqual(
    extractNamedOptions(
      'Should I use a reed switch, tilt sensor, accelerometer, or optical sensor?'
    ),
    ['Reed Switch', 'Tilt Sensor', 'Accelerometer', 'Optical Sensor']
  );
});

test('deriveDisplaySubject keeps electronics-specific titles stable', () => {
  assert.equal(deriveDisplaySubject('What resistor for a red LED on 5V?'), 'LED resistor');
  assert.equal(deriveDisplaySubject('Show me ESP32 pinout'), 'ESP32');
});

test('deriveDisplaySubject keeps robotics part names canonical', () => {
  assert.equal(
    deriveDisplaySubject('Show me what an HC-SR04 ultrasonic sensor looks like'),
    'HC-SR04 ultrasonic sensor'
  );
  assert.equal(deriveDisplaySubject('Show MPU-6050 IMU pinout'), 'MPU-6050 IMU');
  assert.equal(
    deriveDisplaySubject('Wire a PCA9685 servo driver to a Raspberry Pi Pico'),
    'Raspberry Pi Pico'
  );
});

test('extractNamedOptions handles robotics actuator comparisons', () => {
  assert.deepEqual(extractNamedOptions('Compare NEMA 17 stepper motor vs SG90 micro servo'), [
    'NEMA 17 Stepper Motor',
    'SG90 Micro Servo',
  ]);
});

test('stabilizeStructuredResponseForRequest replaces generic labels from request context', () => {
  const stabilized = stabilizeStructuredResponseForRequest(
    {
      intent: 'show_pinout',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'pinoutCard',
        data: {
          component: 'Electronic component',
          pins: [{ number: 1, label: '3V3', type: 'power' }],
        },
      },
      text: null,
      behavior: null,
    },
    'Show me ESP32 pinout'
  );

  assert.equal(stabilized.mode, 'ui');
  assert.equal(stabilized.ui?.component, 'pinoutCard');
  assert.equal(stabilized.ui?.data.component, 'ESP32');
});

test('stabilizeStructuredResponseForRequest aligns comparison items from user wording', () => {
  const stabilized = stabilizeStructuredResponseForRequest(
    {
      intent: 'compare_boards',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'comparisonCard',
        data: {
          items: ['Option 1', 'Option 2'],
          attributes: [{ name: 'Best for', values: ['Beginner board', 'Fast prototyping'] }],
          keyDifferences: ['Different ecosystems.'],
        },
      },
      text: null,
      behavior: null,
    },
    'Compare Arduino Uno vs Raspberry Pi Pico'
  );

  assert.equal(stabilized.mode, 'ui');
  assert.equal(stabilized.ui?.component, 'comparisonCard');
  assert.deepEqual(stabilized.ui?.data.items, ['Arduino Uno', 'Raspberry Pi Pico']);
});

test('stabilizeStructuredResponseForRequest fixes robotics image captions', () => {
  const stabilized = stabilizeStructuredResponseForRequest(
    {
      intent: 'show_image',
      mode: 'ui',
      ui: {
        type: 'image',
        component: 'imageBlock',
        data: {
          imageMode: 'photo',
          caption: 'Electronic component',
          searchQuery: 'component',
        },
      },
      text: null,
      behavior: null,
    },
    'Show me what an HC-SR04 ultrasonic sensor looks like'
  );

  assert.equal(stabilized.mode, 'ui');
  assert.equal(stabilized.ui?.component, 'imageBlock');
  assert.equal(stabilized.ui?.data.caption, 'HC-SR04 ultrasonic sensor');
  assert.equal(stabilized.ui?.data.searchQuery, 'hc-sr04 ultrasonic sensor');
});

test('stabilizeStructuredResponseForRequest fixes robotics wiring titles', () => {
  const stabilized = stabilizeStructuredResponseForRequest(
    {
      intent: 'wire_motor_driver',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'wiringCard',
        data: {
          title: 'Wiring guide',
          steps: [{ from: 'Driver GND', to: 'Controller GND', wire: 'black' }],
        },
      },
      text: null,
      behavior: null,
    },
    'How do I wire an L298N motor driver to an Arduino Uno robot?'
  );

  assert.equal(stabilized.mode, 'ui');
  assert.equal(stabilized.ui?.component, 'wiringCard');
  assert.equal(stabilized.ui?.data.title, 'Arduino Uno wiring');
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
