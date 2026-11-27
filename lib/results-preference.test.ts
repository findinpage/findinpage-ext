import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadShowResultsList,
  normalizeShowResultsList,
  saveShowResultsList,
  SHOW_RESULTS_LIST_STORAGE_KEY,
} from './results-preference';

describe('show results list preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts only boolean values and defaults to true', () => {
    expect(normalizeShowResultsList(true)).toBe(true);
    expect(normalizeShowResultsList(false)).toBe(false);
    expect(normalizeShowResultsList('false')).toBe(true);
    expect(normalizeShowResultsList(undefined)).toBe(true);
  });

  it('loads a stored boolean and defaults invalid values to true', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ [SHOW_RESULTS_LIST_STORAGE_KEY]: false })
      .mockResolvedValueOnce({ [SHOW_RESULTS_LIST_STORAGE_KEY]: 'false' });
    vi.stubGlobal('browser', { storage: { local: { get } } });

    await expect(loadShowResultsList()).resolves.toBe(false);
    await expect(loadShowResultsList()).resolves.toBe(true);
  });

  it('defaults to true when storage cannot be read', async () => {
    vi.stubGlobal('browser', {
      storage: { local: { get: vi.fn().mockRejectedValue(new Error('unavailable')) } },
    });

    await expect(loadShowResultsList()).resolves.toBe(true);
  });

  it('persists the normalized boolean and tolerates write failures', async () => {
    const set = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('unavailable'));
    vi.stubGlobal('browser', { storage: { local: { set } } });

    await expect(saveShowResultsList(false)).resolves.toBeUndefined();
    expect(set).toHaveBeenNthCalledWith(1, {
      [SHOW_RESULTS_LIST_STORAGE_KEY]: false,
    });
    await expect(saveShowResultsList(true)).resolves.toBeUndefined();
  });
});
