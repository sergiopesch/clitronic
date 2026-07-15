import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ImageSearchPayloadError,
  parseImageSearchPayload,
} from '@/lib/images/image-search-contract';

test('parses a confident wire payload as ready and deduplicates top-level/gallery images', () => {
  const result = parseImageSearchPayload({
    url: 'https://imgs.search.brave.com/esp32.jpg#preview',
    thumbnail: 'https://imgs.search.brave.com/esp32-thumb.jpg',
    attribution: 'Example Labs',
    source: 'brave',
    score: 4.5,
    confident: true,
    queryUsed: 'ESP32 development board',
    images: [
      {
        url: 'https://imgs.search.brave.com/esp32.jpg#original',
        attribution: 'Duplicate result',
        source: 'brave',
      },
      {
        url: 'https://upload.wikimedia.org/board.jpg',
        thumbnail: 'https://upload.wikimedia.org/board-thumb.jpg',
        attribution: 'Wikimedia contributor',
        source: 'wikimedia',
      },
    ],
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.confident, true);
  assert.equal(result.queryUsed, 'ESP32 development board');
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates[0], {
    url: 'https://imgs.search.brave.com/esp32.jpg#preview',
    thumbnail: 'https://imgs.search.brave.com/esp32-thumb.jpg',
    attribution: 'Example Labs',
    source: 'brave',
    score: 4.5,
  });
});

test('parses a non-confident payload with candidates as possible', () => {
  const result = parseImageSearchPayload({
    url: 'https://upload.wikimedia.org/possible.jpg',
    source: 'wikimedia',
    confident: false,
    images: [],
  });

  assert.equal(result.status, 'possible');
  assert.equal(result.confident, false);
  assert.deepEqual(result.candidates, [
    { url: 'https://upload.wikimedia.org/possible.jpg', source: 'wikimedia' },
  ]);
});

test('parses the current no-result wire payload as empty', () => {
  const result = parseImageSearchPayload({
    url: null,
    confident: false,
    queryUsed: 'unknown component electronics',
  });

  assert.deepEqual(result, {
    status: 'empty',
    confident: false,
    candidates: [],
    queryUsed: 'unknown component electronics',
  });
});

test('rejects gallery-only confidence that the producer can never emit', () => {
  assert.throws(
    () =>
      parseImageSearchPayload({
        url: null,
        confident: true,
        images: [
          {
            url: 'https://upload.wikimedia.org/gallery-only.jpg',
            attribution: 'Gallery provider',
          },
        ],
      }),
    /scored top-level image/
  );
});

test('rejects confidence without a candidate and null top-level URL contradictions', () => {
  assert.throws(
    () => parseImageSearchPayload({ url: null, confident: true }),
    ImageSearchPayloadError
  );
  assert.throws(
    () =>
      parseImageSearchPayload({
        url: null,
        thumbnail: 'https://upload.wikimedia.org/orphan.jpg',
        confident: false,
      }),
    /cannot include top-level image metadata/
  );
});

test('rejects non-HTTP image URLs at every candidate level', () => {
  assert.throws(
    () => parseImageSearchPayload({ url: 'javascript:alert(1)', confident: true }),
    /proxy-supported HTTPS image URL/
  );
  assert.throws(
    () =>
      parseImageSearchPayload({
        url: null,
        confident: false,
        images: [{ url: 'data:image/png;base64,AAAA' }],
      }),
    /proxy-supported HTTPS image URL/
  );
  assert.throws(
    () =>
      parseImageSearchPayload({
        url: 'https://upload.wikimedia.org/image.jpg',
        thumbnail: '/relative-thumbnail.jpg',
        confident: true,
      }),
    /proxy-supported HTTPS image URL/
  );
});

test('rejects malformed fields and empty optional metadata', () => {
  const invalidPayloads: unknown[] = [
    null,
    [],
    { confident: false },
    { url: null, confident: 'false' },
    { url: null, confident: false, images: {} },
    { url: null, confident: false, images: [null] },
    { url: null, confident: false, queryUsed: '   ' },
    {
      url: 'https://upload.wikimedia.org/image.jpg',
      confident: true,
      attribution: '',
    },
    {
      url: 'https://upload.wikimedia.org/image.jpg',
      confident: true,
      source: 'unknown',
    },
    {
      url: 'https://upload.wikimedia.org/image.jpg',
      confident: true,
      score: Number.NaN,
    },
    {
      url: 'https://upload.wikimedia.org/image.jpg',
      confident: true,
      score: 1.99,
    },
    {
      url: 'https://upload.wikimedia.org/image.jpg',
      confident: false,
      images: Array.from({ length: 13 }, (_, index) => ({
        url: `https://upload.wikimedia.org/image-${index}.jpg`,
      })),
    },
  ];

  for (const payload of invalidPayloads) {
    assert.throws(() => parseImageSearchPayload(payload), ImageSearchPayloadError);
  }
});
