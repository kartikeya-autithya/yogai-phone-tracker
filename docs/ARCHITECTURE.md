# Architecture

## Data flow (target design)

```
camera.js → pose-tracker.js → tracking-controller.js → serial-manager.js → transport → Arduino
 (video)    (MediaPipe Pose)   (error, dead zone,       (rate limit,        usb / wifi /
             centre + box       EMA, step, limits)        safe stop)          bluetooth
```

The phone camera moves with the mount, so the controller is closed-loop: it reads the person's offset from the frame centre, moves the servos a small step toward reducing it, and re-measures on the next frame.

## Modules and status

| Module | Responsibility | Status |
|---|---|---|
| `src/utils/configuration.js` | Defaults, firmware limits, validation, persistence | Phase 1 (done, unit tested) |
| `src/utils/capabilities.js` | Real feature detection for the compatibility screen | Phase 1 (done, unit tested) |
| `src/app.js`, `src/main.js` | Page wiring | Phase 1 |
| `src/camera.js` | getUserMedia, camera list and switching | Phase 2 |
| `src/pose-tracker.js` | MediaPipe Pose Landmarker, tracking centre, box | Phase 3 |
| `src/tracking-controller.js` | Pure controller (no DOM/serial) | Phase 4 |
| `src/serial/*` | Transport interface and USB transport | Phase 5 |
| Wi-Fi / Bluetooth transports | Same interface | Phase 7 |

Files for later phases are added in their own phase so that no file contains placeholder code.

## Transport interface (Phase 5 onward)

Every transport exposes `connect()`, `disconnect()`, `send(yaw, tilt)` and a status callback. `serial-manager.js` owns rate limiting (about 20 Hz), duplicate suppression, the Arduino boot wait (2.5 s), and the "stop" behaviour. Nothing outside `src/serial/` knows which transport is in use.

## Firmware behaviour to design around

- The sketch holds its last target if commands stop (it has no timeout), so a lost connection leaves the mount where it was.
- It replies `ERR` for malformed or out-of-range lines and clamps in-range values to its own limits.
- The Uno resets when the serial port opens, so the first command waits for the boot delay.

## Controller design notes (Phase 4)

Ported from `tracker.py` incremental mode: dead zone, EMA on the tracking centre, proportional step with gain beyond the dead zone, speed limit, angle limits, hold on detection loss, smoothing restart after 0.7 s unseen. Camera and servo latency can cause overshoot, so gains start conservative and are tuned from the simulation and then the real mount.
