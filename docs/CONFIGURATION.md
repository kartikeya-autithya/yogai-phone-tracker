# Configuration

Defaults live in `src/utils/configuration.js`. They come from `tracker.py` and the limits in `servo_tracker.ino`. The firmware is authoritative: settings are forced to be equal to or narrower than the firmware limits.

| Setting | Default | Notes |
|---|---|---|
| `deadZoneX`, `deadZoneY` | 0.08 | ±8% of frame, range 0.01–0.4 |
| `emaAlpha` | 0.25 | lower = smoother, laggier |
| `controlHz` | 20 | controller and send rate |
| `maxSpeedDegPerS` | 40 | cannot exceed firmware 60 |
| `minStepDeg` | 0.3 | smaller corrections ignored |
| `minSendDeltaDeg` | 0.5 | smaller moves not sent |
| `gainYaw`, `gainTilt` | 12 | degrees per update per unit error beyond dead zone |
| `yawDirection`, `tiltDirection` | 1 | 1 or -1, calibrate on the mount |
| `yawNeutral`, `tiltNeutral` | 90 | inside min/max |
| `yawMin`/`yawMax` | 45 / 135 | firmware limits |
| `tiltMin`/`tiltMax` | 60 / 120 | firmware limits |
| `minVisibility` | 0.5 | per-landmark |
| `minVisibleLandmarks` | 8 | fewer = unreliable frame |
| `minBboxFraction` | 0.05 | box must span this much of frame |
| `reacquireResetS` | 0.7 | smoothing restarts after this |
| `baud` | 115200 | fixed to the firmware |
| `arduinoBootWaitMs` | 2500 | wait after port opens |
| `reconnectIntervalMs` | 2000 | |

The firmware range is 0–180° on both axes with 500–2400 µs pulses (SG90). Do not set 270° ranges unless you change the sketch and have a true 270° servo.
