import test from 'node:test';
import assert from 'node:assert/strict';
import { createServoTrackingController } from '../src/tracking-controller.js';
import { DEFAULT_SETTINGS } from '../src/utils/configuration.js';

function makeController(overrides = {}, initial = {}) {
  return createServoTrackingController({ ...DEFAULT_SETTINGS, ...overrides }, initial);
}

test('closed-loop controller holds angles inside the dead zone', () => {
  const controller = makeController();
  const before = controller.getAngles();
  const result = controller.update({ centerX: 0.52, centerY: 0.49, timestampMs: 1000 });
  assert.equal(result.outsideDeadZone, false);
  assert.deepEqual(controller.getAngles(), before);
});

test('person offset to the right produces a bounded yaw correction', () => {
  const controller = makeController();
  const result = controller.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 });
  assert.equal(result.outsideDeadZone, true);
  assert.ok(result.yaw > DEFAULT_SETTINGS.yawNeutral);
  assert.equal(result.tilt, DEFAULT_SETTINGS.tiltNeutral);
});

test('direction settings reverse an axis', () => {
  const controller = makeController({ yawDirection: -1 });
  controller.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 });
  assert.ok(controller.getAngles().yaw < DEFAULT_SETTINGS.yawNeutral);
});

test('servo targets never exceed firmware angle limits', () => {
  const controller = makeController();
  for (let i = 0; i < 100; i += 1) {
    controller.update({ centerX: 1, centerY: 1, timestampMs: 1000 + i * 50 });
  }
  const angles = controller.getAngles();
  assert.ok(angles.yaw <= DEFAULT_SETTINGS.yawMax);
  assert.ok(angles.yaw >= DEFAULT_SETTINGS.yawMin);
  assert.ok(angles.tilt <= DEFAULT_SETTINGS.tiltMax);
  assert.ok(angles.tilt >= DEFAULT_SETTINGS.tiltMin);
});

test('manual angle setting is rounded and clamped', () => {
  const controller = makeController();
  assert.deepEqual(controller.setAngles(999, -99), {
    yaw: DEFAULT_SETTINGS.yawMax,
    tilt: DEFAULT_SETTINGS.tiltMin,
  });
});

test('controller can retain a known manual target as its starting point', () => {
  const controller = makeController({}, { yaw: 105, tilt: 100 });
  assert.deepEqual(controller.getAngles(), { yaw: 105, tilt: 100 });
});


test('higher gain and speed produce faster correction for the same tracking error', () => {
  const slow = makeController({ gainYaw: 8, maxSpeedDegPerS: 25 });
  const fast = makeController({ gainYaw: 40, maxSpeedDegPerS: 90 });
  slow.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 });
  fast.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 });
  for (let i = 1; i <= 5; i += 1) {
    slow.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 + i * 50 });
    fast.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 + i * 50 });
  }
  assert.ok(fast.getAngles().yaw > slow.getAngles().yaw);
});

test('controller accepts live response settings without being recreated', () => {
  const controller = makeController({ gainYaw: 5, maxSpeedDegPerS: 20 });
  controller.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 });
  const before = controller.getAngles().yaw;
  controller.setSettings({ ...DEFAULT_SETTINGS, gainYaw: 40, maxSpeedDegPerS: 90 });
  for (let i = 1; i <= 5; i += 1) {
    controller.update({ centerX: 0.9, centerY: 0.5, timestampMs: 1000 + i * 50 });
  }
  assert.ok(controller.getAngles().yaw > before);
  assert.ok(controller.getAngles().yaw <= DEFAULT_SETTINGS.yawMax);
});
