import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getImageSourceCandidates,
  matchImageFallbackDiagram,
  selectUsableImageCandidates,
  shouldRestoreLoadedThumbnail,
  shouldUpgradeToFullImage,
} from '@/lib/ui/image-sources';

test('loads the smaller thumbnail before the full image', () => {
  assert.deepEqual(
    getImageSourceCandidates('https://example.com/full.jpg', 'https://example.com/thumb.jpg'),
    ['https://example.com/thumb.jpg', 'https://example.com/full.jpg']
  );
});

test('upgrades a loaded thumbnail to the full-resolution source', () => {
  assert.equal(
    shouldUpgradeToFullImage(
      'https://example.com/thumb.jpg',
      'https://example.com/full.jpg',
      'https://example.com/thumb.jpg',
      true
    ),
    true
  );
  assert.equal(
    shouldUpgradeToFullImage(
      'https://example.com/full.jpg',
      'https://example.com/full.jpg',
      'https://example.com/thumb.jpg',
      true
    ),
    false
  );
});

test('deduplicates identical sources and always keeps the full image fallback', () => {
  assert.deepEqual(
    getImageSourceCandidates('https://example.com/image.jpg', 'https://example.com/image.jpg'),
    ['https://example.com/image.jpg']
  );
  assert.deepEqual(getImageSourceCandidates('https://example.com/full.jpg'), [
    'https://example.com/full.jpg',
  ]);
});

test('promotes reserve candidates when an earlier image exhausts its sources', () => {
  const candidates = [
    { url: 'https://example.com/first.jpg' },
    { url: 'https://example.com/second.jpg' },
    { url: 'https://example.com/reserve.jpg' },
  ];

  assert.deepEqual(selectUsableImageCandidates(candidates, new Set(), 2), candidates.slice(0, 2));
  assert.deepEqual(
    selectUsableImageCandidates(candidates, new Set([candidates[0]!.url]), 2),
    candidates.slice(1)
  );
  assert.deepEqual(selectUsableImageCandidates(candidates, new Set(), 0), []);
});

test('restores a proven thumbnail if the full-resolution render fails', () => {
  assert.equal(
    shouldRestoreLoadedThumbnail(
      'https://example.com/full.jpg',
      'https://example.com/full.jpg',
      'https://example.com/thumb.jpg',
      true
    ),
    true
  );
  assert.equal(
    shouldRestoreLoadedThumbnail(
      'https://example.com/full.jpg',
      'https://example.com/full.jpg',
      'https://example.com/thumb.jpg',
      false
    ),
    false
  );
});

test('uses only semantically matching built-in diagram fallbacks', () => {
  assert.equal(matchImageFallbackDiagram('voltage divider circuit'), 'voltage-divider');
  assert.equal(matchImageFallbackDiagram('LED circuit on a breadboard'), 'breadboard');
  assert.equal(matchImageFallbackDiagram('simple LED circuit'), 'led-circuit');
  assert.equal(matchImageFallbackDiagram('pulse width signal'), 'pwm');
  assert.equal(matchImageFallbackDiagram('RC capacitor charge curve'), 'capacitor-charge');

  assert.equal(matchImageFallbackDiagram('OLED display module'), null);
  assert.equal(matchImageFallbackDiagram('voltage sensor module'), null);
  assert.equal(matchImageFallbackDiagram('plain electrolytic capacitor'), null);
});
