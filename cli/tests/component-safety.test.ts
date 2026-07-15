import assert from 'node:assert/strict';
import test from 'node:test';

import { lookupComponent, type ElectronicsComponent } from '../src/data/index.js';

function component(id: string): ElectronicsComponent {
  const match = lookupComponent(id);
  assert.ok(match, `Expected catalog component "${id}"`);
  return match;
}

function specValue(item: ElectronicsComponent, label: string): string {
  const spec = item.specs.find((candidate) => candidate.label === label);
  assert.ok(spec, `Expected ${item.id} spec "${label}"`);
  return spec.value;
}

test('flyback guidance places the diode reverse-biased across an inductive load', () => {
  const diode = component('diode');
  assert.match(diode.circuitExample, /across (?:a|the) DC motor/i);
  assert.match(diode.circuitExample, /(?:stripe|cathode).*positive/i);
  assert.match(diode.circuitExample, /(?:anode|unbanded).*switched/i);
  assert.doesNotMatch(diode.circuitExample, /in series/i);
  assert.deepEqual(diode.datasheetInfo?.partNumbers, ['1N4007']);
});

test('motor switch guidance accounts for flyback orientation and stall current', () => {
  const transistor = component('transistor');
  const motor = component('dc-motor');
  const transistorGuidance = `${transistor.circuitExample} ${transistor.datasheetInfo?.tips}`;
  const motorGuidance = `${motor.circuitExample} ${motor.datasheetInfo?.tips}`;

  assert.match(transistorGuidance, /flyback/i);
  assert.match(transistorGuidance, /stall current/i);
  assert.match(motorGuidance, /(?:stripe|cathode).*positive/i);
  assert.match(motorGuidance, /stall current/i);
  assert.match(motorGuidance, /(?:MOSFET|motor driver)/i);
  assert.doesNotMatch(motorGuidance, /2N2222 for small motors/i);
  assert.deepEqual(transistor.datasheetInfo?.partNumbers, ['2N2222A', 'PN2222A']);
});

test('relay entry separates a bare relay from a driver module and sets a mains boundary', () => {
  const relay = component('relay');
  const guidance = `${relay.description} ${relay.circuitExample} ${relay.datasheetInfo?.pinout} ${relay.datasheetInfo?.tips}`;

  assert.match(guidance, /bare relay/i);
  assert.match(guidance, /relay module/i);
  assert.match(guidance, /extra-low-voltage DC/i);
  assert.match(guidance, /do not .*breadboard mains/i);
  assert.match(guidance, /licensed electrician/i);
});

test('RGB LED guidance does not exceed 20 mA with a 5 V supply', () => {
  const rgb = component('rgb-led');
  const guidance = `${rgb.circuitExample} ${rgb.datasheetInfo?.tips}`;

  assert.match(guidance, /220Ω resistors/i);
  assert.match(guidance, /at least 100Ω/i);
  assert.doesNotMatch(guidance, /56Ω/i);
});

test('GL5528 values match the cited 10 lux and dark-resistance conditions', () => {
  const ldr = component('photoresistor');
  const lightResistance = ldr.datasheetInfo?.characteristics.find(
    (item) => item.parameter === 'Light Resistance (10 lux)'
  );
  const darkResistance = ldr.datasheetInfo?.characteristics.find(
    (item) => item.parameter === 'Dark Resistance'
  );

  assert.equal(specValue(ldr, 'Light Resistance (10 lux)'), '3 – 20 kΩ');
  assert.equal(specValue(ldr, 'Dark Resistance'), '≥ 10 MΩ');
  assert.deepEqual(lightResistance, {
    parameter: 'Light Resistance (10 lux)',
    min: '3',
    max: '20',
    unit: 'kΩ',
  });
  assert.deepEqual(darkResistance, {
    parameter: 'Dark Resistance',
    min: '10',
    unit: 'MΩ',
  });
  assert.deepEqual(ldr.datasheetInfo?.partNumbers, ['GL5528']);
});

test('TMP36 distinguishes typical accuracy, output load, and absolute limits', () => {
  const sensor = component('temp-sensor');
  const accuracyAt25 = sensor.datasheetInfo?.characteristics.find(
    (item) => item.parameter === 'Accuracy at 25°C (F grade)'
  );
  const accuracyOverRange = sensor.datasheetInfo?.characteristics.find(
    (item) => item.parameter === 'Accuracy over rated range (F grade)'
  );

  assert.equal(specValue(sensor, 'Accuracy'), '± 2°C typical over rated range');
  assert.deepEqual(accuracyAt25, {
    parameter: 'Accuracy at 25°C (F grade)',
    typical: '±1',
    max: '±2',
    unit: '°C',
  });
  assert.deepEqual(accuracyOverRange, {
    parameter: 'Accuracy over rated range (F grade)',
    typical: '±2',
    max: '±3',
    unit: '°C',
  });
  assert.ok(
    sensor.datasheetInfo?.maxRatings.some(
      (item) => item.parameter === 'Absolute Max Supply Voltage' && item.value === '7 V'
    )
  );
  assert.ok(
    sensor.datasheetInfo?.maxRatings.some(
      (item) => item.parameter === 'Storage Temperature' && item.value === '-65°C to +160°C'
    )
  );
  assert.match(sensor.datasheetInfo?.tips ?? '', /measured ADC reference/i);
  assert.doesNotMatch(sensor.datasheetInfo?.tips ?? '', /3\.3V as the analog reference/i);
  assert.ok(
    sensor.datasheetInfo?.partNumbers.every((partNumber) => partNumber.startsWith('TMP36'))
  );
});
