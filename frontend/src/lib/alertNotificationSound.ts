export const ALERT_NOTIFICATION_SOUND_URL = '/sounds/alert-notification.mp3';

/** Prime audio element so browser/OBS sources can play on first alert. */
export async function prepareAlertAudio(audio: HTMLAudioElement): Promise<void> {
  const previousVolume = audio.volume;
  audio.volume = 0.001;
  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Browsers may block until user interaction; alert playback will retry.
  } finally {
    audio.volume = previousVolume > 0 ? previousVolume : 0.4;
  }
}

export async function playAlertNotificationSound(
  audio: HTMLAudioElement,
  volume = 0.4,
): Promise<void> {
  const level = Math.min(Math.max(volume, 0), 1);
  const playback = audio.cloneNode(true) as HTMLAudioElement;
  playback.volume = level;
  playback.preload = 'auto';

  const cleanup = () => {
    playback.removeEventListener('ended', cleanup);
    playback.remove();
  };
  playback.addEventListener('ended', cleanup);
  document.body.appendChild(playback);

  try {
    await playback.play();
  } catch {
    playback.remove();
    // Fallback: reuse the main element without interrupting mid-sample.
    audio.pause();
    audio.volume = level;
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch {
      // Ignore autoplay restrictions.
    }
  }
}
