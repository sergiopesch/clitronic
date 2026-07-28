import test from 'node:test';
import assert from 'node:assert/strict';
import expand from '../vendor/brace-expansion-compat/index.cjs';

test('brace-expansion adapter preserves legacy and modern interfaces', () => {
  assert.equal(typeof expand, 'function');
  assert.equal(expand.expand, expand);
  assert.deepEqual(expand('{a,b}{1,2}'), ['a1', 'a2', 'b1', 'b2']);
});

test('brace-expansion adapter enforces the patched output-length bound', () => {
  const output = expand('{a,b}'.repeat(50), {
    max: 100_000,
    maxLength: 1_000,
  });
  const outputLength = output.reduce((total, value) => total + value.length, 0);

  assert.equal(outputLength, 1_000);
  assert.equal(expand.EXPANSION_MAX_LENGTH, 4_000_000);
});
