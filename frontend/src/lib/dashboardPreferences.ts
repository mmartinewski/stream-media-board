const GRID_MODE_STORAGE_KEY = 'dashboard-grid-mode';

export function readDashboardGridMode(): boolean {
  try {
    return localStorage.getItem(GRID_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDashboardGridMode(gridMode: boolean): void {
  try {
    localStorage.setItem(GRID_MODE_STORAGE_KEY, gridMode ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

