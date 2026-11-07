import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWS,
  viewFromHash,
  hashForView,
  transportLabel,
  describeConnection,
  angleToPercent,
  trackingHint,
} from '../src/utils/panel-helpers.js';

test('only #arduino selects the Arduino panel', () => {
  assert.equal(viewFromHash('#arduino'), VIEWS.arduino);
  assert.equal(viewFromHash('#Arduino'), VIEWS.arduino);
  assert.equal(viewFromHash('arduino'), VIEWS.arduino);
  assert.equal(viewFromHash(''), VIEWS.camera);
  assert.equal(viewFromHash('#settings'), VIEWS.camera);
  assert.equal(viewFromHash(undefined), VIEWS.camera);
});

test('hash for each view round-trips', () => {
  assert.equal(viewFromHash(hashForView(VIEWS.arduino)), VIEWS.arduino);
  assert.equal(viewFromHash(hashForView(VIEWS.camera)), VIEWS.camera);
});

test('transport labels', () => {
  assert.equal(transportLabel('web-usb'), 'WebUSB');
  assert.equal(transportLabel('web-serial'), 'Web Serial');
  assert.equal(transportLabel('none'), 'None available');
  assert.equal(transportLabel(null), 'None available');
});

test('connected state names the active method', () => {
  const info = describeConnection({ connected: true, activeKind: 'web-usb', plannedKind: 'web-serial' });
  assert.equal(info.state, 'connected');
  assert.match(info.method, /WebUSB/);
  assert.doesNotMatch(info.method, /Web Serial/);
});

test('disconnected state names the method Connect will use', () => {
  const info = describeConnection({ connected: false, activeKind: 'web-serial', plannedKind: 'web-usb' });
  assert.equal(info.state, 'disconnected');
  assert.match(info.method, /WebUSB/);
});

test('disconnected with no USB API says so', () => {
  const info = describeConnection({ connected: false, activeKind: null, plannedKind: 'none' });
  assert.match(info.method, /No USB method/);
});

test('angle percent maps limits to 0 and 100 and clamps', () => {
  assert.equal(angleToPercent(45, 45, 135), 0);
  assert.equal(angleToPercent(135, 45, 135), 100);
  assert.equal(angleToPercent(90, 45, 135), 50);
  assert.equal(angleToPercent(0, 45, 135), 0);
  assert.equal(angleToPercent(500, 45, 135), 100);
});

test('angle percent is safe for invalid input', () => {
  assert.equal(angleToPercent(NaN, 45, 135), 50);
  assert.equal(angleToPercent(90, 135, 45), 50);
});

test('tracking hint covers every state', () => {
  assert.match(trackingHint({ cameraOn: false, connected: true, tracking: false }), /camera is off/i);
  assert.match(trackingHint({ cameraOn: true, connected: false, tracking: false }), /Connect the Arduino/);
  assert.match(trackingHint({ cameraOn: true, connected: true, tracking: false }), /Ready/);
  assert.match(trackingHint({ cameraOn: true, connected: true, tracking: true }), /Stop servo tracking/);
});
