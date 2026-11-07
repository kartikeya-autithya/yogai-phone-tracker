# YogAI Phone Tracker — Phase 3.2

Phase 3.1 adds **faster, adjustable USB servo control** on top of the Phase 3 Arduino Uno connection to the Phase 2 phone-camera and MediaPipe Pose Landmarker application. The phone browser connects to an already-programmed Uno using Web Serial, sends `yaw,tilt\n` commands at a bounded rate, and can run an incremental closed-loop controller because the phone camera moves with the servo mount.

## Phase 3 features

- Web Serial Connect / Disconnect controls (user must select the USB device).
- 115200 baud, newline-terminated `yaw,tilt` commands.
- 2.5 s Uno reset/startup wait after opening the serial port.
- Arduino response display for `READY` and `ERR`.
- Manual yaw and tilt jog controls with selectable 2°, 5°, 10° or 15° steps plus Centre servos.
- Explicit Start / Stop Servo Tracking controls; tracking requires both the camera and Arduino connection.
- Closed-loop incremental control using the moving phone camera, ±6% dead zone, EMA smoothing, proportional corrections, speed limiting and firmware angle limits.
- No commands are sent when the person is not detected; Arduino holds its last commanded target.
- Yaw and tilt direction selectors, saved locally in the browser.
- On serial stream loss, automatic tracking is stopped and the UI reports the disconnect.

## Important: fixed versus moving camera

The automatic controller in this phase assumes the active camera is physically attached to the moving phone mount. The camera moves as the servos move, so the visual error should shrink and corrections should stop inside the dead zone.

**Do not run automatic servo tracking using a stationary laptop webcam.** A fixed camera does not see the mount move, so the controller cannot close the loop and can drive the targets towards their configured limits. On a desktop/laptop, use the camera only for preview and use the manual servo jog controls to verify USB communication. Use the phone mounted to the holder for automatic tracking.

## Hardware and firmware assumptions

The app's settings must match `public/firmware/servo_tracker.ino`:

- Arduino Uno-compatible board already flashed with the supplied sketch.
- Yaw signal: D5; tilt signal: D6.
- 115200 baud; line format `yaw,tilt\n`.
- Yaw range: 0–180, software limits 45–135, neutral 90.
- Tilt range: 0–180, software limits 60–120, neutral 90.
- Firmware slew ceiling: 100 degrees/second; host default: 90 degrees/second. The app exposes speed and response sliders.

The website **does not flash firmware**. Upload `public/firmware/servo_tracker.ino` separately using Arduino IDE before connecting from the app. If your currently uploaded firmware differs from this file, use the matching firmware or reconcile its baud rate, pins, angle limits and command format before connecting.

### Servo power and first test

- Use a separate, regulated 5 V servo supply with sufficient current for both servos. Do not power both SG90 servos from the Arduino 5 V pin or phone USB.
- Join the external supply ground to Arduino GND so the servo signal reference is shared.
- Keep the phone detached for initial manual jog tests. Keep cables and fingers away from moving joints.
- If a servo buzzes, strains, heats up or reaches a mechanical stop, disconnect servo power and reduce the configured range. Software limits must remain inside the mount's actual safe travel.

## Run locally on the Mac

Node.js 20.19+ is required; Node 24 is suitable.

```bash
npm install
npm test
npm run build
npm run dev
```

Open the localhost URL printed by Vite. `localhost` is a secure context for camera and Web Serial testing in a supported browser.

### Desktop USB test

1. Upload the supplied Arduino sketch using Arduino IDE. Select Arduino Uno and the correct serial port.
2. Close Arduino IDE Serial Monitor (only one application can hold the serial port at a time).
3. Connect the Uno to the Mac by a USB data cable.
4. Open the app in a supported desktop Chrome/Edge browser.
5. Click **Connect Arduino** and select the Uno serial device in the browser's chooser.
6. Wait for the connection status. The Uno may reset when the port opens; the app waits 2.5 seconds.
7. Test `Centre servos`, then use the selected manual jog step to test yaw and tilt in both directions. Keep the phone off the mount.
8. Stop the camera or keep it off during desktop tests. **Do not start automatic servo tracking with the laptop's fixed webcam.**

## Android USB test

The target phone is Samsung Galaxy A14 / Android 15 / Chrome 157. Open the deployed HTTPS app in Chrome on that phone.

1. Confirm the compatibility panel reports Web Serial present.
2. Connect the phone to the already-programmed Uno using a data-capable USB-OTG adapter/cable.
3. Power the servos from their separate regulated supply, with common ground to the Uno. Initially keep the phone detached from the mount.
4. Tap **Connect Arduino** and select the serial device if Android/Chrome shows it.
5. Wait for the app to report the Arduino connected, then test small manual jogs.
6. Only after directions and movement are verified, attach the phone securely and use its camera (front or rear as required) for automatic tracking.

An API indicator only confirms the browser exposes Web Serial; it does not prove Android exposes the particular Uno USB-serial bridge. Android support can depend on the phone's USB host support and USB-serial interface/chip. If the chooser shows no device, capture the exact message and do not assume the Arduino is faulty. A native Android USB-host implementation may be needed for that phone/bridge combination.

## Controller behaviour

- The pose bounding-box centre is transformed to match the mirrored camera preview.
- EMA filtering smooths the detected centre.
- Outside the configured dead zone (default ±6%), a proportional velocity command is integrated into yaw/tilt targets.
- The host clamps to the configured firmware limits and sends integer angle targets at the camera/controller update rate (target about 20 Hz).
- The Arduino firmware separately slews each servo toward the most recent target.
- When detection is lost, no new servo command is sent; the Arduino maintains its last target.
- Stop Servo Tracking disables further automatic commands and holds the last target.

Yaw/Tilt direction is physical-mount dependent. Test with small manual nudges. If automatic tracking moves the phone away from the person, stop tracking and switch the appropriate direction to **Reversed**. The preference is saved in that browser.

## Test suite

```bash
npm test
```

The suite covers browser capability detection, configuration validation, tracking-controller bounds/dead-zone/direction behaviour, serial command formatting, and a mocked Web Serial session. Passing tests do not replace a real USB/servo test.

## Deploy to GitHub Pages

The repository already has a GitHub Actions Pages workflow. With Pages source set to **GitHub Actions**:

```bash
git status
git add .
git commit -m "Phase 3: add Arduino USB serial servo control"
git push
```

Then check the Actions tab and test the deployed HTTPS URL on the target phone.

## Known limits

- USB is implemented through Web Serial only in Phase 3. No WebUSB serial polyfill, HC-05 classic Bluetooth, BLE, ESP8266 Wi-Fi transport or native Android wrapper is included yet.
- Browser support varies. Android may expose the API but still not expose a compatible USB serial bridge.
- Camera inference runs on the page thread; phone performance and temperature should be monitored.
- The controller targets the visible pose bounding-box centre, not the face. Partial-body visibility or large yoga pose changes can shift the target centre.
- No independent hardware emergency-stop circuit is included. Keep the mechanism unobstructed and test conservatively.


## Phase 3.1 — Faster servo response and live tuning

The response panel exposes host speed (20–90°/s), yaw and tilt sensitivity (gain 5–45), centre dead zone (3–15%), smoothing (EMA alpha 0.15–0.80), and manual jog increments (2°, 5°, 10°, 15°). Defaults are faster than the original Phase 3: 90°/s host speed, yaw/tilt gain 24, EMA alpha 0.40 and a 6% dead zone. Settings are saved in this browser and applied to the controller immediately, including while tracking.

The updated Arduino firmware has a 100°/s slew ceiling. **Re-upload `public/firmware/servo_tracker.ino` to the Uno** to enable the higher ceiling; an older firmware sketch still limits movement to its previous 60°/s value. Mechanical software limits remain yaw 45–135° and tilt 60–120°.

Start with the phone detached and an unobstructed mount. Increase speed or gain gradually. If an SG90 chatters, vibrates, heats up or struggles, reduce the settings and stop the mechanism. These changes improve the commands sent to the servos; they cannot make the physical servo move faster than its rated speed or provide additional torque.


## Phase 3.2 — Reacquisition fix and documentation corrections

- **Reacquisition:** the controller now restarts its smoothing when the person has been unseen for longer than `reacquireResetS` (0.7 s). Before this, that setting existed but was never used, so a person reappearing elsewhere was blended with their old position. The speed limit still bounds the first move. Covered by unit tests; not yet tested with the physical mount.
- **Dead zone:** the code default has been ±6% since Phase 3.1. Earlier text that said ±8% was out of date and has been corrected.
- **Firmware comment:** the sketch header still mentions 270° servos, but both ranges are 180° (`YAW_RANGE_DEG`, `TILT_RANGE_DEG`). The firmware was left unchanged, so no re-upload is needed for this update.

### Known gaps (not changed in 3.2)

- `minStepDeg`, `minSendDeltaDeg`, `minBboxFraction` and `reconnectIntervalMs` exist in the settings but are not used by the app yet (the bounding-box check uses a fixed 5%, and the app rate-limits sends at 35 ms).
- The model and MediaPipe runtime download at start-up (Google storage and jsDelivr), so the app needs internet on first use; camera video stays on the device.
- Control uses display coordinates, so the yaw direction that works for the rear camera may be reversed for the front camera. Calibrate direction for the camera you will actually mount.
