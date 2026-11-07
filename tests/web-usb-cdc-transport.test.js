import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WebUsbCdcTransport,
  ARDUINO_USB_FILTERS,
  buildLineCoding,
  findCdcInterfaces,
} from '../src/serial/web-usb-cdc-transport.js';
import { chooseUsbTransport } from '../src/serial/transport-selection.js';

const UNO_CONFIGURATION = {
  interfaces: [
    {
      interfaceNumber: 0,
      alternates: [{ alternateSetting: 0, interfaceClass: 2, interfaceSubclass: 2, endpoints: [{ endpointNumber: 2, direction: 'in', type: 'interrupt', packetSize: 8 }] }],
    },
    {
      interfaceNumber: 1,
      alternates: [{
        alternateSetting: 0,
        interfaceClass: 10,
        endpoints: [
          { endpointNumber: 4, direction: 'out', type: 'bulk', packetSize: 64 },
          { endpointNumber: 5, direction: 'in', type: 'bulk', packetSize: 64 },
        ],
      }],
    },
  ],
};

function makeMockUsb(configuration = UNO_CONFIGURATION) {
  const calls = [];
  const pendingReads = [];
  let wake = null;
  let unplugged = false;
  let closed = false;
  const device = {
    configuration,
    async open() { calls.push(['open']); },
    async close() { calls.push(['close']); closed = true; wake?.(); },
    async selectConfiguration(n) { calls.push(['selectConfiguration', n]); },
    async claimInterface(n) { calls.push(['claim', n]); },
    async releaseInterface(n) { calls.push(['release', n]); },
    async selectAlternateInterface(n, a) { calls.push(['alt', n, a]); },
    async controlTransferOut(setup, data) {
      calls.push(['control', setup.request, setup.value, setup.index, data ? Array.from(data) : null]);
      return { status: 'ok' };
    },
    async transferOut(endpoint, data) {
      calls.push(['out', endpoint, new TextDecoder().decode(data)]);
      return { status: 'ok', bytesWritten: data.byteLength };
    },
    async transferIn() {
      while (!pendingReads.length) {
        if (unplugged || closed) throw Object.assign(new Error('transfer aborted'), { name: 'NetworkError' });
        await new Promise((resolve) => { wake = resolve; });
      }
      const text = pendingReads.shift();
      return { status: 'ok', data: new DataView(new TextEncoder().encode(text).buffer) };
    },
    async clearHalt() {},
  };
  const listeners = {};
  const usb = {
    requested: null,
    async requestDevice(options) { usb.requested = options; return device; },
    addEventListener(name, fn) { listeners[name] = fn; },
    removeEventListener(name) { delete listeners[name]; },
  };
  return {
    usb, device, calls, listeners,
    push(text) { pendingReads.push(text); wake?.(); },
    unplug() { unplugged = true; wake?.(); },
  };
}

test('line coding for 115200 baud, 8N1 is encoded little-endian', () => {
  assert.deepEqual(Array.from(buildLineCoding(115200)), [0x00, 0xc2, 0x01, 0x00, 0, 0, 8]);
});

test('Uno-style descriptors are split into control and data interfaces', () => {
  const layout = findCdcInterfaces(UNO_CONFIGURATION);
  assert.equal(layout.control.number, 0);
  assert.equal(layout.data.number, 1);
  assert.equal(layout.data.outEndpoint, 4);
  assert.equal(layout.data.inEndpoint, 5);
});

test('a vendor-specific bridge such as a CH340 is not treated as CDC-ACM', () => {
  const ch340 = { interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 255, endpoints: [] }] }] };
  assert.equal(findCdcInterfaces(ch340), null);
});

test('chooser filters include Arduino vendor ids and CDC class', () => {
  assert.ok(ARDUINO_USB_FILTERS.some((f) => f.vendorId === 0x2341));
  assert.ok(ARDUINO_USB_FILTERS.some((f) => f.classCode === 0x02));
});

test('connect claims interfaces, sets 115200 baud and DTR, then sends and receives', async () => {
  const mock = makeMockUsb();
  const lines = [];
  const transport = new WebUsbCdcTransport({
    usbApi: mock.usb, bootWaitMs: 0, onLine: (l) => lines.push(l),
  });
  await transport.connect();
  assert.equal(transport.connected, true);
  assert.ok(mock.usb.requested.filters.length >= 1);

  const names = mock.calls.map((c) => c[0]);
  assert.deepEqual(names.slice(0, 3), ['open', 'claim', 'claim']);
  const lineCoding = mock.calls.find((c) => c[0] === 'control' && c[1] === 0x20);
  assert.deepEqual(lineCoding[4], [0x00, 0xc2, 0x01, 0x00, 0, 0, 8]);
  const lineState = mock.calls.find((c) => c[0] === 'control' && c[1] === 0x22);
  assert.equal(lineState[2], 3);

  assert.equal(await transport.sendAngles(100, 85), '100,85\n');
  assert.ok(mock.calls.some((c) => c[0] === 'out' && c[1] === 4 && c[2] === '100,85\n'));

  mock.push('REA');
  mock.push('DY\r\n');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(lines, ['READY']);

  await transport.disconnect();
  assert.equal(transport.connected, false);
  assert.ok(mock.calls.some((c) => c[0] === 'release' && c[1] === 0));
  assert.ok(mock.calls.some((c) => c[0] === 'close'));
});

test('sending before connect is rejected', async () => {
  const transport = new WebUsbCdcTransport({ usbApi: makeMockUsb().usb });
  await assert.rejects(() => transport.sendAngles(90, 90), /not connected/);
});

test('out-of-range angles are rejected before reaching USB', async () => {
  const mock = makeMockUsb();
  const transport = new WebUsbCdcTransport({ usbApi: mock.usb, bootWaitMs: 0 });
  await transport.connect();
  await assert.rejects(() => transport.sendAngles(200, 90), RangeError);
  await transport.disconnect();
});

test('a non-CDC device fails with a clear message and is released', async () => {
  const mock = makeMockUsb({ interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 255, endpoints: [] }] }] });
  const transport = new WebUsbCdcTransport({ usbApi: mock.usb, bootWaitMs: 0 });
  await assert.rejects(() => transport.connect(), /CDC-ACM/);
  assert.equal(transport.connected, false);
  assert.ok(mock.calls.some((c) => c[0] === 'close'));
});

test('unplugging reports a disconnect', async () => {
  const mock = makeMockUsb();
  let disconnected = 0;
  const transport = new WebUsbCdcTransport({ usbApi: mock.usb, bootWaitMs: 0, onDisconnect: () => { disconnected += 1; } });
  await transport.connect();
  mock.unplug();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(transport.connected, false);
  assert.equal(disconnected, 1);
});

test('missing WebUSB gives a clear error', async () => {
  const transport = new WebUsbCdcTransport({ usbApi: null });
  await assert.rejects(() => transport.connect(), /WebUSB is unavailable/);
});

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A146B) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36';

test('Android with both APIs prefers WebUSB', () => {
  const env = { navigator: { userAgent: ANDROID_UA, serial: { requestPort() {} }, usb: { requestDevice() {} } } };
  assert.equal(chooseUsbTransport(env), 'web-usb');
});

test('desktop with both APIs keeps native Web Serial', () => {
  const env = { navigator: { userAgent: DESKTOP_UA, serial: { requestPort() {} }, usb: { requestDevice() {} } } };
  assert.equal(chooseUsbTransport(env), 'web-serial');
});

test('no USB API selects none', () => {
  assert.equal(chooseUsbTransport({ navigator: { userAgent: ANDROID_UA } }), 'none');
});
