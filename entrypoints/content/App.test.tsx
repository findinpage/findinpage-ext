import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, type FindInPageHandle } from './App';
import { PageSearch, type SearchResponse, type SearchTask } from './search';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const RESULTS = [
  { id: 'result-1', before: '', match: 'needle', after: ' one', order: 1 },
  { id: 'result-2', before: '', match: 'needle', after: ' two', order: 2 },
  { id: 'result-3', before: '', match: 'needle', after: ' three', order: 3 },
];

describe('App close and reopen', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handle: FindInPageHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    container = document.createElement('div');
    container.dataset.findinpageHost = '';
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockSearch(complete: boolean) {
    vi.spyOn(PageSearch.prototype, 'select').mockReturnValue(true);
    const response: SearchResponse = {
      results: RESULTS,
      durationMs: 1,
      complete,
      highlightMode: 'native',
    };
    const task: SearchTask = {
      id: 1,
      cancel: vi.fn(),
      done: complete ? Promise.resolve(response) : new Promise(() => {}),
    };
    return vi.spyOn(PageSearch.prototype, 'search').mockImplementation((_query, _options, onUpdate) => {
      onUpdate?.(response);
      return task;
    });
  }

  function renderAndOpen() {
    act(() => {
      root.render(
        <App
          initialQuery="needle"
          onReady={(readyHandle) => {
            handle = readyHandle;
          }}
        />,
      );
    });
    act(() => {
      handle.openAndFocus();
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });
  }

  it('keeps the active result and current page position without searching again', () => {
    const search = mockSearch(true);
    const restoreHighlights = vi.spyOn(PageSearch.prototype, 'restoreHighlights');
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);

    renderAndOpen();
    act(() => {
      const nextButton = container.querySelector<HTMLButtonElement>('[title="Next result"]');
      nextButton?.click();
    });
    act(() => {
      const nextButton = container.querySelector<HTMLButtonElement>('[title="Next result"]');
      nextButton?.click();
    });
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('3/3');

    act(() => handle.close());
    restoreHighlights.mockClear();
    scrollIntoView.mockClear();

    act(() => {
      handle.openAndFocus();
      vi.runAllTimers();
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(restoreHighlights).toHaveBeenCalledWith('result-3');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('3/3');
  });

  it('does not restart a cancelled incomplete search when reopened', () => {
    const search = mockSearch(false);
    const cancelSearch = vi.spyOn(PageSearch.prototype, 'cancelSearch');

    renderAndOpen();
    act(() => handle.close());
    expect(cancelSearch).toHaveBeenCalled();

    act(() => {
      handle.openAndFocus();
      vi.runAllTimers();
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('1/3');
  });
});
