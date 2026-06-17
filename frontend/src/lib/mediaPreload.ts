const EXTERNAL_VIDEO_BUFFER_TIMEOUT_MS = 12_000;

/** Wait until enough data is buffered to start smooth playback (external CDN media). */
export function waitForVideoElementReady(
  video: HTMLVideoElement,
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? EXTERNAL_VIDEO_BUFFER_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve();
      return;
    }

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const cleanup = () => {
      video.removeEventListener('canplaythrough', onCanPlayThrough);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      clearTimeout(timer);
    };

    const onCanPlayThrough = () => settle(() => resolve());
    const onCanPlay = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        settle(() => resolve());
      }
    };
    const onError = () => settle(() => reject(new Error('video_load_failed')));

    const timer = setTimeout(() => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        settle(() => resolve());
        return;
      }
      settle(() => reject(new Error('video_load_timeout')));
    }, timeoutMs);

    video.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError, { once: true });
  });
}

export function preloadVideoUrl(url: string): Promise<void> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  video.load();
  return waitForVideoElementReady(video).finally(() => {
    video.removeAttribute('src');
    video.load();
  });
}

export function preloadImageUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('image_preload_failed'));
    image.src = url;
  });
}

export function preloadMediaSearchResult(item: {
  playUrl: string;
  isAnimated: boolean;
  provider?: string;
}): Promise<void> {
  if (item.provider === 'imported' && item.isAnimated) {
    return preloadImageUrl(item.playUrl);
  }
  return item.isAnimated ? preloadVideoUrl(item.playUrl) : preloadImageUrl(item.playUrl);
}
