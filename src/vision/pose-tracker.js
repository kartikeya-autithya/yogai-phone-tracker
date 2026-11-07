import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// Pin the WASM runtime to the same version as package.json.
const MEDIAPIPE_VERSION = '1.2.2';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export async function createPoseTracker(onStatus = () => {}) {
  onStatus('Loading MediaPipe runtime…');
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

  const base = {
    modelAssetPath: MODEL_URL,
  };
  const commonOptions = {
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  };

  onStatus('Loading the lightweight pose model…');
  try {
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      ...commonOptions,
      baseOptions: { ...base, delegate: 'GPU' },
    });
    return { landmarker, delegate: 'GPU' };
  } catch (gpuError) {
    onStatus('GPU unavailable; trying CPU…');
    try {
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        ...commonOptions,
        baseOptions: { ...base, delegate: 'CPU' },
      });
      return { landmarker, delegate: 'CPU' };
    } catch (cpuError) {
      const message = cpuError?.message || gpuError?.message || 'Unknown MediaPipe error';
      throw new Error(`MediaPipe could not start. ${message}`);
    }
  }
}
