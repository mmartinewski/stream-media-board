const BROWSE_GRID_MODE_STORAGE_KEY = 'browse-grid-mode';
const BROWSE_SEARCH_IN_CATEGORY_KEY = 'browse-search-in-category-only';

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

/** Default true: limit browse search to the current category/categories view. */
export function readBrowseSearchInCategoryOnly(): boolean {
  try {
    const value = localStorage.getItem(BROWSE_SEARCH_IN_CATEGORY_KEY);
    if (value === '0') return false;
    if (value === '1') return true;
    return true;
  } catch {
    return true;
  }
}

export function writeBrowseSearchInCategoryOnly(inCategoryOnly: boolean): void {
  try {
    localStorage.setItem(BROWSE_SEARCH_IN_CATEGORY_KEY, inCategoryOnly ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}
