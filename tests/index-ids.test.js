import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

function section(startId) {
  const start = html.indexOf(`id="${startId}"`);
  assert.ok(start >= 0, `${startId} missing`);
  const end = html.indexOf('</main>', start);
  return html.slice(start, end);
}

test('every element id in index.html is unique', () => {
  const seen = new Set();
  for (const id of ids) {
    assert.ok(!seen.has(id), `duplicate id: ${id}`);
    seen.add(id);
  }
});

test('every $("id") lookup in app.js exists in index.html', () => {
  const wanted = new Set([...app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  for (const id of wanted) assert.ok(ids.includes(id), `app.js uses #${id} but index.html has no such id`);
  assert.ok(wanted.size > 40);
});

test('ids used in loops and binding tables exist', () => {
  const loopIds = [
    'responseSpeed', 'responseSpeedValue', 'yawGain', 'yawGainValue', 'tiltGain', 'tiltGainValue',
    'deadZone', 'deadZoneValue', 'responseSmoothing', 'responseSmoothingValue',
  ];
  for (const id of loopIds) assert.ok(ids.includes(id), `#${id} missing`);
});

test('the Arduino view contains the connection, servo and tuning controls', () => {
  const panel = section('arduinoView');
  const required = [
    'connectArduino', 'connectArduinoUsb', 'disconnectArduino', 'serialState', 'serialMessage', 'lastError',
    'connectionMethod', 'panelConnText', 'panelYaw', 'panelTilt', 'centreServos', 'startServoTracking',
    'stopServoTracking', 'yawMinus', 'yawPlus', 'tiltMinus', 'tiltPlus', 'manualJogStep',
    'yawDirectionSelect', 'tiltDirectionSelect', 'responseSpeed', 'yawGain', 'tiltGain', 'deadZone',
    'responseSmoothing', 'cfgTable', 'servoMessage', 'backToCamera', 'backToCameraBottom',
  ];
  for (const id of required) assert.ok(panel.includes(`id="${id}"`), `#${id} not inside the Arduino view`);
});

test('the camera view keeps the camera controls and the panel entry button', () => {
  const camera = html.slice(html.indexOf('id="cameraView"'), html.indexOf('id="arduinoView"'));
  for (const id of [
    'openArduinoPanel', 'cameraStopTracking', 'cameraSelect', 'cameraVideo', 'poseOverlay',
    'startCamera', 'stopCamera', 'trackingState', 'yawValue', 'tiltValue', 'positionValue', 'fpsValue', 'delegateValue',
  ]) {
    assert.ok(camera.includes(`id="${id}"`), `#${id} not inside the camera view`);
  }
});

test('the entry button is labelled Arduino Control Panel and the back button Back to Camera', () => {
  assert.match(html, /Arduino Control Panel<\/span>/);
  assert.match(html, /← Back to Camera<\/button>/);
});

test('the camera view is not removed or hidden by default, and the video is never inside the hidden panel', () => {
  const cameraTag = html.match(/<main[^>]*id="cameraView"[^>]*>/)[0];
  assert.doesNotMatch(cameraTag, /\shidden/);
  assert.ok(!section('arduinoView').includes('id="cameraVideo"'));
});
