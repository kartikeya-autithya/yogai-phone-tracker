/**
 * WebUSB transport for USB CDC-ACM serial devices such as the Arduino Uno R3
 * (ATmega16U2 bridge). Chrome on Android exposes WebUSB through the same Android
 * USB host API that ArduinoDroid uses, so this works where navigator.serial lists nothing.
 *
 * It exposes the same surface as WebSerialTransport: connect(), sendAngles(),
 * disconnect(), and the `connected` flag, with onStatus / onLine / onDisconnect callbacks.
 * requestDevice() must be called from a direct user gesture (the Connect button).
 *
 * Only standard CDC-ACM bridges are supported (Uno R3 with ATmega16U2, Leonardo, Mega).
 * CH340, CP210x and FTDI clones use vendor protocols and are rejected with a clear error.
 */
import { formatAngleCommand } from './web-serial-transport.js';

const CDC_COMM_CLASS = 0x02;
const CDC_DATA_CLASS = 0x0a;
const SET_LINE_CODING = 0x20;
const SET_CONTROL_LINE_STATE = 0x22;
const DTR_RTS_ON = 0x03;

/** Arduino SA, Arduino.org, and any device that reports CDC at device level. */
export const ARDUINO_USB_FILTERS = Object.freeze([
  { vendorId: 0x2341 },
  { vendorId: 0x2a03 },
  { classCode: CDC_COMM_CLASS },
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 7-byte CDC line coding: baud (LE32), 1 stop bit, no parity, 8 data bits. */
export function buildLineCoding(baudRate) {
  const bytes = new Uint8Array(7);
  new DataView(bytes.buffer).setUint32(0, baudRate, true);
  bytes[4] = 0; // 1 stop bit
  bytes[5] = 0; // no parity
  bytes[6] = 8; // 8 data bits
  return bytes;
}

/** Finds the CDC control interface and the data interface with bulk IN/OUT endpoints. */
export function findCdcInterfaces(configuration) {
  const interfaces = configuration?.interfaces ?? [];
  let control = null;
  let data = null;
  for (const iface of interfaces) {
    const alt = iface.alternates?.[0];
    if (!alt) continue;
    if (alt.interfaceClass === CDC_COMM_CLASS && !control) {
      control = { number: iface.interfaceNumber, alternate: alt.alternateSetting ?? 0 };
    }
    if (alt.interfaceClass === CDC_DATA_CLASS && !data) {
      const bulkIn = alt.endpoints?.find((e) => e.direction === 'in' && e.type === 'bulk');
      const bulkOut = alt.endpoints?.find((e) => e.direction === 'out' && e.type === 'bulk');
      if (bulkIn && bulkOut) {
        data = {
          number: iface.interfaceNumber,
          alternate: alt.alternateSetting ?? 0,
          inEndpoint: bulkIn.endpointNumber,
          outEndpoint: bulkOut.endpointNumber,
          inPacketSize: bulkIn.packetSize || 64,
        };
      }
    }
  }
  if (!control || !data) return null;
  return { control, data };
}

export class WebUsbCdcTransport {
  constructor({
    usbApi = globalThis.navigator?.usb,
    baudRate = 115200,
    bootWaitMs = 2500,
    onStatus = () => {},
    onLine = () => {},
    onDisconnect = () => {},
  } = {}) {
    this.usbApi = usbApi;
    this.baudRate = baudRate;
    this.bootWaitMs = bootWaitMs;
    this.onStatus = onStatus;
    this.onLine = onLine;
    this.onDisconnect = onDisconnect;
    this.device = null;
    this.layout = null;
    this.connected = false;
    this.closing = false;
    this.readTask = null;
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    this.claimed = [];
    this.usbDisconnectHandler = null;
  }

  async connect() {
    if (!this.usbApi || typeof this.usbApi.requestDevice !== 'function') {
      throw new Error('WebUSB is unavailable in this browser. Open the deployed HTTPS app in Chrome.');
    }
    if (this.connected) return true;
    if (this.device) throw new Error('A USB connection is already opening.');

    this.onStatus('Choose the Arduino in the browser dialog…', 'info');
    // Keep this call before any other await so the Connect-button gesture is still valid.
    const device = await this.usbApi.requestDevice({ filters: [...ARDUINO_USB_FILTERS] });
    this.device = device;
    this.closing = false;

    try {
      await device.open();
      if (!device.configuration) await device.selectConfiguration(1);

      this.layout = findCdcInterfaces(device.configuration);
      if (!this.layout) {
        throw new Error(
          'This USB device does not look like a standard CDC-ACM serial bridge. ' +
          'An Uno R3 (ATmega16U2) should; CH340, CP210x and FTDI boards need a different driver.',
        );
      }

      const { control, data } = this.layout;
      await device.claimInterface(control.number);
      this.claimed.push(control.number);
      if (data.number !== control.number) {
        await device.claimInterface(data.number);
        this.claimed.push(data.number);
      }
      if (data.alternate) await device.selectAlternateInterface(data.number, data.alternate);

      this.usbDisconnectHandler = (event) => {
        if (event.device === this.device && !this.closing) {
          this.connected = false;
          this.onStatus('Arduino USB connection ended. Reconnect the cable and connect again.', 'error');
          this.onDisconnect(new Error('USB device disconnected.'));
        }
      };
      this.usbApi.addEventListener?.('disconnect', this.usbDisconnectHandler);

      // The 16U2 bridge applies the UART baud rate from the line coding request.
      await device.controlTransferOut(
        { requestType: 'class', recipient: 'interface', request: SET_LINE_CODING, value: 0, index: control.number },
        buildLineCoding(this.baudRate),
      );
      // DTR on, as Web Serial does when it opens a port; the Uno resets here.
      await device.controlTransferOut({
        requestType: 'class', recipient: 'interface', request: SET_CONTROL_LINE_STATE, value: DTR_RTS_ON, index: control.number,
      });

      this.readTask = this.#readLoop();
      this.onStatus('USB opened. Waiting for the Arduino Uno to reset…', 'info');
      await sleep(this.bootWaitMs);

      if (!this.device || this.closing) {
        throw new Error('The Arduino USB connection closed while it was starting. Check the cable and board.');
      }
      this.connected = true;
      this.onStatus('Arduino connected over WebUSB. Serial is ready.', 'success');
      return true;
    } catch (error) {
      await this.disconnect().catch(() => {});
      throw this.#friendly(error);
    }
  }

  #friendly(error) {
    const name = error?.name;
    if (name === 'SecurityError' || name === 'NetworkError' || name === 'InvalidStateError') {
      return new Error(
        `${error.message || name}. If another app such as ArduinoDroid or the Arduino IDE has the Uno open, ` +
        'close it, unplug and replug the board, then try again.',
      );
    }
    return error;
  }

  async #readLoop() {
    let buffer = '';
    const { inEndpoint, inPacketSize } = this.layout.data;
    try {
      while (this.device && !this.closing) {
        const result = await this.device.transferIn(inEndpoint, inPacketSize);
        if (result.status === 'stall') {
          await this.device.clearHalt('in', inEndpoint);
          continue;
        }
        if (result.status === 'babble') continue;
        if (!result.data || result.data.byteLength === 0) continue;
        buffer += this.decoder.decode(result.data, { stream: true });
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
        this.onStatus(`USB read error: ${error?.message || error}`, 'error');
        this.onDisconnect(error);
      }
    }
  }

  async sendAngles(yaw, tilt) {
    if (!this.connected || !this.device || !this.layout) {
      throw new Error('Arduino is not connected.');
    }
    const command = formatAngleCommand(yaw, tilt);
    const result = await this.device.transferOut(this.layout.data.outEndpoint, this.encoder.encode(command));
    if (result.status && result.status !== 'ok') {
      throw new Error(`USB write failed (${result.status}).`);
    }
    return command;
  }

  async disconnect() {
    this.closing = true;
    this.connected = false;
    const device = this.device;
    const layout = this.layout;
    this.device = null;
    this.layout = null;

    if (this.usbDisconnectHandler) {
      this.usbApi?.removeEventListener?.('disconnect', this.usbDisconnectHandler);
      this.usbDisconnectHandler = null;
    }

    if (device) {
      if (layout) {
        // Drop DTR/RTS; ignore errors if the cable is already unplugged.
        try {
          await device.controlTransferOut({
            requestType: 'class', recipient: 'interface', request: SET_CONTROL_LINE_STATE, value: 0, index: layout.control.number,
          });
        } catch { /* device may be gone */ }
      }
      for (const number of this.claimed.splice(0)) {
        try { await device.releaseInterface(number); } catch { /* already released */ }
      }
      try { await device.close(); } catch { /* already closed */ }
    }

    if (this.readTask) {
      try { await this.readTask; } catch { /* handled in read loop */ }
      this.readTask = null;
    }
    this.onStatus('Arduino disconnected.', 'info');
  }
}
