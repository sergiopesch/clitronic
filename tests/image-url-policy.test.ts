import assert from 'node:assert/strict';
import test from 'node:test';
import { isProxyableImageUrl, isTrustedImageHostname } from '@/lib/images/image-url-policy';

test('accepts only HTTPS image URLs the proxy can actually serve', () => {
  assert.equal(isProxyableImageUrl('https://upload.wikimedia.org/example.jpg', 'wikimedia'), true);
  assert.equal(isProxyableImageUrl('https://imgs.search.brave.com/example.jpg', 'brave'), true);
  assert.equal(isProxyableImageUrl('http://upload.wikimedia.org/example.jpg'), false);
  assert.equal(isProxyableImageUrl('https://evil.example/example.jpg'), false);
  assert.equal(isProxyableImageUrl('https://user@upload.wikimedia.org/example.jpg'), false);
  assert.equal(isProxyableImageUrl('https://upload.wikimedia.org:444/example.jpg'), false);
  assert.equal(
    isProxyableImageUrl('https://imgs.search.brave.com/example.jpg', 'wikimedia'),
    false
  );
});

test('hostname matching is boundary-safe', () => {
  assert.equal(isTrustedImageHostname('upload.wikimedia.org'), true);
  assert.equal(isTrustedImageHostname('imgs.search.brave.com.'), true);
  assert.equal(isTrustedImageHostname('search.brave.com.evil.example'), false);
  assert.equal(isTrustedImageHostname('evilupload.wikimedia.org'), false);
});
