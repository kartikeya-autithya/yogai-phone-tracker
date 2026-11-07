# Configuration and response tuning

The web app reads defaults from `src/utils/configuration.js`; the Arduino firmware limits are in `public/firmware/servo_tracker.ino`. Keep these in sync. The Phase 3.1 SG90 defaults are intentionally faster while preserving conservative angle limits.

| Setting | Default | Adjustable in the app |
|---|---:|---|
| Dead zone X/Y | ±6% | 3–15% |
| EMA alpha | 0.40 | 0.15–0.80 |
| Controller rate | 20 Hz | fixed |
| Maximum host speed | 90°/s | 20–90°/s |
| Firmware slew ceiling | 100°/s | firmware constant |
| Yaw gain | 24 | 5–45 |
| Tilt gain | 24 | 5–45 |
| Yaw limits | 45–135° | firmware enforced |
| Tilt limits | 60–120° | firmware enforced |
| Neutral | 90° / 90° | firmware calibration |

The app's Servo controls card provides sliders for maximum speed, yaw sensitivity, tilt sensitivity, centre dead zone and smoothing. Changes save in browser storage and can be changed during tracking. The controller receives the updated settings live. Manual jog increments can be selected as 2°, 5°, 10° or 15°.

Higher maximum speed allows the host to request faster angular changes. Higher gain increases the correction rate for a given image-position error. Higher EMA alpha reduces lag but may react more to landmark jitter. A smaller dead zone starts correcting closer to the centre.

**Start conservatively.** Test the servos without the phone attached. Keep the Arduino firmware's yaw limits at 45–135° and tilt limits at 60–120° until the physical mount has been checked. Lower the speed or gains if the SG90 chatters, jitters or struggles. Do not expand mechanical limits just to make the app feel faster.

After changing `MAX_SPEED_DEG_PER_S` in the Arduino sketch, re-upload the firmware. A web-app setting cannot override a lower firmware speed limit.
