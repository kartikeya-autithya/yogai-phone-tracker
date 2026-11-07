# Phase 2 phone-camera test

## What is included

- Front/rear camera selection (front camera is the default).
- MediaPipe Pose Landmarker Lite on the device.
- 33-point pose landmarks, selected body skeleton connections, visible-landmark bounding box and centre.
- Camera-centre crosshair and ±8% dead-zone overlay.
- CENTRED / TRACKING / NO PERSON states, FPS and simulated yaw/tilt preview.
- Stop Camera turns off every camera track.

## What is deliberately not included

No USB/Web Serial connection and no servo commands are sent in Phase 2. The displayed angles are only a visual preview. Do not connect the servos expecting them to move.

## Test on desktop

```bash
npm install
npm test
npm run build
npm run dev
```

Open the localhost URL printed by Vite. Tap Start Camera & Tracking and grant permission.

## Test on the Samsung phone

Deploy the commit to GitHub Pages, then open the HTTPS Pages URL in Chrome on the Samsung A14. Tap Start Camera & Tracking, allow camera access, and keep the phone still for this test. The app starts with the front camera. Switch to Rear camera using the selector if needed.

Stand far enough away for the shoulders and hips to be visible. Check the skeleton, box, centre dot, central dead-zone rectangle, state label and FPS. Tap Stop Camera and confirm the camera indicator turns off.

The first model load needs an internet connection. If model loading fails, reload while online and retry. If the browser denies camera access, allow it in Android Settings → Apps → Chrome → Permissions → Camera.

## Report back

- Phone/browser model and version.
- Whether camera permission was granted.
- Whether a live preview appeared.
- Whether landmarks and bounding box followed the person.
- Approximate FPS displayed.
- Any visible lag, heating, crashes or console/status errors.
- Whether front and rear camera switching works.

Keep the phone stationary. Arduino communication is scheduled for Phase 3.
