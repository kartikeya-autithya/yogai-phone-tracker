import { detectCapabilities } from './utils/capabilities.js';
import { DEFAULT_SETTINGS, FIRMWARE_LIMITS, loadSettings, saveSettings, sanitizeSettings } from './utils/configuration.js';
import { openCamera, closeCamera } from './camera.js';
import { createPoseTracker } from './vision/pose-tracker.js';
import {
  getVisibleBoundingBox,
  getPreviewAngles,
  createServoTrackingController,
  POSE_CONNECTIONS,
  toDisplayPoint,
  clamp,
} from './tracking-controller.js';
import { WebSerialTransport } from './serial/web-serial-transport.js';
import { WebUsbCdcTransport } from './serial/web-usb-cdc-transport.js';
import { chooseUsbTransport } from './serial/transport-selection.js';
import {
  VIEWS,
  viewFromHash,
  describeConnection,
  angleToPercent,
  trackingHint,
} from './utils/panel-helpers.js';

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
let mirroredPreview = false;
let busy = false;
let serialTransport = null;
let serialTransportKind = null;
let currentView = VIEWS.camera;
let arduinoOpenedInApp = false;
const scrollPositions = { [VIEWS.camera]: 0, [VIEWS.arduino]: 0 };
let trackingController = null;
let servoTrackingActive = false;
let sendChain = Promise.resolve();
let lastSentKey = '';
let lastSerialSendAt = 0;

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
  $('compatIntro').textContent = 'API present means the browser offers the feature. It does not prove your Arduino or USB adapter will connect.';
  $('usbSummary').textContent = caps.usb.note;
  $('usbOtg').textContent = caps.usb.needsOtgCable
    ? 'On Android, connect the phone to the Uno with a data-capable USB-OTG adapter/cable. The Uno sketch must already be uploaded.'
    : 'The Arduino sketch must already be uploaded using Arduino IDE.';
}

function renderConfig() {
  const rows = [
    ['Baud rate', FIRMWARE_LIMITS.baud],
    ['Command format', FIRMWARE_LIMITS.commandFormat],
    ['Dead zone (x / y)', `±${Math.round(settings.deadZoneX * 100)}% / ±${Math.round(settings.deadZoneY * 100)}%`],
    ['EMA alpha', settings.emaAlpha],
    ['Yaw / tilt gain', `${settings.gainYaw} / ${settings.gainTilt}`],
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
  $('panelTrackingState').textContent = text;
  $('panelTrackingState').className = `state-pill ${kind}`;
}

function recordError(message) {
  const el = $('lastError');
  el.textContent = `Last error: ${message}`;
  el.hidden = false;
}

function clearRecordedError() {
  const el = $('lastError');
  el.textContent = '';
  el.hidden = true;
}

function writePanelAngles(yaw, tilt) {
  $('panelYaw').textContent = `${yaw}°`;
  $('panelTilt').textContent = `${tilt}°`;
  $('panelYawBar').style.setProperty('--pos', `${angleToPercent(yaw, settings.yawMin, settings.yawMax)}%`);
  $('panelTiltBar').style.setProperty('--pos', `${angleToPercent(tilt, settings.tiltMin, settings.tiltMax)}%`);
}

function renderLimits() {
  $('yawLimits').textContent = `Limits ${settings.yawMin}°–${settings.yawMax}° · neutral ${settings.yawNeutral}°`;
  $('tiltLimits').textContent = `Limits ${settings.tiltMin}°–${settings.tiltMax}° · neutral ${settings.tiltNeutral}°`;
}

function renderConnectionPanel() {
  const connected = !!serialTransport?.connected;
  const info = describeConnection({
    connected,
    activeKind: serialTransportKind,
    plannedKind: chooseUsbTransport(),
  });
  $('panelConnDot').className = `conn-dot ${connected ? 'ok' : 'off'}`;
  $('panelConnText').textContent = info.headline;
  $('connectionMethod').textContent = info.method;
  $('openArduinoPanelStatus').textContent = connected ? 'CONNECTED' : 'NOT CONNECTED';
  $('openArduinoPanelStatus').className = `state-pill ${connected ? 'centred' : 'muted'}`;
  $('trackingHint').textContent = trackingHint({
    cameraOn: !!cameraStream,
    connected,
    tracking: servoTrackingActive,
  });
}

function setSerialStatus(message, kind = 'info') {
  $('serialMessage').textContent = message;
  $('serialMessage').className = `camera-message ${kind}`;
  if (kind === 'error') recordError(message);
  const connected = !!serialTransport?.connected;
  $('serialState').textContent = connected ? 'CONNECTED' : 'NOT CONNECTED';
  $('serialState').className = `state-pill ${connected ? 'centred' : 'muted'}`;
  updateControlButtons();
}

function setServoMessage(message, kind = 'info') {
  $('servoMessage').textContent = message;
  $('servoMessage').className = `camera-message ${kind}`;
  if (kind === 'error') recordError(message);
}

function updateControlButtons() {
  const connected = !!serialTransport?.connected;
  $('connectArduino').disabled = connected || busy;
  $('connectArduinoUsb').disabled = connected || busy;
  $('disconnectArduino').disabled = !connected;
  $('centreServos').disabled = !connected || servoTrackingActive;
  $('yawMinus').disabled = !connected || servoTrackingActive;
  $('yawPlus').disabled = !connected || servoTrackingActive;
  $('tiltMinus').disabled = !connected || servoTrackingActive;
  $('tiltPlus').disabled = !connected || servoTrackingActive;
  $('yawDirectionSelect').disabled = servoTrackingActive;
  $('tiltDirectionSelect').disabled = servoTrackingActive;
  $('startServoTracking').disabled = !connected || !cameraStream || servoTrackingActive;
  $('stopServoTracking').disabled = !servoTrackingActive;
  $('cameraStopTracking').disabled = !servoTrackingActive;
  renderConnectionPanel();
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

function drawPose(box, landmarks) {
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

function queueServoCommand(yaw, tilt, { force = false } = {}) {
  if (!serialTransport?.connected) return Promise.resolve(false);
  const safeYaw = Math.round(clamp(yaw, settings.yawMin, settings.yawMax));
  const safeTilt = Math.round(clamp(tilt, settings.tiltMin, settings.tiltMax));
  const key = `${safeYaw},${safeTilt}`;
  const now = performance.now();
  if (!force && key === lastSentKey) return Promise.resolve(false);
  if (!force && now - lastSerialSendAt < 35) return Promise.resolve(false);
  lastSentKey = key;
  lastSerialSendAt = now;
  sendChain = sendChain
    .catch(() => {})
    .then(() => serialTransport?.sendAngles(safeYaw, safeTilt))
    .then(() => true)
    .catch((error) => {
      setServoMessage(`Could not send servo command: ${error?.message || error}`, 'error');
      return false;
    });
  return sendChain;
}

function updateAngleDisplay(angles, point, modeLabel, { store = true } = {}) {
  if (store) {
    lastAngles = { yaw: angles.yaw, tilt: angles.tilt };
    writePanelAngles(angles.yaw, angles.tilt);
  }
  $('yawValue').textContent = `${angles.yaw}°`;
  $('tiltValue').textContent = `${angles.tilt}°`;
  $('positionValue').textContent = `X ${(point.x * 100).toFixed(1)}% · Y ${(point.y * 100).toFixed(1)}%`;
  $('angleHelp').textContent = modeLabel;
}

function updateTrackingFromBox(box, now) {
  const point = toDisplayPoint(box.centerX, box.centerY, mirroredPreview);
  if (servoTrackingActive && serialTransport?.connected && trackingController) {
    const result = trackingController.update({ centerX: point.x, centerY: point.y, timestampMs: now });
    updateAngleDisplay(result, point, 'LIVE SERVO CONTROL · Closed-loop correction is sent to the connected Arduino.');
    setTrackingState(result.outsideDeadZone ? 'TRACKING · ARDUINO' : 'CENTRED · ARDUINO', result.outsideDeadZone ? 'tracking' : 'centred');
    void queueServoCommand(result.yaw, result.tilt);
  } else {
    const preview = getPreviewAngles({ centerX: point.x, centerY: point.y, settings });
    updateAngleDisplay(preview, point, 'PREVIEW ONLY · Connect Arduino and start servo tracking to send commands.', { store: false });
    setTrackingState(preview.outsideDeadZone ? 'PREVIEW TRACKING' : 'CENTRED', preview.outsideDeadZone ? 'tracking' : 'centred');
  }
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
  // On mobile, target up to 20 FPS; if the phone is slower, requestAnimationFrame naturally runs at its sustainable rate.
  if (now - lastInferenceAt >= 50 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const result = poseLandmarker.detectForVideo(video, Math.max(now, lastInferenceAt + 1));
      lastInferenceAt = now;
      updateFps(now);
      const landmarks = result.landmarks?.[0];
      const box = getVisibleBoundingBox(landmarks, settings.minVisibility, settings.minVisibleLandmarks);
      if (currentView === VIEWS.camera) drawPose(box, landmarks);
      if (box) {
        updateTrackingFromBox(box, now);
      } else {
        setTrackingState(servoTrackingActive ? 'NO PERSON · HOLDING SERVOS' : 'NO PERSON DETECTED', 'muted');
        $('positionValue').textContent = 'Person not detected';
        // No command is sent on unreliable/lost detection; Arduino holds its last target.
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
    updateControlButtons();
  }
}

function stopServoTracking({ sendHold = true, message = 'Servo tracking stopped. The Arduino keeps its last target.' } = {}) {
  if (!servoTrackingActive) return;
  servoTrackingActive = false;
  if (trackingController) lastAngles = trackingController.getAngles();
  trackingController = null;
  if (sendHold && serialTransport?.connected) void queueServoCommand(lastAngles.yaw, lastAngles.tilt, { force: true });
  setServoMessage(message, 'info');
  if (cameraStream) setTrackingState('CAMERA READY · SERVO TRACKING OFF', 'muted');
  updateControlButtons();
}

function stopCamera() {
  stopServoTracking({ message: 'Camera stopped; servo tracking disabled. The Arduino holds its last target.' });
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
  $('cameraSelect').disabled = true;
  setTrackingState('STOPPED', 'muted');
  setCameraStatus('Camera stopped. No video is being processed.', 'info');
  updateControlButtons();
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

async function connectArduino(requestedKind = 'auto') {
  if (serialTransport?.connected || busy) return;
  if (serialTransport && !serialTransport.connected) {
    await serialTransport.disconnect().catch(() => {});
    serialTransport = null;
  }
  const transportKind = requestedKind === 'auto' ? chooseUsbTransport() : requestedKind;
  if (transportKind === 'none') {
    setSerialStatus('Neither Web Serial nor WebUSB is available here. Use desktop Chrome/Edge or Chrome on Android over HTTPS.', 'error');
    return;
  }
  if (transportKind === 'web-usb' && !navigator.usb?.requestDevice) {
    setSerialStatus('WebUSB is unavailable in this browser.', 'error');
    return;
  }
  if (transportKind === 'web-serial' && !navigator.serial?.requestPort) {
    setSerialStatus('Web Serial is unavailable in this browser.', 'error');
    return;
  }

  busy = true;
  $('connectArduino').disabled = true;
  $('connectArduinoUsb').disabled = true;
  const TransportClass = transportKind === 'web-usb' ? WebUsbCdcTransport : WebSerialTransport;
  serialTransportKind = transportKind;
  serialTransport = new TransportClass({
    baudRate: FIRMWARE_LIMITS.baud,
    bootWaitMs: settings.arduinoBootWaitMs,
    onStatus: (message, kind) => {
      setSerialStatus(message, kind);
      if (serialTransport && !serialTransport.connected && servoTrackingActive) {
        stopServoTracking({ sendHold: false, message: 'USB connection was lost. Servo tracking stopped.' });
      }
    },
    onLine: (line) => {
      if (line === 'READY') {
        setSerialStatus('Arduino replied READY. Firmware is running.', 'success');
      } else if (line === 'ERR') {
        setServoMessage('Arduino replied ERR. Check that the uploaded firmware and angle limits match this app.', 'error');
      } else {
        setSerialStatus(`Arduino: ${line}`, 'info');
      }
    },
    onDisconnect: () => {
      if (servoTrackingActive) stopServoTracking({ sendHold: false, message: 'USB connection lost. Servo tracking stopped.' });
      updateControlButtons();
    },
  });

  try {
    await serialTransport.connect();
    clearRecordedError();
    lastSentKey = '';
    lastSerialSendAt = 0;
    setServoMessage('Connected. First test the Centre and small manual jog buttons with the phone detached.', 'success');
  } catch (error) {
    const cancelled = error?.name === 'NotFoundError' || error?.name === 'AbortError';
    setSerialStatus(cancelled ? 'No device was selected, or the chooser listed no compatible device. If the list was empty, try the other Connect button.' : `Connection failed: ${error?.message || error}`, cancelled ? 'info' : 'error');
    serialTransport = null;
  } finally {
    busy = false;
    updateControlButtons();
  }
}

async function disconnectArduino() {
  stopServoTracking({ sendHold: false, message: 'Disconnected. Automatic tracking is off.' });
  const transport = serialTransport;
  serialTransport = null;
  if (transport) await transport.disconnect();
  setSerialStatus('Arduino disconnected.', 'info');
  updateControlButtons();
}

async function sendManualAngles(yaw, tilt) {
  if (!serialTransport?.connected) return;
  const nextYaw = Math.round(clamp(yaw, settings.yawMin, settings.yawMax));
  const nextTilt = Math.round(clamp(tilt, settings.tiltMin, settings.tiltMax));
  lastAngles = { yaw: nextYaw, tilt: nextTilt };
  if (trackingController) trackingController.setAngles(nextYaw, nextTilt);
  $('yawValue').textContent = `${nextYaw}°`;
  $('tiltValue').textContent = `${nextTilt}°`;
  writePanelAngles(nextYaw, nextTilt);
  $('angleHelp').textContent = 'MANUAL SERVO TEST · Small commands sent directly to the Arduino.';
  const sent = await queueServoCommand(nextYaw, nextTilt, { force: true });
  setServoMessage(sent ? `Manual target sent: yaw ${nextYaw}°, tilt ${nextTilt}°.` : 'Command queued. Check the USB connection if the servos do not respond.', sent ? 'success' : 'info');
}

async function nudgeAxis(axis, direction) {
  if (servoTrackingActive || !serialTransport?.connected) return;
  const next = { ...lastAngles };
  const step = Number($('manualJogStep').value) || 5;
  next[axis] += direction * step;
  await sendManualAngles(next.yaw, next.tilt);
}

async function centreServos() {
  if (servoTrackingActive || !serialTransport?.connected) return;
  await sendManualAngles(settings.yawNeutral, settings.tiltNeutral);
}

async function startServoTracking() {
  if (!cameraStream || !serialTransport?.connected || servoTrackingActive) {
    setServoMessage('Start the camera and connect the Arduino before enabling servo tracking.', 'error');
    return;
  }
  trackingController = createServoTrackingController(settings, lastAngles);
  servoTrackingActive = true;
  await queueServoCommand(lastAngles.yaw, lastAngles.tilt, { force: true });
  setServoMessage('Automatic tracking active. The phone camera is the feedback sensor; keep the mount clear.', 'success');
  $('angleHelp').textContent = 'LIVE SERVO CONTROL · The controller sends bounded yaw/tilt corrections to the Arduino.';
  updateControlButtons();
}

function changeDirection(axis, value) {
  if (servoTrackingActive) return;
  const key = axis === 'yaw' ? 'yawDirection' : 'tiltDirection';
  settings = { ...settings, [key]: Number(value) };
  saveSettings(settings);
  settings = loadSettings().settings;
  renderConfig();
  setServoMessage(`${axis === 'yaw' ? 'Yaw' : 'Tilt'} direction saved as ${settings[key] === 1 ? 'normal' : 'reversed'}.`, 'success');
}

function renderResponseControls() {
  const bindings = [
    ['responseSpeed', 'responseSpeedValue', settings.maxSpeedDegPerS, (v) => `${v}°/s`],
    ['yawGain', 'yawGainValue', settings.gainYaw, (v) => String(v)],
    ['tiltGain', 'tiltGainValue', settings.gainTilt, (v) => String(v)],
    ['deadZone', 'deadZoneValue', Math.round(settings.deadZoneX * 100), (v) => `±${v}%`],
    ['responseSmoothing', 'responseSmoothingValue', settings.emaAlpha, (v) => Number(v).toFixed(2)],
  ];
  for (const [inputId, outputId, value, format] of bindings) {
    const input = $(inputId);
    const output = $(outputId);
    if (input) input.value = String(value);
    if (output) output.textContent = format(value);
  }
  updateJogLabels();
}

function updateJogLabels() {
  const step = Number($('manualJogStep')?.value || 5);
  $('yawMinus').textContent = `Yaw −${step}°`;
  $('yawPlus').textContent = `Yaw +${step}°`;
  $('tiltMinus').textContent = `Tilt −${step}°`;
  $('tiltPlus').textContent = `Tilt +${step}°`;
}

function applyResponseControls() {
  const zone = Number($('deadZone').value) / 100;
  const candidate = {
    ...settings,
    maxSpeedDegPerS: Number($('responseSpeed').value),
    gainYaw: Number($('yawGain').value),
    gainTilt: Number($('tiltGain').value),
    deadZoneX: zone,
    deadZoneY: zone,
    emaAlpha: Number($('responseSmoothing').value),
  };
  settings = sanitizeSettings(candidate).settings;
  saveSettings(settings);
  trackingController?.setSettings(settings);
  renderResponseControls();
  renderConfig();
  setServoMessage('Response settings saved and applied. You can adjust them while tracking.', 'success');
}

function showView(view, { restoreScroll = true } = {}) {
  const next = view === VIEWS.arduino ? VIEWS.arduino : VIEWS.camera;
  if (next !== currentView) scrollPositions[currentView] = window.scrollY;
  currentView = next;
  document.body.dataset.view = next;
  // The camera view is moved off-screen instead of display:none so the <video> keeps rendering
  // and MediaPipe keeps receiving frames while the Arduino panel is open.
  $('cameraView').classList.toggle('view-inactive', next !== VIEWS.camera);
  $('arduinoView').hidden = next !== VIEWS.arduino;
  $('backToCameraTop').hidden = next !== VIEWS.arduino;
  $('openArduinoPanel').setAttribute('aria-current', next === VIEWS.arduino ? 'page' : 'false');
  document.title = next === VIEWS.arduino ? 'Arduino Control Panel · YogAI Phone Tracker' : 'YogAI Phone Tracker';
  renderConnectionPanel();
  requestAnimationFrame(() => {
    window.scrollTo(0, restoreScroll ? (scrollPositions[next] || 0) : 0);
    if (next === VIEWS.arduino) $('arduinoPanelTitle').focus({ preventScroll: true });
  });
}

function openArduinoPanel() {
  if (currentView === VIEWS.arduino) return;
  arduinoOpenedInApp = true;
  // The hash change adds a history entry so the Android back gesture returns to the camera.
  window.location.hash = 'arduino';
}

function backToCamera() {
  if (currentView !== VIEWS.arduino) return;
  if (arduinoOpenedInApp && window.history.length > 1) {
    arduinoOpenedInApp = false;
    window.history.back();
  } else {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    showView(VIEWS.camera);
  }
}

function startApp() {
  const caps = detectCapabilities();
  settings = loadSettings().settings;
  lastAngles = { yaw: settings.yawNeutral, tilt: settings.tiltNeutral };
  renderCompatibility(caps);
  renderConfig();
  renderResponseControls();
  renderEnvironment(caps.environment);

  $('openArduinoPanel').addEventListener('click', openArduinoPanel);
  $('backToCameraTop').addEventListener('click', backToCamera);
  $('backToCamera').addEventListener('click', backToCamera);
  $('backToCameraBottom').addEventListener('click', backToCamera);
  $('cameraStopTracking').addEventListener('click', () => stopServoTracking());
  window.addEventListener('hashchange', () => {
    const view = viewFromHash(window.location.hash);
    if (view === VIEWS.camera) arduinoOpenedInApp = false;
    showView(view);
  });
  $('startCamera').addEventListener('click', startCamera);
  $('stopCamera').addEventListener('click', stopCamera);
  $('cameraSelect').addEventListener('change', switchCamera);
  $('connectArduino').addEventListener('click', () => connectArduino('auto'));
  $('connectArduinoUsb').addEventListener('click', () => connectArduino('web-usb'));
  $('disconnectArduino').addEventListener('click', disconnectArduino);
  $('centreServos').addEventListener('click', centreServos);
  $('yawMinus').addEventListener('click', () => nudgeAxis('yaw', -1));
  $('yawPlus').addEventListener('click', () => nudgeAxis('yaw', 1));
  $('tiltMinus').addEventListener('click', () => nudgeAxis('tilt', -1));
  $('tiltPlus').addEventListener('click', () => nudgeAxis('tilt', 1));
  $('startServoTracking').addEventListener('click', startServoTracking);
  $('yawDirectionSelect').value = String(settings.yawDirection);
  $('tiltDirectionSelect').value = String(settings.tiltDirection);
  $('yawDirectionSelect').addEventListener('change', (event) => changeDirection('yaw', event.target.value));
  $('tiltDirectionSelect').addEventListener('change', (event) => changeDirection('tilt', event.target.value));
  $('stopServoTracking').addEventListener('click', () => stopServoTracking());
  for (const id of ['responseSpeed', 'yawGain', 'tiltGain', 'deadZone', 'responseSmoothing']) {
    $(id).addEventListener('input', applyResponseControls);
  }
  $('manualJogStep').addEventListener('change', updateJogLabels);

  window.addEventListener('pagehide', () => {
    stopCamera();
    poseLandmarker?.close();
    poseLandmarker = null;
    void disconnectArduino();
  });

  drawBaseOverlay($('poseOverlay').getContext('2d'), $('poseOverlay').width, $('poseOverlay').height);
  $('yawValue').textContent = `${lastAngles.yaw}°`;
  $('tiltValue').textContent = `${lastAngles.tilt}°`;
  renderLimits();
  writePanelAngles(lastAngles.yaw, lastAngles.tilt);
  showView(viewFromHash(window.location.hash), { restoreScroll: false });
  updateControlButtons();
}

export { startApp };
