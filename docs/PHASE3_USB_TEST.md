# Phase 3 — USB Arduino test procedure

## Before testing

- Upload `public/firmware/servo_tracker.ino` to the Uno with Arduino IDE.
- Confirm D5 = yaw signal and D6 = tilt signal.
- Close Arduino IDE Serial Monitor before using this website.
- Power servos from a separate regulated 5 V supply; join supply GND to Arduino GND.
- Keep the phone detached and the mount unobstructed during initial manual testing.

## Desktop Chrome test

1. `npm install`, `npm test`, `npm run build`, then `npm run dev`.
2. Open the localhost URL in Chrome.
3. Click **Connect Arduino** and select the Uno USB serial port.
4. Wait for the app to report that the Arduino is connected/ready.
5. Test **Centre servos**, then each ±5° yaw/tilt jog button.
6. If a direction is mechanically opposite to the label, note it. The UI direction selectors apply to automatic tracking.
7. Stop here for automatic control: a laptop webcam is stationary and must not be used for the moving-camera feedback controller.

## Android phone test

1. Push and deploy Phase 3 to GitHub Pages.
2. Open the HTTPS Pages URL in Chrome on the Samsung phone.
3. Connect the phone to the programmed Uno with USB-OTG.
4. Tap **Connect Arduino** and select the serial device from Android's chooser.
5. Wait for connection status, then test Centre and ±5° jogs with the phone detached.
6. If the device does not appear, record the exact browser error and stop; do not repeatedly unplug/replug while servos are powered.
7. Once manual tests work and directions are understood, secure the phone on the mount, select the camera that faces the person, start the camera, and explicitly tap **Start servo tracking**.
8. Verify corrections move the person toward the centre. If an axis moves away, stop tracking and switch that axis to **Reversed**.
9. Use **Stop servo tracking** to hold the last target. **Disconnect** closes the USB serial session.

The app does not flash firmware. It only sends angle commands to the already-programmed Arduino.
