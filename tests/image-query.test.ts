import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCuratedProfile,
  getSceneProfile,
  preprocessImageQuery,
} from '@/app/api/image-search/query';

test('photo-question cleanup preserves the named component', () => {
  assert.equal(preprocessImageQuery('what does ESP32 look like'), 'ESP32 board');
  assert.equal(preprocessImageQuery('what do Arduino boards look like'), 'Arduino boards');
});

test('curated aliases match complete terms rather than substrings', () => {
  assert.equal(getCuratedProfile('OLED display module')?.id, 'oled-ssd1306');
  assert.notEqual(getCuratedProfile('OLED display module')?.id, 'led-component');
  assert.equal(getCuratedProfile('spotlight module'), null);
  assert.equal(getCuratedProfile('pot module')?.id, 'potentiometer');
});

test('multi-object scene queries are not collapsed into one component profile', () => {
  assert.equal(
    getSceneProfile('pegboard oscilloscope soldering station component drawers')?.id,
    'electronics-workbench-scene'
  );
  assert.equal(
    getSceneProfile('esp32 breadboard jumper wires oscilloscope')?.preferredQuery,
    'electronics workbench oscilloscope soldering'
  );
  assert.equal(
    getSceneProfile('patch panel poe switch cable labels service loops')?.preferredQuery,
    'network rack ethernet switch patch panel'
  );

  assert.equal(getSceneProfile('show an ESP32 development board'), null);
  assert.equal(getSceneProfile('show jumper wires for a breadboard'), null);
  assert.equal(getSceneProfile('show a standalone patch panel'), null);
});
