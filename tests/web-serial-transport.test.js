import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAngleCommand, WebSerialTransport } from '../src/serial/web-serial-transport.js';

test('formats commands as integer yaw,tilt lines', () => {
  assert.equal(formatAngleCommand(90, 105), '90,105\n');
});

test('rejects non-integer or out-of-range commands', () => {
  assert.throws(() => formatAngleCommand(90.5, 90), /integer/);
  assert.throws(() => formatAngleCommand(181, 90), /between 0 and 180/);
});

test('reports unavailable Web Serial without throwing a browser reference error', async () => {
  const transport = new WebSerialTransport({ serialApi: null, bootWaitMs: 0 });
  await assert.rejects(() => transport.connect(), /Web Serial is unavailable/);
});

test('connects, writes a line, reads READY and disconnects using serial streams', async () => {
  const written = [];
  const readControllerRef = { current: null };
  const readable = new ReadableStream({
    start(controller) {
      readControllerRef.current = controller;
      controller.enqueue(new TextEncoder().encode('READY\n'));
    },
  });
  const writable = new WritableStream({
    write(chunk) { written.push(new TextDecoder().decode(chunk)); },
  });
  const port = {
    readable,
    writable,
    async open(options) { assert.equal(options.baudRate, 115200); },
    async close() {},
  };
  const serialApi = { async requestPort() { return port; } };
  const lines = [];
  const transport = new WebSerialTransport({ serialApi, bootWaitMs: 0, onLine: (line) => lines.push(line) });

  await transport.connect();
  assert.equal(transport.connected, true);
  assert.deepEqual(lines, ['READY']);
  await transport.sendAngles(92, 88);
  assert.deepEqual(written, ['92,88\n']);
  await transport.disconnect();
  assert.equal(transport.connected, false);
});
