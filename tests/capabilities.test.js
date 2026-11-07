import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilities } from '../src/utils/capabilities.js';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const media = { getUserMedia() {} };

test('Android Chrome with Web Serial reports the web-serial route', () => {
  const caps = detectCapabilities({
    isSecureContext: true,
    navigator: { userAgent: ANDROID_UA, mediaDevices: media, serial: {}, usb: {}, maxTouchPoints: 5 },
    WebSocket: function WebSocket() {},
    WebAssembly: {},
  });
  assert.equal(caps.environment.isAndroid, true);
  assert.equal(caps.environment.androidVersion, '15');
  assert.equal(caps.environment.chromeVersion, 157);
  assert.equal(caps.camera.available, true);
  assert.equal(caps.usb.route, 'web-serial');
  assert.equal(caps.usb.needsOtgCable, true);
  assert.equal(caps.bluetooth.available, false);
});

test('WebUSB without Web Serial reports the webusb route', () => {
  const caps = detectCapabilities({
    isSecureContext: true,
    navigator: { userAgent: ANDROID_UA, mediaDevices: media, usb: {} },
  });
  assert.equal(caps.usb.route, 'webusb');
  assert.equal(caps.usb.available, true);
});

test('iPhone is never reported as USB capable', () => {
  const caps = detectCapabilities({
    isSecureContext: true,
    navigator: { userAgent: IPHONE_UA, mediaDevices: media, maxTouchPoints: 5 },
  });
  assert.equal(caps.environment.isIOS, true);
  assert.equal(caps.usb.available, false);
  assert.match(caps.usb.note, /native app/);
});

test('camera is unavailable outside a secure context', () => {
  const caps = detectCapabilities({
    isSecureContext: false,
    navigator: { userAgent: ANDROID_UA, mediaDevices: media },
  });
  assert.equal(caps.camera.available, false);
  assert.match(caps.camera.note, /HTTPS/);
});

test('empty environment does not throw and reports nothing available', () => {
  const caps = detectCapabilities({});
  assert.equal(caps.camera.available, false);
  assert.equal(caps.usb.available, false);
  assert.equal(caps.wifi.available, false);
  assert.equal(caps.wasm.available, false);
});

test('bluetooth note explains the HC-05 limitation', () => {
  const caps = detectCapabilities({ navigator: { bluetooth: {} } });
  assert.equal(caps.bluetooth.available, true);
  assert.match(caps.bluetooth.note, /HC-05/);
});
