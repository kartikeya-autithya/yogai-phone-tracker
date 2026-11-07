import { detectCapabilities } from './utils/capabilities.js';
import { DEFAULT_SETTINGS, FIRMWARE_LIMITS, loadSettings } from './utils/configuration.js';
import { openCamera, closeCamera } from './camera.js';
import { createPoseTracker } from './vision/pose-tracker.js';
import { getVisibleBoundingBox, getPreviewAngles, POSE_CONNECTIONS, toDisplayPoint } from './tracking-controller.js';

const $ = (id) => document.getElementById(id);

let cameraStream = null;
let poseLandmarker = null;
let animationFrame = 0;
let lastVideoTime = -1;
let lastInferenceAt = 0;
let fpsWindowStart = 0;
let inferenceCount = 0;
let settings = { ...DEFAULT_SETTINGS };
let currentFacingMode = 'user';
let lastAngles = { yaw: 90, tilt: 90 };
let mirroredPreview = true;
let busy = false;

function statusItem(label, available, note) {
  const li = document.createElement('li');
  li.className = 'cap-item';
  const dot = document.createElement('span');
  dot.className = `dot ${available ? 'ok' : 'no'}`;
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', available ? 'available' : 'not available');
  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = label;
  const text = document.createElement('div');
  text.className = 'muted';
  text.textContent = note;
  body.append(title, text);
  li.append(dot, body);
  return li;
}

function renderCompatibility(caps) {
  $('capList').replaceChildren(
    statusItem('Camera', caps.camera.available, caps.camera.note),
    statusItem('WebAssembly (MediaPipe)', caps.wasm.available, caps.wasm.note),
    statusItem('Web Serial', caps.webSerial.available, caps.webSerial.note),
    statusItem('WebUSB', caps.webUsb.available, caps.webUsb.note),
    statusItem('Bluetooth', caps.bluetooth.available, caps.bluetooth.note),
    statusItem('Wi-Fi (WebSocket)', caps.wifi.available, caps.wifi.note),
  );
  $('compatIntro').textContent = 'API present means the browser offers the feature. It does not prove your hardware will connect.';
  $('usbSummary').textContent = caps.usb.note;
  $('usbOtg').textContent = caps.usb.needsOtgCable
    ? 'A phone needs a USB-OTG adapter or cable. The Arduino sketch is uploaded separately with Arduino IDE.'
    : 'The Arduino sketch is uploaded separately with Arduino IDE.';
}

function renderConfig() {
  const rows = [
    ['Baud rate', FIRMWARE_LIMITS.baud],
    ['Command format', FIRMWARE_LIMITS.commandFormat],
    ['Dead zone (x / y)', `±${settings.deadZoneX * 100}% / ±${settings.deadZoneY * 100}%`],
    ['EMA alpha', settings.emaAlpha],
    ['Control rate', `${settings.controlHz} Hz`],
    ['Max speed (host / firmware)', `${settings.maxSpeedDegPerS} / ${FIRMWARE_LIMITS.maxSpeedDegPerS} °/s`],
    ['Yaw neutral, limits', `${settings.yawNeutral}°, ${settings.yawMin}°–${settings.yawMax}°`],
    ['Tilt neutral, limits', `${settings.tiltNeutral}°, ${settings.tiltMin}°–${settings.tiltMax}°`],
    ['Direction (yaw / tilt)', `${settings.yawDirection} / ${settings.tiltDirection}`],
  ];
  const table = $('cfgTable');
  table.replaceChildren();
  for (const [key, value] of rows) {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = key;
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.append(heading, cell);
    table.append(row);
  }
}

function renderEnvironment(env) {
  const parts = [
    env.isAndroid ? `Android ${env.androidVersion ?? '?'}` : env.isIOS ? 'iOS' : 'Desktop or other',
    env.chromeVersion ? `Chrome ${env.chromeVersion}` : 'Chrome version not detected',
    env.secureContext ? 'secure context (HTTPS/localhost)' : 'NOT a secure context',
    env.standalone ? 'running as installed app' : 'running in a browser tab',
  ];
  $('envInfo').textContent = parts.join(' · ');
}

function setCameraStatus(message, kind = 'info') {
  $('cameraMessage').textContent = message;
  $('cameraMessage').className = `camera-message ${kind}`;
}

function setTrackingState(text, kind = 'muted') {
  $('trackingState').textContent = text;
  $('trackingState').className = `state-pill ${kind}`;
}

function sizeOverlay() {
  const video = $('cameraVideo');
  const canvas = $('poseOverlay');
  if (!video.videoWidth || !video.videoHeight) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  $('cameraViewport').style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
}

function drawBaseOverlay(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  // Dead-zone rectangle: ±8% around the camera frame centre.
  const left = width * (0.5 - settings.deadZoneX);
  const right = width * (0.5 + settings.deadZoneX);
  const top = height * (0.5 - settings.deadZoneY);
  const bottom = height * (0.5 + settings.deadZoneY);
  ctx.save();
  ctx.strokeStyle = 'rgba(79, 209, 176, 0.95)';
  ctx.lineWidth = Math.max(2, width / 320);
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.5, width / 480);
  const cx = width / 2;
  const cy = height / 2;
  const arm = Math.max(10, width * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.restore();
}

function drawPose(result, box, landmarks) {
  const canvas = $('poseOverlay');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  drawBaseOverlay(ctx, width, height);
  if (!box || !landmarks) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#45e0b5';
  ctx.lineWidth = Math.max(2.5, width / 300);
  for (const [a, b] of POSE_CONNECTIONS) {
    const p1 = landmarks[a];
    const p2 = landmarks[b];
    if (!p1 || !p2 || (p1.visibility ?? 1) < settings.minVisibility || (p2.visibility ?? 1) < settings.minVisibility) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x * width, p1.y * height);
    ctx.lineTo(p2.x * width, p2.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = '#f4d35e';
  for (const point of landmarks) {
    if ((point.visibility ?? 1) < settings.minVisibility) continue;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, Math.max(2.5, width / 170), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#4fd1b0';
  ctx.lineWidth = Math.max(2, width / 360);
  ctx.strokeRect(box.minX * width, box.minY * height, box.width * width, box.height * height);
  ctx.fillStyle = '#ff5e64';
  ctx.beginPath();
  ctx.arc(box.centerX * width, box.centerY * height, Math.max(5, width / 95), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function updatePreview(box) {
  const point = toDisplayPoint(box.centerX, box.centerY, mirroredPreview);
  const preview = getPreviewAngles({ centerX: point.x, centerY: point.y, settings });
  lastAngles = { yaw: preview.yaw, tilt: preview.tilt };
  $('yawValue').textContent = `${preview.yaw}°`;
  $('tiltValue').textContent = `${preview.tilt}°`;
  $('positionValue').textContent = `X ${(point.x * 100).toFixed(1)}% · Y ${(point.y * 100).toFixed(1)}%`;
  setTrackingState(preview.outsideDeadZone ? 'TRACKING' : 'CENTRED', preview.outsideDeadZone ? 'tracking' : 'centred');
}

function updateFps(now) {
  inferenceCount += 1;
  if (!fpsWindowStart) fpsWindowStart = now;
  const elapsed = now - fpsWindowStart;
  if (elapsed >= 1000) {
    $('fpsValue').textContent = `${Math.round(inferenceCount * 1000 / elapsed)} FPS`;
    inferenceCount = 0;
    fpsWindowStart = now;
  }
}

function processFrame(now) {
  if (!cameraStream || !poseLandmarker) return;
  const video = $('cameraVideo');
  // Keep inference near 15 FPS on phones; camera preview itself remains live.
  if (now - lastInferenceAt >= 66 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const result = poseLandmarker.detectForVideo(video, Math.max(now, lastInferenceAt + 1));
      lastInferenceAt = now;
      updateFps(now);
      const landmarks = result.landmarks?.[0];
      const box = getVisibleBoundingBox(landmarks, settings.minVisibility, settings.minVisibleLandmarks);
      drawPose(result, box, landmarks);
      if (box) {
        updatePreview(box);
      } else {
        setTrackingState('NO PERSON / HOLDING PREVIEW', 'muted');
        $('positionValue').textContent = 'Person not detected';
      }
    } catch (error) {
      console.error('Pose detection failed:', error);
      setCameraStatus(`Pose detection error: ${error.message || error}`, 'error');
    }
  }
  animationFrame = requestAnimationFrame(processFrame);
}

async function ensurePoseLandmarker() {
  if (poseLandmarker) return;
  const created = await createPoseTracker((message) => setCameraStatus(message, 'info'));
  poseLandmarker = created.landmarker;
  $('delegateValue').textContent = created.delegate;
}

async function startCamera() {
  if (busy || cameraStream) return;
  busy = true;
  $('startCamera').disabled = true;
  try {
    setCameraStatus('Requesting camera permission…', 'info');
    cameraStream = await openCamera($('cameraVideo'), currentFacingMode);
    $('cameraSelect').disabled = false;
    mirroredPreview = currentFacingMode === 'user';
    $('cameraVideo').classList.toggle('mirrored', mirroredPreview);
    $('poseOverlay').classList.toggle('mirrored', mirroredPreview);
    $('cameraPlaceholder').hidden = true;
    await new Promise((resolve) => {
      const video = $('cameraVideo');
      if (video.videoWidth) resolve();
      else video.addEventListener('loadedmetadata', resolve, { once: true });
    });
    sizeOverlay();
    setCameraStatus('Camera started. Preparing MediaPipe…', 'info');
    await ensurePoseLandmarker();
    setCameraStatus(`Camera and MediaPipe ready · ${$('delegateValue').textContent} delegate`, 'success');
    setTrackingState('LOOKING FOR PERSON', 'muted');
    lastVideoTime = -1;
    lastInferenceAt = 0;
    fpsWindowStart = 0;
    inferenceCount = 0;
    animationFrame = requestAnimationFrame(processFrame);
    $('stopCamera').disabled = false;
    $('cameraSelect').disabled = false;
  } catch (error) {
    console.error(error);
    if (cameraStream) closeCamera(cameraStream, $('cameraVideo'));
    cameraStream = null;
    $('cameraPlaceholder').hidden = false;
    setCameraStatus(error?.message || 'Could not start the camera or pose model.', 'error');
    setTrackingState('STOPPED', 'muted');
  } finally {
    busy = false;
    $('startCamera').disabled = false;
  }
}

function stopCamera() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  closeCamera(cameraStream, $('cameraVideo'));
  cameraStream = null;
  $('cameraPlaceholder').hidden = false;
  const canvas = $('poseOverlay');
  const ctx = canvas.getContext('2d');
  drawBaseOverlay(ctx, canvas.width || 640, canvas.height || 480);
  $('fpsValue').textContent = '— FPS';
  $('positionValue').textContent = '—';
  $('stopCamera').disabled = true;
  setTrackingState('STOPPED', 'muted');
  setCameraStatus('Camera stopped. No video is being processed.', 'info');
}

async function switchCamera() {
  const nextFacing = $('cameraSelect').value;
  if (nextFacing === currentFacingMode) return;
  currentFacingMode = nextFacing;
  if (cameraStream) {
    stopCamera();
    await startCamera();
  }
}

export function startApp() {
  const caps = detectCapabilities();
  settings = loadSettings().settings;
  renderCompatibility(caps);
  renderConfig();
  renderEnvironment(caps.environment);
  $('startCamera').addEventListener('click', startCamera);
  $('stopCamera').addEventListener('click', stopCamera);
  $('cameraSelect').addEventListener('change', switchCamera);
  window.addEventListener('pagehide', () => {
    stopCamera();
    poseLandmarker?.close();
    poseLandmarker = null;
  });
  drawBaseOverlay($('poseOverlay').getContext('2d'), $('poseOverlay').width, $('poseOverlay').height);
  $('yawValue').textContent = `${lastAngles.yaw}°`;
  $('tiltValue').textContent = `${lastAngles.tilt}°`;
}
