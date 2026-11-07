import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  FIRMWARE_LIMITS,
  sanitizeSettings,
  loadSettings,
  saveSettings,
  resetSettings,
} from '../src/utils/configuration.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('defaults match the firmware limits and tracker.py values', () => {
  assert.equal(DEFAULT_SETTINGS.yawMin, FIRMWARE_LIMITS.yawMin);
  assert.equal(DEFAULT_SETTINGS.yawMax, FIRMWARE_LIMITS.yawMax);
  assert.equal(DEFAULT_SETTINGS.tiltMin, FIRMWARE_LIMITS.tiltMin);
  assert.equal(DEFAULT_SETTINGS.tiltMax, FIRMWARE_LIMITS.tiltMax);
  assert.equal(DEFAULT_SETTINGS.yawNeutral, FIRMWARE_LIMITS.yawNeutral);
  assert.equal(DEFAULT_SETTINGS.tiltNeutral, FIRMWARE_LIMITS.tiltNeutral);
  assert.equal(DEFAULT_SETTINGS.baud, 115200);
  assert.equal(DEFAULT_SETTINGS.deadZoneX, 0.08);
  assert.equal(DEFAULT_SETTINGS.deadZoneY, 0.08);
  assert.equal(DEFAULT_SETTINGS.emaAlpha, 0.25);
  assert.equal(DEFAULT_SETTINGS.maxSpeedDegPerS, 40);
  assert.ok(DEFAULT_SETTINGS.maxSpeedDegPerS <= FIRMWARE_LIMITS.maxSpeedDegPerS);
});

test('empty input gives defaults with no warnings', () => {
  const { settings, warnings } = sanitizeSettings({});
  assert.deepEqual({ ...settings }, { ...DEFAULT_SETTINGS });
  assert.deepEqual(warnings, []);
});

test('angle limits cannot exceed the firmware limits', () => {
  const { settings, warnings } = sanitizeSettings({ yawMin: 0, yawMax: 180, tiltMin: 10, tiltMax: 170 });
  assert.equal(settings.yawMin, FIRMWARE_LIMITS.yawMin);
  assert.equal(settings.yawMax, FIRMWARE_LIMITS.yawMax);
  assert.equal(settings.tiltMin, FIRMWARE_LIMITS.tiltMin);
  assert.equal(settings.tiltMax, FIRMWARE_LIMITS.tiltMax);
  assert.ok(warnings.length > 0);
});

test('inverted limits are restored to firmware limits', () => {
  const { settings } = sanitizeSettings({ yawMin: 120, yawMax: 100 });
  assert.equal(settings.yawMin, FIRMWARE_LIMITS.yawMin);
  assert.equal(settings.yawMax, FIRMWARE_LIMITS.yawMax);
});

test('neutral is forced inside the limits', () => {
  const { settings } = sanitizeSettings({ yawMin: 60, yawMax: 100, yawNeutral: 130 });
  assert.equal(settings.yawNeutral, 100);
});

test('non-numbers and invalid directions fall back to defaults', () => {
  const { settings, warnings } = sanitizeSettings({ deadZoneX: 'wide', yawDirection: 0, tiltDirection: -1 });
  assert.equal(settings.deadZoneX, DEFAULT_SETTINGS.deadZoneX);
  assert.equal(settings.yawDirection, 1);
  assert.equal(settings.tiltDirection, -1);
  assert.ok(warnings.length >= 2);
});

test('speed cannot exceed the firmware speed and baud is fixed', () => {
  const { settings } = sanitizeSettings({ maxSpeedDegPerS: 500, baud: 9600 });
  assert.equal(settings.maxSpeedDegPerS, FIRMWARE_LIMITS.maxSpeedDegPerS);
  assert.equal(settings.baud, 115200);
});

test('save, load and reset round-trip through storage', () => {
  const storage = memoryStorage();
  assert.equal(saveSettings({ deadZoneX: 0.12, yawDirection: -1 }, storage), true);
  const loaded = loadSettings(storage).settings;
  assert.equal(loaded.deadZoneX, 0.12);
  assert.equal(loaded.yawDirection, -1);
  const reset = resetSettings(storage);
  assert.equal(reset.settings.deadZoneX, 0.08);
  assert.equal(loadSettings(storage).settings.deadZoneX, 0.08);
});

test('corrupt stored JSON falls back to defaults', () => {
  const storage = memoryStorage();
  storage.setItem('yogai-phone-tracker.settings.v1', '{not json');
  assert.equal(loadSettings(storage).settings.deadZoneX, 0.08);
});

test('missing storage is handled', () => {
  assert.equal(saveSettings({}, null), false);
});
