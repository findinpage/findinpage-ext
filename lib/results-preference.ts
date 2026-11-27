export const SHOW_RESULTS_LIST_STORAGE_KEY = 'findinpage.show-results-list';

export function normalizeShowResultsList(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

export async function loadShowResultsList(): Promise<boolean> {
  try {
    if (typeof browser === 'undefined' || !browser.storage?.local) return true;
    const stored = await browser.storage.local.get(SHOW_RESULTS_LIST_STORAGE_KEY);
    return normalizeShowResultsList(
      stored[SHOW_RESULTS_LIST_STORAGE_KEY],
    );
  } catch {
    return true;
  }
}

export async function saveShowResultsList(value: boolean): Promise<void> {
  try {
    if (typeof browser === 'undefined' || !browser.storage?.local) return;
    await browser.storage.local.set({
      [SHOW_RESULTS_LIST_STORAGE_KEY]: normalizeShowResultsList(value),
    });
  } catch {
    // The default behavior remains available when storage is unavailable.
  }
}
