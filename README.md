# YogAI Phone Tracker

Mobile-first web app that will use a phone camera and MediaPipe Pose Landmarker to follow a person and steer a two-axis Arduino servo mount. It is a standalone project, separate from the production YogAI website.

**Current status: Phase 1 (repository, build, deployment, compatibility screen).** Camera, pose detection, tracking and Arduino communication are not implemented yet. See `docs/ARCHITECTURE.md` for the plan.

Nothing in this repository has been tested on the physical mount. Items are marked as tested only in `docs/TEST_CHECKLIST.md` after you run them.

## Requirements

- Node.js 20.19 or newer (22 recommended) and npm
- Git
- Arduino IDE (to flash the firmware yourself; the web app never flashes it)

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (also shown on your LAN address)
npm test           # unit tests (Node built-in test runner)
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
```

Camera and USB APIs need HTTPS, except on `localhost`. Testing on a phone therefore needs the GitHub Pages deployment (HTTPS) or a tunnel.

## Deploy to GitHub Pages

1. Push to the `main` branch of your `yogai-phone-tracker` repository.
2. In the repository: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, builds, and publishes. The app is then served at `https://<your-username>.github.io/yogai-phone-tracker/`.
4. After your first `npm install`, commit the generated `package-lock.json` so CI can use `npm ci`.

## Firmware

`public/firmware/servo_tracker.ino` is a byte-for-byte copy of your tested sketch. Flash it with the Arduino IDE (Board: Arduino Uno). Its limits (yaw 45–135, tilt 60–120, neutral 90/90, 115200 baud, `yaw,tilt\n`) are mirrored in `src/utils/configuration.js`. If you change the sketch limits, change them there too.

## Safety

- Power the servos from an external regulated 5–6 V supply, not the Uno 5V pin or phone USB.
- Connect the supply ground to the Arduino GND.
- Keep conservative limits and keep clear of the joints. See `docs/WIRING.md`.

## Documentation

- `docs/ARCHITECTURE.md` modules, data flow, phases
- `docs/CONFIGURATION.md` every setting, default and firmware relationship
- `docs/WIRING.md` wiring and power
- `docs/COMPATIBILITY.md` phone and browser support, with what is known and unknown
- `docs/TEST_CHECKLIST.md` what to test at each phase
