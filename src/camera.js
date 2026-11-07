export async function openCamera(videoElement, facingMode = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is unavailable. Open this app over HTTPS in a supported browser.');
  }

  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24, max: 30 },
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoElement.srcObject = stream;
  videoElement.playsInline = true;
  videoElement.muted = true;
  await videoElement.play();
  return stream;
}

export function closeCamera(stream, videoElement) {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
  }
  if (videoElement) {
    videoElement.pause();
    videoElement.srcObject = null;
  }
}
