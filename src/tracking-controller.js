// Pure tracking math used by Phase 2's visual preview and later servo control.
// No DOM, camera, MediaPipe, or serial dependencies live in this module.

export const POSE_CONNECTIONS = Object.freeze([
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 29], [29, 31], [27, 31],
  [28, 30], [30, 32], [28, 32],
  [15, 17], [15, 19], [15, 21], [17, 19],
  [16, 18], [16, 20], [16, 22], [18, 20],
]);

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Calculate a visible-landmark bounding box from MediaPipe's normalized landmarks. */
export function getVisibleBoundingBox(landmarks, minVisibility = 0.5, minVisible = 8) {
  if (!Array.isArray(landmarks)) return null;
  const visible = landmarks.map((lm, index) => ({ lm, index })).filter(({ lm }) =>
    Number.isFinite(lm?.x) && Number.isFinite(lm?.y) &&
    (lm.visibility ?? 1) >= minVisibility &&
    lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1
  );
  if (visible.length < minVisible) return null;
  const points = visible.map(({ lm }) => lm);

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = clamp(Math.min(...xs), 0, 1);
  const maxX = clamp(Math.max(...xs), 0, 1);
  const minY = clamp(Math.min(...ys), 0, 1);
  const maxY = clamp(Math.max(...ys), 0, 1);
  const width = maxX - minX;
  const height = maxY - minY;
  if (Math.max(width, height) < 0.05) return null;

  return {
    minX, maxX, minY, maxY, width, height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    visibleCount: points.length,
    visibleIndices: visible.map(({ index }) => index),
  };
}

/** Convert source-frame centre into the coordinate system shown in the preview. */
export function toDisplayPoint(x, y, mirrored) {
  return { x: mirrored ? 1 - x : x, y };
}

/**
 * Phase 2 only: estimates the angles that would be requested for the current
 * camera offset. No commands are sent to the Arduino in this phase.
 */
export function getPreviewAngles({
  centerX,
  centerY,
  settings,
}) {
  const ex = centerX - 0.5;
  const ey = centerY - 0.5;
  const dx = settings.deadZoneX;
  const dy = settings.deadZoneY;

  const mapAxis = (error, dead, neutral, min, max, direction) => {
    if (Math.abs(error) <= dead) return neutral;
    const available = error > 0 ? max - neutral : neutral - min;
    const fraction = clamp((Math.abs(error) - dead) / (0.5 - dead), 0, 1);
    return Math.round(clamp(
      neutral + Math.sign(error) * direction * fraction * available,
      min,
      max,
    ));
  };

  return {
    yaw: mapAxis(ex, dx, settings.yawNeutral, settings.yawMin, settings.yawMax, settings.yawDirection),
    tilt: mapAxis(ey, dy, settings.tiltNeutral, settings.tiltMin, settings.tiltMax, settings.tiltDirection),
    errorX: ex,
    errorY: ey,
    outsideDeadZone: Math.abs(ex) > dx || Math.abs(ey) > dy,
  };
}

/**
 * Closed-loop controller for a camera physically attached to the servo mount.
 * The camera sees the mount move, so the controller integrates small corrections
 * until the person's centre returns to the configured dead zone.
 */
export function createServoTrackingController(settings, initialAngles = {}) {
  let yaw = clamp(
    Number.isFinite(initialAngles.yaw) ? initialAngles.yaw : settings.yawNeutral,
    settings.yawMin,
    settings.yawMax,
  );
  let tilt = clamp(
    Number.isFinite(initialAngles.tilt) ? initialAngles.tilt : settings.tiltNeutral,
    settings.tiltMin,
    settings.tiltMax,
  );
  let activeSettings = { ...settings };
  let filteredX = null;
  let filteredY = null;
  let lastUpdateMs = null;

  function update({ centerX, centerY, timestampMs = performance.now() }) {
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      return { ...getAngles(), detected: false, outsideDeadZone: false, errorX: 0, errorY: 0 };
    }

    const x = clamp(centerX, 0, 1);
    const y = clamp(centerY, 0, 1);
    const cfg = activeSettings;
    const alpha = cfg.emaAlpha;
    if (filteredX === null || filteredY === null) {
      filteredX = x;
      filteredY = y;
    } else {
      filteredX += alpha * (x - filteredX);
      filteredY += alpha * (y - filteredY);
    }

    const dt = lastUpdateMs === null
      ? 1 / cfg.controlHz
      : clamp((timestampMs - lastUpdateMs) / 1000, 0, 0.15);
    lastUpdateMs = timestampMs;

    const errorX = filteredX - 0.5;
    const errorY = filteredY - 0.5;
    const outsideX = Math.abs(errorX) > cfg.deadZoneX;
    const outsideY = Math.abs(errorY) > cfg.deadZoneY;

    const velocityFor = (error, deadZone, gain) => {
      const excess = Math.max(0, Math.abs(error) - deadZone);
      // gain is expressed in degrees per control tick per unit of normalised error.
      // Multiplying by controlHz converts it to a rate, then firmware and host
      // speed limits keep the resulting movement bounded.
      return Math.min(cfg.maxSpeedDegPerS, gain * cfg.controlHz * excess);
    };

    if (outsideX && dt > 0) {
      const speed = velocityFor(errorX, cfg.deadZoneX, cfg.gainYaw);
      yaw += Math.sign(errorX) * cfg.yawDirection * speed * dt;
      yaw = clamp(yaw, cfg.yawMin, cfg.yawMax);
    }
    if (outsideY && dt > 0) {
      const speed = velocityFor(errorY, cfg.deadZoneY, cfg.gainTilt);
      tilt += Math.sign(errorY) * cfg.tiltDirection * speed * dt;
      tilt = clamp(tilt, cfg.tiltMin, cfg.tiltMax);
    }

    return {
      ...getAngles(),
      detected: true,
      outsideDeadZone: outsideX || outsideY,
      errorX,
      errorY,
      filteredX,
      filteredY,
    };
  }

  function setAngles(nextYaw, nextTilt) {
    yaw = clamp(Math.round(nextYaw), activeSettings.yawMin, activeSettings.yawMax);
    tilt = clamp(Math.round(nextTilt), activeSettings.tiltMin, activeSettings.tiltMax);
    return getAngles();
  }

  function getAngles() {
    return { yaw: Math.round(yaw), tilt: Math.round(tilt) };
  }

  function setSettings(nextSettings) {
    activeSettings = { ...nextSettings };
    yaw = clamp(yaw, activeSettings.yawMin, activeSettings.yawMax);
    tilt = clamp(tilt, activeSettings.tiltMin, activeSettings.tiltMax);
    return getAngles();
  }

  function resetPositionFilter() {
    filteredX = null;
    filteredY = null;
    lastUpdateMs = null;
  }

  return Object.freeze({ update, setAngles, setSettings, getAngles, resetPositionFilter });
}
