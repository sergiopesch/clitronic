import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRasterImageMimeType,
  hasOnlyPublicResolvedAddresses,
  isPrivateOrReservedAddress,
  isTrustedImageHost,
  normalizeHostname,
} from '@/app/api/image-proxy/route';

test('accepts known raster signatures and rejects active or spoofed content', () => {
  const png = new Uint8Array(128);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = new Uint8Array(128);
  jpeg.set([0xff, 0xd8, 0xff]);
  const webp = new Uint8Array(128);
  webp.set(new TextEncoder().encode('RIFF'), 0);
  webp.set(new TextEncoder().encode('WEBP'), 8);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  const spoofedHtml = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');

  assert.equal(detectRasterImageMimeType(png), 'image/png');
  assert.equal(detectRasterImageMimeType(jpeg), 'image/jpeg');
  assert.equal(detectRasterImageMimeType(webp), 'image/webp');
  assert.equal(detectRasterImageMimeType(svg), null);
  assert.equal(detectRasterImageMimeType(spoofedHtml), null);
});

test('normalizeHostname strips brackets and trailing dots', () => {
  assert.equal(normalizeHostname('[::1]'), '::1');
  assert.equal(normalizeHostname('Example.com.'), 'example.com');
});

test('allows only trusted image hosts', () => {
  assert.equal(isTrustedImageHost('upload.wikimedia.org'), true);
  assert.equal(isTrustedImageHost('imgs.search.brave.com'), true);
  assert.equal(isTrustedImageHost('foo.search.brave.com'), true);
  assert.equal(isTrustedImageHost('commons.wikimedia.org'), false);
  assert.equal(isTrustedImageHost('example.com'), false);
  assert.equal(isTrustedImageHost('localhost'), false);
});

test('rejects private, loopback, link-local, and reserved IP ranges', () => {
  const blocked = [
    '0.0.0.0',
    '10.0.0.4',
    '100.64.0.12',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.4.20',
    '192.168.1.10',
    '198.18.0.1',
    '203.0.113.8',
    '224.0.0.1',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:0:7f00:1',
    '100::1',
    '2001:db8::1',
  ];

  for (const address of blocked) {
    assert.equal(isPrivateOrReservedAddress(address), true, `${address} should be blocked`);
  }
});

test('allows public IP addresses', () => {
  assert.equal(isPrivateOrReservedAddress('8.8.8.8'), false);
  assert.equal(isPrivateOrReservedAddress('1.1.1.1'), false);
  assert.equal(isPrivateOrReservedAddress('2606:4700:4700::1111'), false);
});

test('rejects hostname resolutions when any address is non-public', () => {
  assert.equal(hasOnlyPublicResolvedAddresses(['8.8.8.8', '127.0.0.1']), false);
  assert.equal(hasOnlyPublicResolvedAddresses(['169.254.169.254']), false);
  assert.equal(hasOnlyPublicResolvedAddresses(['fd00::1']), false);
});

test('accepts hostname resolutions only when all addresses are public', () => {
  assert.equal(hasOnlyPublicResolvedAddresses(['8.8.8.8', '1.1.1.1']), true);
  assert.equal(
    hasOnlyPublicResolvedAddresses(['2606:4700:4700::1111', '2001:4860:4860::8888']),
    true
  );
});
