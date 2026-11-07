# Phone and browser compatibility

| Feature | Status |
|---|---|
| Camera (`getUserMedia`) | Requires HTTPS or localhost and user permission. |
| MediaPipe Pose Landmarker | Runs in the browser using WebAssembly; the model/runtime are loaded from pinned public URLs on first use. |
| Web Serial | Implemented in Phase 3. `navigator.serial` being present does not guarantee the Android device exposes the connected Uno USB-serial bridge. |
| Android USB | Requires USB host/OTG mode, a data-capable cable/adapter, and a supported serial interface. Test the exact phone + Uno clone/USB bridge. |
| Desktop Chrome/Edge USB | Web Serial is supported on desktop Chromium browsers; the user must select the port from the browser chooser. |
| iPhone / iPad | Web Serial/WebUSB are not available to ordinary iOS browser pages; USB serial requires a native app. |
| HC-05 | Classic Bluetooth SPP; Web Bluetooth supports BLE, not HC-05 SPP. Native Android code or a different BLE/Wi-Fi module is a future option. |
| ESP8266 Wi-Fi | Future phase. Must account for secure-page/mixed-content constraints and local network access. |

The compatibility screen reports API presence only. The only proof that an Arduino can connect is a successful user-initiated connection and command test with the actual hardware.

For Android, use a USB-OTG adapter or cable plus a data-capable cable to the Uno. If the chooser does not list the board, report the exact phone, Chrome version, Uno USB bridge (if known), and browser message; do not assume the board or servos are damaged.


## Android USB finding (Galaxy A14, Android 15, Chrome 157)

- `navigator.serial` is present but the chooser lists nothing. Web Serial for wired Android devices is documented for Android 17 and later; other devices return empty lists.
- WebUSB uses the Android USB host API, the same API ArduinoDroid uses, so it is the supported route on this phone. `src/serial/web-usb-cdc-transport.js` implements it for CDC-ACM bridges such as the Uno R3. Hardware test pending.
- If WebUSB fails: native Android shell with usb-serial-for-android.
