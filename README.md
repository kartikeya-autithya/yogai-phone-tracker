# YogAI Phone Tracker — Phase 2

Phase 2 adds a live phone-camera preview and on-device MediaPipe Pose Landmarker tracking. It draws pose landmarks, a visible-person bounding box, the bounding-box centre, a ±8% centre dead zone, tracking state, FPS and simulated yaw/tilt values.

**No Arduino commands are sent in Phase 2.** USB/serial control is a later phase. The simulated angles are only a visual preview.

## Requirements

- Node.js 20.19+ (Node 24 LTS is suitable)
- npm
- A modern browser with camera access and WebAssembly
- HTTPS when deployed; `localhost` is also a secure context for local development
- Internet access on the first model/runtime load (MediaPipe package is installed via npm; WASM and the lightweight `.task` model are loaded from pinned/public Google-hosted URLs)

## Install and run

```bash
npm install
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/`.

## Use the camera test

1. Tap **Start Camera & Tracking**.
2. Grant camera permission.
3. Keep the phone still for this phase. The front camera is selected by default; choose Rear camera to switch.
4. Stand far enough away for your upper body and hips to be visible.
5. Watch the pose skeleton, bounding box, centre point, dead-zone rectangle, tracking state, FPS and simulated angles.
6. Tap **Stop Camera** to stop all camera tracks.

The image is processed locally in the browser. The page does not upload camera frames or pose coordinates to a YogAI server. MediaPipe's package documentation notes that the SDK may send usage/performance metrics; see its privacy notice: https://goo.gle/mediapipe-privacy.

## Model and runtime

- JS package: `@mediapipe/tasks-vision` pinned to `1.2.2`.
- WASM runtime: jsDelivr URL pinned to the same package version.
- Model: MediaPipe Pose Landmarker Lite hosted by Google Storage.
- The app attempts GPU delegation first and falls back to CPU if GPU setup fails.

The model is downloaded by the browser when first needed. Internet access is required until browser caching is available.

## Phase 2 limits

- No Arduino connection or servo commands are implemented.
- Yaw/tilt values are estimates for display only; they are not a closed-loop motor controller.
- Tracking uses the centre of the visible pose bounding box. The estimate can shift when the person changes pose or parts of the body leave the frame.
- Camera detection is synchronous in the page thread and throttled by the device's real frame rate. If the phone becomes hot or sluggish, stop the camera and report the FPS/device behaviour.
- For phone-mounted closed-loop tracking, later phases will use live camera feedback and a separate tested controller/transport.

## Deploy

The existing GitHub Actions workflow continues to run tests, build Vite, and deploy `dist` to GitHub Pages on pushes to `main`.

```bash
git status
git add .
git commit -m "Phase 2: add phone camera and MediaPipe pose tracking"
git push
```

Ensure repository Settings → Pages → Source is set to **GitHub Actions**.

## Official references

- MediaPipe web setup: https://developers.google.com/edge/mediapipe/solutions/setup_web
- MediaPipe Pose Landmarker for Web: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
