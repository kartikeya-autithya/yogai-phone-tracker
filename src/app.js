import { detectCapabilities } from './utils/capabilities.js';
import { FIRMWARE_LIMITS, loadSettings } from './utils/configuration.js';

const $ = (id) => document.getElementById(id);

function statusItem(label, available, note) {
  const li = document.createElement('li');
  li.className = 'cap-item';

  const dot = document.createElement('span');
  dot.className = `dot ${available ? 'ok' : 'no'}`;
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', available ? 'available' : 'not available');

  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = label;
  const text = document.createElement('div');
  text.className = 'muted';
  text.textContent = note;
  body.append(title, text);

  li.append(dot, body);
  return li;
}

function renderCompatibility(caps) {
  const list = $('capList');
  list.replaceChildren(
    statusItem('Camera', caps.camera.available, caps.camera.note),
    statusItem('WebAssembly (MediaPipe)', caps.wasm.available, caps.wasm.note),
    statusItem('Web Serial', caps.webSerial.available, caps.webSerial.note),
    statusItem('WebUSB', caps.webUsb.available, caps.webUsb.note),
    statusItem('Bluetooth', caps.bluetooth.available, caps.bluetooth.note),
    statusItem('Wi-Fi (WebSocket)', caps.wifi.available, caps.wifi.note),
  );

  $('compatIntro').textContent =
    'API present means the browser offers the feature. It does not prove your hardware will connect.';
  $('usbSummary').textContent = caps.usb.note;
  $('usbOtg').textContent = caps.usb.needsOtgCable
    ? 'A phone needs a USB-OTG adapter or cable (USB-C to USB-B for an Uno). The Arduino sketch is not flashed from this page.'
    : 'The Arduino sketch is not flashed from this page. Use the Arduino IDE.';
}

function renderConfig(settings) {
  const rows = [
    ['Baud rate', FIRMWARE_LIMITS.baud],
    ['Command format', FIRMWARE_LIMITS.commandFormat],
    ['Dead zone (x / y)', `±${settings.deadZoneX * 100}% / ±${settings.deadZoneY * 100}%`],
    ['EMA alpha', settings.emaAlpha],
    ['Control rate', `${settings.controlHz} Hz`],
    ['Max speed (host / firmware)', `${settings.maxSpeedDegPerS} / ${FIRMWARE_LIMITS.maxSpeedDegPerS} °/s`],
    ['Yaw neutral, limits', `${settings.yawNeutral}°, ${settings.yawMin}°–${settings.yawMax}°`],
    ['Tilt neutral, limits', `${settings.tiltNeutral}°, ${settings.tiltMin}°–${settings.tiltMax}°`],
    ['Direction (yaw / tilt)', `${settings.yawDirection} / ${settings.tiltDirection}`],
  ];
  const table = $('cfgTable');
  table.replaceChildren();
  for (const [k, v] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = k;
    const td = document.createElement('td');
    td.textContent = String(v);
    tr.append(th, td);
    table.append(tr);
  }
}

function renderEnvironment(env) {
  const parts = [
    env.isAndroid ? `Android ${env.androidVersion ?? '?'}` : env.isIOS ? 'iOS' : 'Desktop or other',
    env.chromeVersion ? `Chrome ${env.chromeVersion}` : 'Chrome version not detected',
    env.secureContext ? 'secure context (HTTPS/localhost)' : 'NOT a secure context',
    env.standalone ? 'running as installed app' : 'running in a browser tab',
  ];
  $('envInfo').textContent = parts.join(' · ');
}

export function startApp() {
  const caps = detectCapabilities();
  const { settings, warnings } = loadSettings();

  renderCompatibility(caps);
  renderConfig(settings);
  renderEnvironment(caps.environment);

  if (warnings.length) {
    const el = $('cfgWarnings');
    el.hidden = false;
    el.textContent = `Saved settings were adjusted: ${warnings.join('; ')}`;
  }
}
