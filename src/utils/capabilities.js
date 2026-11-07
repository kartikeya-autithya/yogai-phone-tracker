// Real capability detection. Presence of an API is reported as "API present",
// never as proof that the Arduino will be reachable: only a hardware test shows that.

/**
 * @param {object} env  browser-like environment (defaults to globalThis); injectable for tests
 */
export function detectCapabilities(env = globalThis) {
  const nav = env.navigator ?? {};
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';

  const secure = env.isSecureContext === true;
  const hasMediaDevices = !!(nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function');
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  const isAndroid = /Android/i.test(ua);
  const chromeMatch = ua.match(/(?:Chrome|CriOS)\/(\d+)/);
  const chromeVersion = chromeMatch ? Number(chromeMatch[1]) : null;
  const androidMatch = ua.match(/Android\s+(\d+(?:\.\d+)?)/i);

  const webSerial = 'serial' in nav && !!nav.serial;
  const webUsb = 'usb' in nav && !!nav.usb;
  const webBluetooth = 'bluetooth' in nav && !!nav.bluetooth;
  const webSocket = typeof env.WebSocket === 'function';
  const wasm = typeof env.WebAssembly === 'object';
  const standalone = !!(env.matchMedia && env.matchMedia('(display-mode: standalone)').matches);

  const camera = {
    available: secure && hasMediaDevices,
    note: !secure
      ? 'Camera needs HTTPS (or localhost). This page is not in a secure context.'
      : !hasMediaDevices
        ? 'This browser does not expose camera access (getUserMedia).'
        : 'Camera API present. Permission is requested when you start the camera.',
  };

  let usbRoute = 'none';
  let usbNote;
  if (isIOS) {
    usbRoute = 'none';
    usbNote = 'iPhone/iPad browsers do not provide Web Serial or WebUSB. USB to the Arduino needs a native app.';
  } else if (webSerial) {
    usbRoute = 'web-serial';
    usbNote = 'Web Serial API present. Whether this phone lists the Arduino can only be confirmed by connecting it with a USB-OTG cable.';
  } else if (webUsb) {
    usbRoute = 'webusb';
    usbNote = 'Web Serial is missing but WebUSB is present. A WebUSB-based serial fallback may work for CDC-ACM boards such as the Uno; untested.';
  } else {
    usbRoute = 'none';
    usbNote = 'Neither Web Serial nor WebUSB is available here. Use desktop Chrome or Edge, or a native Android app for USB.';
  }

  return {
    environment: {
      secureContext: secure,
      isIOS,
      isAndroid,
      chromeVersion,
      androidVersion: androidMatch ? androidMatch[1] : null,
      standalone,
      userAgent: ua,
    },
    camera,
    webSerial: { available: webSerial, note: webSerial ? 'navigator.serial present.' : 'navigator.serial not present.' },
    webUsb: { available: webUsb, note: webUsb ? 'navigator.usb present.' : 'navigator.usb not present.' },
    usb: {
      route: usbRoute,
      available: usbRoute !== 'none',
      needsOtgCable: isAndroid || usbRoute === 'webusb',
      note: usbNote,
    },
    bluetooth: {
      available: webBluetooth,
      note: webBluetooth
        ? 'Web Bluetooth present. It supports Bluetooth Low Energy only. An HC-05 uses classic Bluetooth SPP, which browsers cannot open.'
        : 'Web Bluetooth not present. An HC-05 (classic Bluetooth) is not reachable from a browser in any case.',
    },
    wifi: {
      available: webSocket,
      note: webSocket
        ? 'WebSocket present. Browsers block ws:// from an https page, so a local Wi-Fi link needs a workaround (Phase 7).'
        : 'WebSocket not available.',
    },
    wasm: { available: wasm, note: wasm ? 'WebAssembly present (needed by MediaPipe).' : 'WebAssembly missing: MediaPipe cannot run.' },
  };
}
