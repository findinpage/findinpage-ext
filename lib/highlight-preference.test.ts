import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY,
  loadKeepHighlightsOnClose,
  normalizeKeepHighlightsOnClose,
  saveKeepHighlightsOnClose,
} from './highlight-preference';

describe('keep highlights on close preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts only boolean values', () => {
    expect(normalizeKeepHighlightsOnClose(true)).toBe(true);
    expect(normalizeKeepHighlightsOnClose(false)).toBe(false);
    expect(normalizeKeepHighlightsOnClose('true')).toBe(false);
    expect(normalizeKeepHighlightsOnClose(undefined)).toBe(false);
  });

  it('loads a stored boolean and defaults invalid values to false', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ [KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY]: true })
      .mockResolvedValueOnce({ [KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY]: 'true' });
    vi.stubGlobal('browser', { storage: { local: { get } } });

    await expect(loadKeepHighlightsOnClose()).resolves.toBe(true);
    await expect(loadKeepHighlightsOnClose()).resolves.toBe(false);
  });

  it('defaults to false when storage cannot be read', async () => {
    vi.stubGlobal('browser', {
      storage: { local: { get: vi.fn().mockRejectedValue(new Error('unavailable')) } },
    });

    await expect(loadKeepHighlightsOnClose()).resolves.toBe(false);
  });

  it('persists the normalized boolean and tolerates write failures', async () => {
    const set = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('unavailable'));
    vi.stubGlobal('browser', { storage: { local: { set } } });

    await expect(saveKeepHighlightsOnClose(true)).resolves.toBeUndefined();
    expect(set).toHaveBeenNthCalledWith(1, {
      [KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY]: true,
    });
    await expect(saveKeepHighlightsOnClose(false)).resolves.toBeUndefined();
  });
});
