# Architecture — Phase 3

## Current data flow

```
phone camera → camera.js → pose-tracker.js → tracking-controller.js
                                              ↓
                                      app.js command gate
                                              ↓
                                  web-serial-transport.js
                                              ↓
                                   Arduino Uno (115200)
                                              ↓
                                      D5 yaw / D6 tilt
```

The phone camera is physically attached to the moving mount. The controller reads the person's current position in the live camera frame, applies dead-zone/EMA/proportional corrections, sends a bounded target, and measures the next frame. This is the closed-loop arrangement; a fixed laptop webcam must only be used for camera preview and manual serial jog testing.

## Modules and status

| Module | Responsibility | Status |
|---|---|---|
| `src/utils/configuration.js` | Defaults, firmware limits, validation, persistence | Phase 1, tested |
| `src/utils/capabilities.js` | Browser feature detection | Phase 1, tested |
| `src/camera.js` | Camera permission, camera stream and switching | Phase 2, tested by user |
| `src/vision/pose-tracker.js` | MediaPipe Pose Landmarker | Phase 2, tested by user |
| `src/tracking-controller.js` | Pure closed-loop controller and pose bounding box | Phase 3, unit tested |
| `src/serial/web-serial-transport.js` | Web Serial connect/read/write/disconnect | Phase 3, mocked unit tested; hardware pending |
| `src/app.js` | Camera, serial, manual jog and automatic tracking UI wiring | Phase 3 |
| Wi-Fi / BLE / native Android | Future transports | Not implemented |

## Serial protocol

- Baud rate: 115200.
- Command: `yaw,tilt\n`, with integer angles.
- The app waits 2.5 seconds after opening the port because an Uno commonly resets when the port opens.
- Firmware `READY` and `ERR` lines are read and shown in the UI.
- Commands are limited by the host controller and firmware angle limits; duplicate targets are suppressed.

## Firmware assumptions

The matching sketch is `public/firmware/servo_tracker.ino`:

- Yaw: D5, range 0–180, software limits 45–135, neutral 90.
- Tilt: D6, range 0–180, software limits 60–120, neutral 90.
- Firmware slew ceiling: 100 degrees/second (Phase 3.1 faster response update).
- If commands stop or the USB link is lost, this sketch keeps its last target; it has no command watchdog.

## Controller behaviour

- Uses the visible pose bounding-box centre as the tracked point.
- The front camera display is mirrored; controller coordinates are transformed to match the displayed image.
- Applies an EMA to the centre.
- Outside the ±6% dead zone, a proportional velocity is integrated into yaw and tilt targets.
- Host speed and angle limits are clamped before commands are sent.
- If the person is not detected, no command is sent; the Arduino keeps its most recent target.
- Manual jog controls send 5-degree changes, while Centre sends the configured neutral angles.
- Yaw and tilt direction can be reversed in the UI and saved in browser storage.
