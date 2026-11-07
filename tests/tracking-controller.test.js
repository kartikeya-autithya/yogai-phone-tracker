import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisibleBoundingBox, getPreviewAngles, toDisplayPoint } from '../src/tracking-controller.js';
import { DEFAULT_SETTINGS } from '../src/utils/configuration.js';

test('visible landmarks produce a normalized bounding box', () => {
  const landmarks = Array.from({ length: 10 }, (_, i) => ({
    x: 0.2 + i * 0.02,
    y: 0.3 + i * 0.01,
    visibility: 0.9,
  }));
  const box = getVisibleBoundingBox(landmarks, 0.5, 8);
  assert.ok(box);
  assert.ok(box.minX <= box.centerX && box.centerX <= box.maxX);
  assert.ok(box.minY <= box.centerY && box.centerY <= box.maxY);
});

test('missing or unreliable landmarks return null', () => {
  assert.equal(getVisibleBoundingBox([], 0.5, 8), null);
  assert.equal(getVisibleBoundingBox([{ x: 0.2, y: 0.2, visibility: 0.1 }], 0.5, 1), null);
});

test('mirrored preview reverses only the horizontal coordinate', () => {
  assert.deepEqual(toDisplayPoint(0.2, 0.7, true), { x: 0.8, y: 0.7 });
});

test('preview angles remain neutral inside the dead zone', () => {
  const result = getPreviewAngles({ centerX: 0.5, centerY: 0.5, settings: DEFAULT_SETTINGS });
  assert.equal(result.yaw, DEFAULT_SETTINGS.yawNeutral);
  assert.equal(result.tilt, DEFAULT_SETTINGS.tiltNeutral);
  assert.equal(result.outsideDeadZone, false);
});

test('preview angles stay within configured firmware limits', () => {
  const result = getPreviewAngles({ centerX: 1, centerY: 1, settings: DEFAULT_SETTINGS });
  assert.ok(result.yaw <= DEFAULT_SETTINGS.yawMax && result.yaw >= DEFAULT_SETTINGS.yawMin);
  assert.ok(result.tilt <= DEFAULT_SETTINGS.tiltMax && result.tilt >= DEFAULT_SETTINGS.tiltMin);
  assert.equal(result.outsideDeadZone, true);
});
