import { MAX_THUMBNAIL_BYTES } from './imageDrop';

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encodeFrameUnderLimit(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create canvas context.');
  }

  let w = width;
  let h = height;
  canvas.width = w;
  canvas.height = h;

  for (let scaleAttempt = 0; scaleAttempt < 8; scaleAttempt++) {
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);

    let quality = 0.92;
    for (let qualityAttempt = 0; qualityAttempt < 8; qualityAttempt++) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (!blob) {
        throw new Error('Could not encode frame as JPEG.');
      }
      if (blob.size <= MAX_THUMBNAIL_BYTES) {
        return blob;
      }
      quality -= 0.1;
      if (quality < 0.35) break;
    }

    w = Math.max(1, Math.round(w * 0.85));
    h = Math.max(1, Math.round(h * 0.85));
  }

  throw new Error('Captured frame is too large (max 1 MB).');
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video frame is not ready yet. Scrub the timeline and try again.'));
    }, 3000);

    const finish = () => {
      if (video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', finish);
      video.removeEventListener('loadeddata', finish);
    };

    video.addEventListener('seeked', finish);
    video.addEventListener('loadeddata', finish);
  });
}

export async function captureVideoFrameFile(
  video: HTMLVideoElement,
  filename = 'video-frame.jpg',
): Promise<File> {
  await waitForVideoFrame(video);

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error('Video dimensions are not available.');
  }

  const maxDim = 1920;
  let w = vw;
  let h = vh;
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const blob = await encodeFrameUnderLimit(video, w, h);
  return new File([blob], filename, { type: 'image/jpeg' });
}
