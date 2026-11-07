// Pure helpers for the two-view layout (Camera / Arduino Control Panel).
// No DOM access, so they can be unit tested.

export const VIEWS = Object.freeze({ camera: 'camera', arduino: 'arduino' });

/** '#arduino' selects the Arduino Control Panel; anything else is the camera screen. */
export function viewFromHash(hash) {
  const name = String(hash ?? '').replace(/^#/, '').trim().toLowerCase();
  return name === 'arduino' ? VIEWS.arduino : VIEWS.camera;
}

export function hashForView(view) {
  return view === VIEWS.arduino ? '#arduino' : '';
}

export function transportLabel(kind) {
  if (kind === 'web-usb') return 'WebUSB';
  if (kind === 'web-serial') return 'Web Serial';
  return 'None available';
}

/**
 * Text for the connection indicator.
 * @param {{connected: boolean, activeKind: string|null, plannedKind: string}} state
 */
export function describeConnection({ connected, activeKind, plannedKind }) {
  if (connected) {
    return {
      state: 'connected',
      headline: 'Arduino connected',
      method: `Connected via ${transportLabel(activeKind)}`,
    };
  }
  return {
    state: 'disconnected',
    headline: 'Arduino not connected',
    method: plannedKind === 'none'
      ? 'No USB method available in this browser'
      : `Connect Arduino will use ${transportLabel(plannedKind)}`,
  };
}

/** Position of an angle inside its limits as a 0–100 percentage for the position bars. */
export function angleToPercent(angle, min, max) {
  if (!Number.isFinite(angle) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 50;
  return Math.round(Math.max(0, Math.min(100, ((angle - min) / (max - min)) * 100)));
}

/** One-line guidance shown next to the Start/Stop tracking buttons. */
export function trackingHint({ cameraOn, connected, tracking }) {
  if (tracking) return 'Servo tracking is ON. Use Stop servo tracking at any time; the mount then holds its last position.';
  if (!cameraOn) return 'The camera is off. Tap Back to Camera and start the camera before tracking.';
  if (!connected) return 'Connect the Arduino to enable tracking.';
  return 'Ready. Start servo tracking once the phone is mounted and the mount is clear.';
}
