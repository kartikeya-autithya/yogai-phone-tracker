# Phone and browser compatibility

| Feature | Status |
|---|---|
| Camera (getUserMedia) | Needs HTTPS or localhost. Permission is asked when the camera starts (Phase 2). |
| Web Serial on Android Chrome | Reported to be added in Chrome 148 (beta, April 2026). Only devices exposing wired serial ports list ports. Not confirmed on any specific phone. |
| WebUSB serial fallback | Possible for CDC-ACM boards such as the Uno, but an Android kernel driver can block it. Untested. |
| iPhone / iPad | No Web Serial or WebUSB. Native app required for USB. |
| Bluetooth HC-05 | Classic Bluetooth SPP. Web Bluetooth is BLE only, so an HC-05 is not reachable from a browser. A BLE module or a native Android app would be needed. |
| Wi-Fi (ESP8266) | WebSocket is possible, but an https page cannot open `ws://` without a workaround. To be investigated in Phase 7. |

The compatibility screen of the app reports what the current browser offers. Whether your Arduino actually appears is only established by a Phase 5 hardware test.

A USB-OTG cable or adapter is required for a phone. An Arduino Uno needs USB-C to USB-B (or a USB-C OTG adapter plus a standard A-to-B cable).
