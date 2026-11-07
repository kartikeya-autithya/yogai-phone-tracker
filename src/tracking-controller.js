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
