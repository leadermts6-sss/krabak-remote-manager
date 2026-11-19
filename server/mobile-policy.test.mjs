import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileRequest } from './mobile-policy.mjs';

let browserDetection;
try {
  browserDetection = await import('../src/device-class.js');
} catch {}

test('browser device detection supports phones and iPadOS desktop mode', () => {
  assert.equal(typeof browserDetection?.isMobileBrowser, 'function', 'the browser must expose its mobile detector');
  assert.equal(browserDetection.isMobileBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile' }), true);
  assert.equal(browserDetection.isMobileBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' }), true);
  assert.equal(browserDetection.isMobileBrowser({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(browserDetection.isMobileBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0', platform: 'Win32', maxTouchPoints: 0 }), false);
  assert.equal(browserDetection.isMobileBrowser({ userAgent: 'Custom', userAgentData: { mobile: true } }), true);
});

test('mobile request metadata identifies mobile browsers to the server', () => {
  assert.equal(typeof browserDetection?.mobileRequestHeaders, 'function', 'the browser must expose mobile request metadata');
  const phone = { userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148 Safari/604.1' };
  assert.deepEqual(browserDetection.mobileRequestHeaders(phone), { 'X-Krabak-Device-Class': 'mobile' });
  assert.equal(browserDetection.mobileWebSocketQuery(phone), '?clientClass=mobile');
  assert.deepEqual(browserDetection.mobileRequestHeaders({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), {});
  assert.equal(browserDetection.mobileWebSocketQuery({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), '');
});

test('server request detection recognizes mobile headers and WebSocket query flags', () => {
  assert.equal(isMobileRequest({ headers: { 'sec-ch-ua-mobile': '?1' } }), true);
  assert.equal(isMobileRequest({ headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 15) Mobile' } }), true);
  assert.equal(isMobileRequest({ url: '/ws?clientClass=mobile', headers: {} }), true);
  assert.equal(isMobileRequest({ headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)', 'sec-ch-ua-mobile': '?0' } }), false);
});
