// Single source of truth for tracker settings.
// Defaults mirror tracker.py (laptop tracker) and the limits enforced by
// public/firmware/servo_tracker.ino. The firmware is authoritative: it rejects
// out-of-range commands and clamps to its own limits, so settings here must be
// equal to or narrower than FIRMWARE_LIMITS.

/** Values copied from servo_tracker.ino. Change them here only if you change the firmware. */
export const FIRMWARE_LIMITS = Object.freeze({
  baud: 115200,
  yawRangeDeg: 180,
  tiltRangeDeg: 180,
  yawMin: 45,
  yawMax: 135,
  yawNeutral: 90,
  tiltMin: 60,
  tiltMax: 120,
  tiltNeutral: 90,
  maxSpeedDegPerS: 60,
  commandFormat: 'yaw,tilt\\n',
});

/** Safe SG90 defaults (see tracker.py for the origin of each value). */
export const DEFAULT_SETTINGS = Object.freeze({
  // Dead zone: fraction of the frame, measured +/- from the centre.
  deadZoneX: 0.08,
  deadZoneY: 0.08,

  // Smoothing / controller
  emaAlpha: 0.25,          // 0..1, lower = smoother but laggier
  controlHz: 20,           // controller update and serial send rate
  maxSpeedDegPerS: 40,     // host-side limit (firmware allows up to 60)
  minStepDeg: 0.3,         // ignore corrections smaller than this
  minSendDeltaDeg: 0.5,    // do not send moves smaller than this
  gainYaw: 12,             // degrees per update per unit of error beyond the dead zone
  gainTilt: 12,

  // Direction: +1 or -1. Calibrate on the real mount.
  yawDirection: 1,
  tiltDirection: 1,

  // Angles (mount degrees)
  yawNeutral: 90,
  tiltNeutral: 90,
  yawMin: 45,
  yawMax: 135,
  tiltMin: 60,
  tiltMax: 120,

  // Detection reliability (same as tracker.py)
  minVisibility: 0.5,
  minVisibleLandmarks: 8,
  minBboxFraction: 0.05,
  reacquireResetS: 0.7,

  // Serial
  baud: 115200,
  arduinoBootWaitMs: 2500,
  reconnectIntervalMs: 2000,
});

const STORAGE_KEY = 'yogai-phone-tracker.settings.v1';

/** Allowed numeric ranges for every setting that can be edited by the user. */
const RANGES = Object.freeze({
  deadZoneX: [0.01, 0.4],
  deadZoneY: [0.01, 0.4],
  emaAlpha: [0.05, 1],
  controlHz: [5, 30],
  maxSpeedDegPerS: [1, FIRMWARE_LIMITS.maxSpeedDegPerS],
  minStepDeg: [0, 5],
  minSendDeltaDeg: [0.1, 5],
  gainYaw: [0.5, 40],
  gainTilt: [0.5, 40],
  minVisibility: [0.1, 1],
  minVisibleLandmarks: [1, 33],
  minBboxFraction: [0.01, 1],
  reacquireResetS: [0.1, 5],
  arduinoBootWaitMs: [500, 10000],
  reconnectIntervalMs: [500, 30000],
});

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Returns { settings, warnings }. Unknown keys are dropped, non-numbers fall back to
 * the default, ranges are enforced, and angle limits are forced inside the firmware
 * limits with min < max and neutral inside [min, max].
 */
export function sanitizeSettings(input = {}) {
  const warnings = [];
  const out = { ...DEFAULT_SETTINGS };
  const src = input && typeof input === 'object' ? input : {};

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in src)) continue;
    const v = src[key];
    if (!isFiniteNumber(v)) {
      warnings.push(`${key}: not a number, default used`);
      continue;
    }
    out[key] = v;
  }

  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    const clamped = clamp(out[key], lo, hi);
    if (clamped !== out[key]) warnings.push(`${key}: ${out[key]} outside ${lo}..${hi}, set to ${clamped}`);
    out[key] = clamped;
  }

  out.minVisibleLandmarks = Math.round(out.minVisibleLandmarks);
  out.baud = FIRMWARE_LIMITS.baud;
  if (src.baud !== undefined && src.baud !== FIRMWARE_LIMITS.baud) {
    warnings.push(`baud: firmware uses ${FIRMWARE_LIMITS.baud}, value reset`);
  }

  for (const key of ['yawDirection', 'tiltDirection']) {
    if (out[key] !== 1 && out[key] !== -1) {
      warnings.push(`${key}: must be 1 or -1, default used`);
      out[key] = DEFAULT_SETTINGS[key];
    }
  }

  fixAxis(out, 'yaw', FIRMWARE_LIMITS.yawMin, FIRMWARE_LIMITS.yawMax, warnings);
  fixAxis(out, 'tilt', FIRMWARE_LIMITS.tiltMin, FIRMWARE_LIMITS.tiltMax, warnings);

  return { settings: Object.freeze(out), warnings };
}

function fixAxis(s, axis, fwMin, fwMax, warnings) {
  const minKey = `${axis}Min`;
  const maxKey = `${axis}Max`;
  const neutralKey = `${axis}Neutral`;

  let lo = clamp(Math.round(s[minKey]), fwMin, fwMax);
  let hi = clamp(Math.round(s[maxKey]), fwMin, fwMax);
  if (lo !== s[minKey] || hi !== s[maxKey]) {
    warnings.push(`${axis}: limits forced inside firmware range ${fwMin}..${fwMax}`);
  }
  if (lo >= hi) {
    warnings.push(`${axis}: min must be below max, firmware limits restored`);
    lo = fwMin;
    hi = fwMax;
  }
  const neutral = clamp(Math.round(s[neutralKey]), lo, hi);
  if (neutral !== s[neutralKey]) warnings.push(`${axis}: neutral moved inside ${lo}..${hi}`);

  s[minKey] = lo;
  s[maxKey] = hi;
  s[neutralKey] = neutral;
}

/** Loads saved settings, falling back to defaults on any problem. */
export function loadSettings(storage = safeLocalStorage()) {
  if (!storage) return sanitizeSettings({});
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return sanitizeSettings({});
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return sanitizeSettings({});
  }
}

/** Saves sanitised settings. Returns false if storage is unavailable. */
export function saveSettings(settings, storage = safeLocalStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings).settings));
    return true;
  } catch {
    return false;
  }
}

export function resetSettings(storage = safeLocalStorage()) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing to reset */
  }
  return sanitizeSettings({});
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
