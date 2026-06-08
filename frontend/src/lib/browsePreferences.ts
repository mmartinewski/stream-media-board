const BROWSE_GRID_MODE_STORAGE_KEY = 'browse-grid-mode';

export function readBrowseGridMode(): boolean {
  try {
    return localStorage.getItem(BROWSE_GRID_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeBrowseGridMode(gridMode: boolean): void {
  try {
    localStorage.setItem(BROWSE_GRID_MODE_STORAGE_KEY, gridMode ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}
