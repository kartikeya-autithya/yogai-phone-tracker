/**
 * Web Serial transport for Arduino Uno-compatible USB serial boards.
 * requestPort() must be invoked from a direct user gesture (Connect button).
 */

export function formatAngleCommand(yaw, tilt) {
  const y = Number(yaw);
  const t = Number(tilt);
  if (!Number.isInteger(y) || !Number.isInteger(t)) {
    throw new TypeError('Yaw and tilt must be integer degrees.');
  }
  if (y < 0 || y > 180 || t < 0 || t > 180) {
    throw new RangeError('Yaw and tilt must be between 0 and 180 degrees.');
  }
  return `${y},${t}\n`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class WebSerialTransport {
  constructor({
    serialApi = globalThis.navigator?.serial,
    baudRate = 115200,
    bootWaitMs = 2500,
    onStatus = () => {},
    onLine = () => {},
    onDisconnect = () => {},
  } = {}) {
    this.serialApi = serialApi;
    this.baudRate = baudRate;
    this.bootWaitMs = bootWaitMs;
    this.onStatus = onStatus;
    this.onLine = onLine;
    this.onDisconnect = onDisconnect;
    this.port = null;
    this.streamEnded = false;
    this.reader = null;
    this.writer = null;
    this.readTask = null;
    this.connected = false;
    this.closing = false;
    this.streamEnded = false;
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  async connect() {
    if (!this.serialApi || typeof this.serialApi.requestPort !== 'function') {
      throw new Error('Web Serial is unavailable in this browser. Open the deployed HTTPS app in a supported Chrome browser.');
    }
    if (this.connected) return true;
    if (this.port) throw new Error('A serial connection is already opening.');

    this.onStatus('Choose the Arduino USB serial device in the browser dialog…', 'info');

    // Keep this call before the first await so the browser sees the Connect-button gesture.
    const port = await this.serialApi.requestPort();
    this.port = port;
    this.closing = false;
    this.streamEnded = false;

    try {
      await port.open({ baudRate: this.baudRate, bufferSize: 256 });
      if (!port.readable || !port.writable) {
        throw new Error('The selected USB device did not expose readable and writable serial streams.');
      }

      this.reader = port.readable.getReader();
      this.writer = port.writable.getWriter();
      this.readTask = this.#readLoop();
      this.onStatus('USB port opened. Waiting for the Arduino Uno to reset…', 'info');
      await sleep(this.bootWaitMs);

      if (!this.port || this.closing || this.streamEnded) {
        throw new Error('The Arduino serial stream closed while it was starting. Check the USB cable and board.');
      }
      this.connected = true;
      this.onStatus('Arduino connected. USB serial is ready.', 'success');
      return true;
    } catch (error) {
      await this.disconnect().catch(() => {});
      throw error;
    }
  }

  async #readLoop() {
    let buffer = '';
    try {
      while (this.reader && !this.closing) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;
        buffer += this.decoder.decode(value, { stream: true });
        if (buffer.length > 2048) buffer = buffer.slice(-512);
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (line) this.onLine(line);
        }
      }
    } catch (error) {
      if (!this.closing) {
        this.connected = false;
        this.onStatus(`USB serial read error: ${error?.message || error}`, 'error');
        this.onDisconnect(error);
      }
    } finally {
      try { this.reader?.releaseLock(); } catch { /* already released */ }
      this.reader = null;
      if (!this.closing && this.port) {
        this.streamEnded = true;
        this.connected = false;
        this.onStatus('Arduino USB connection ended. Reconnect the cable and connect again.', 'error');
        this.onDisconnect(new Error('Serial stream ended.'));
      }
    }
  }

  async sendAngles(yaw, tilt) {
    if (!this.connected || !this.writer) {
      throw new Error('Arduino is not connected.');
    }
    const command = formatAngleCommand(yaw, tilt);
    await this.writer.write(this.encoder.encode(command));
    return command;
  }

  async disconnect() {
    this.closing = true;
    this.connected = false;

    if (this.reader) {
      try { await this.reader.cancel(); } catch { /* device may already be unplugged */ }
    }
    if (this.readTask) {
      try { await this.readTask; } catch { /* handled by read loop */ }
    }

    if (this.writer) {
      try { await this.writer.close(); } catch { /* device may already be unplugged */ }
      try { this.writer.releaseLock(); } catch { /* already released */ }
      this.writer = null;
    }

    const port = this.port;
    this.port = null;
    this.streamEnded = false;
    this.reader = null;
    this.readTask = null;
    if (port) {
      try { await port.close(); } catch { /* already closed */ }
    }
    this.onStatus('Arduino disconnected.', 'info');
  }
}
