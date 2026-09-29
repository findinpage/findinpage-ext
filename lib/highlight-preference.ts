export const KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY = 'findinpage.keep-highlights-on-close';

export function normalizeKeepHighlightsOnClose(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

export async function loadKeepHighlightsOnClose(): Promise<boolean> {
  try {
    if (typeof browser === 'undefined' || !browser.storage?.local) return false;
    const stored = await browser.storage.local.get(KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY);
    return normalizeKeepHighlightsOnClose(
      stored[KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY],
    );
  } catch {
    return false;
  }
}

export async function saveKeepHighlightsOnClose(value: boolean): Promise<void> {
  try {
    if (typeof browser === 'undefined' || !browser.storage?.local) return;
    await browser.storage.local.set({
      [KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY]: normalizeKeepHighlightsOnClose(value),
    });
  } catch {
    // The default behavior remains available when storage is unavailable.
  }
}
