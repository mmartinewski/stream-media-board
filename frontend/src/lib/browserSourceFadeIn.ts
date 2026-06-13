export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export interface BrowserSourceFadeInHandle {
  finished: Promise<void>;
  cancel: () => void;
}

export function handoffBrowserSourceFadeInToCssVisible(fadeEl: HTMLElement | null): void {
  if (!fadeEl) return;
  fadeEl.classList.remove('is-waapi-fade-in');
  fadeEl.style.removeProperty('visibility');
  fadeEl.getAnimations().forEach((anim) => anim.cancel());
}

export function releaseBrowserSourceFadeInHandoff(fadeEl: HTMLElement | null): void {
  fadeEl?.classList.remove('is-fade-commit');
}

export function runBrowserSourceFadeIn(
  fadeEl: HTMLElement | null,
  durationMs: number,
): BrowserSourceFadeInHandle {
  if (!fadeEl || typeof fadeEl.animate !== 'function') {
    return { finished: Promise.resolve(), cancel: () => {} };
  }

  fadeEl.classList.add('is-waapi-fade-in');
  fadeEl.style.visibility = 'visible';
  const animation = fadeEl.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: durationMs, easing: 'ease-in-out', fill: 'forwards' },
  );

  const cleanup = () => {
    fadeEl.classList.remove('is-waapi-fade-in', 'is-fade-commit');
    fadeEl.style.removeProperty('visibility');
    animation.cancel();
  };

  return {
    cancel: cleanup,
    finished: animation.finished
      .then(() => undefined)
      .catch(() => {
        fadeEl.classList.remove('is-waapi-fade-in', 'is-fade-commit');
        fadeEl.style.removeProperty('visibility');
      }),
  };
}
