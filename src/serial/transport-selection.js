// Chooses which browser USB API to use. Chrome on Android before Android 17 exposes
// navigator.serial but lists no wired devices, while WebUSB works through the Android
// USB host API, so WebUSB is preferred on Android. Desktop keeps native Web Serial.

/**
 * @param {object} env browser-like environment (defaults to globalThis)
 * @returns {'web-usb' | 'web-serial' | 'none'}
 */
export function chooseUsbTransport(env = globalThis) {
  const nav = env.navigator ?? {};
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  const isAndroid = /Android/i.test(ua);
  const hasSerial = !!nav.serial && typeof nav.serial.requestPort === 'function';
  const hasUsb = !!nav.usb && typeof nav.usb.requestDevice === 'function';

  if (isAndroid && hasUsb) return 'web-usb';
  if (hasSerial) return 'web-serial';
  if (hasUsb) return 'web-usb';
  return 'none';
}
