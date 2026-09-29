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

  function renderAndOpen(keepHighlightsOnClose = false) {
    act(() => {
      root.render(
        <App
          initialQuery="needle"
          keepHighlightsOnClose={keepHighlightsOnClose}
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

  it('hides highlights when closed by default', () => {
    mockSearch(true);
    const hideHighlights = vi.spyOn(PageSearch.prototype, 'hideHighlights');
    renderAndOpen();
    hideHighlights.mockClear();

    act(() => {
      handle.close();
      vi.runAllTimers();
    });

    expect(hideHighlights).toHaveBeenCalled();
  });

  it('keeps highlights visible when the preference is enabled', () => {
    mockSearch(true);
    const hideHighlights = vi.spyOn(PageSearch.prototype, 'hideHighlights');
    renderAndOpen(true);
    hideHighlights.mockClear();

    act(() => {
      handle.close();
      vi.runAllTimers();
    });

    expect(hideHighlights).not.toHaveBeenCalled();
  });

  it('updates retained highlights immediately while the panel is closed', () => {
    mockSearch(true);
    const hideHighlights = vi.spyOn(PageSearch.prototype, 'hideHighlights');
    const restoreHighlights = vi.spyOn(PageSearch.prototype, 'restoreHighlights');
    const onReady = (readyHandle: FindInPageHandle) => {
      handle = readyHandle;
    };

    act(() => {
      root.render(
        <App
          initialQuery="needle"
          keepHighlightsOnClose
          onReady={onReady}
        />,
      );
    });
    act(() => {
      handle.openAndFocus();
      vi.advanceTimersByTime(120);
      handle.close();
    });
    hideHighlights.mockClear();
    restoreHighlights.mockClear();

    act(() => {
      root.render(
        <App
          initialQuery="needle"
          keepHighlightsOnClose={false}
          onReady={onReady}
        />,
      );
    });
    expect(hideHighlights).toHaveBeenCalled();

    hideHighlights.mockClear();
    act(() => {
      root.render(
        <App
          initialQuery="needle"
          keepHighlightsOnClose
          onReady={onReady}
        />,
      );
    });
    expect(restoreHighlights).toHaveBeenCalled();
    expect(hideHighlights).not.toHaveBeenCalled();
  });

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

  it('opens a closed panel and navigates once through retained results', () => {
    const search = mockSearch(true);
    renderAndOpen();

    act(() => {
      handle.close();
      handle.navigate(1);
    });

    expect(handle.isOpen()).toBe(true);
    expect(search).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('2/3');
  });

  it('runs a pending query before navigating backward', () => {
    const search = mockSearch(true);
    renderAndOpen();
    const input = container.querySelector<HTMLInputElement>('.findinpage-input');

    act(() => {
      if (!input) throw new Error('Search input was not rendered.');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'updated',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => handle.navigate(-1));

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith(
      'updated',
      expect.any(Object),
      expect.any(Function),
    );
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('3/3');
  });

  it('fills the input and immediately searches selected page text', () => {
    const search = mockSearch(true);
    const resolveRangeSelection = vi
      .spyOn(PageSearch.prototype, 'resolveRangeSelection')
      .mockReturnValue('result-3');
    renderAndOpen();
    const selectedNode = document.createTextNode('selected text');
    document.body.append(selectedNode);
    const range = document.createRange();
    range.selectNodeContents(selectedNode);

    act(() => handle.search({ text: 'selected text', range }));

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith(
      'selected text',
      expect.any(Object),
      expect.any(Function),
    );
    expect(container.querySelector<HTMLInputElement>('.findinpage-input')?.value)
      .toBe('selected text');
    expect(resolveRangeSelection).toHaveBeenCalled();
    expect(PageSearch.prototype.select).toHaveBeenLastCalledWith(
      'result-3',
      { scroll: false },
    );
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('3/3');
  });

  it('falls back to the first result without page scrolling when a selection cannot be resolved', () => {
    mockSearch(true);
    vi.spyOn(PageSearch.prototype, 'resolveRangeSelection').mockReturnValue(undefined);
    renderAndOpen();
    const selectedNode = document.createTextNode('selected text');
    document.body.append(selectedNode);
    const range = document.createRange();
    range.selectNodeContents(selectedNode);

    act(() => handle.search({ text: 'selected text', range }));

    expect(PageSearch.prototype.select).toHaveBeenLastCalledWith(
      'result-1',
      { scroll: false },
    );
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('1/3');
  });

  it('restores a cross-page query without searching until Enter is pressed', () => {
    const search = mockSearch(true);
    act(() => {
      root.render(
        <App
          onReady={(readyHandle) => {
            handle = readyHandle;
          }}
        />,
      );
    });

    act(() => {
      handle.restoreSession('retained query', {
        caseSensitive: false,
        wholeWord: true,
        useRegularExpression: false,
      });
      vi.runAllTimers();
    });

    expect(handle.isOpen()).toBe(true);
    expect(container.querySelector<HTMLInputElement>('.findinpage-input')?.value)
      .toBe('retained query');
    expect(search).not.toHaveBeenCalled();

    act(() => {
      const input = container.querySelector<HTMLInputElement>('.findinpage-input');
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(search).toHaveBeenCalledOnce();
    expect(PageSearch.prototype.select).toHaveBeenLastCalledWith(
      'result-1',
      { scroll: true },
    );
  });

  it('reruns a restored same-page query and restores its result index without scrolling', () => {
    const search = mockSearch(true);
    act(() => {
      root.render(
        <App
          onReady={(readyHandle) => {
            handle = readyHandle;
          }}
        />,
      );
    });

    act(() => {
      handle.restoreSession(
        'needle',
        {
          caseSensitive: true,
          wholeWord: false,
          useRegularExpression: false,
        },
        2,
      );
      handle.runPendingSearch();
    });

    expect(search).toHaveBeenCalledWith(
      'needle',
      {
        caseSensitive: true,
        wholeWord: false,
        useRegularExpression: false,
      },
      expect.any(Function),
    );
    expect(PageSearch.prototype.select).toHaveBeenLastCalledWith(
      'result-3',
      { scroll: false },
    );
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('3/3');
  });

  it('keeps a restored same-page search explicitly unselected', () => {
    const search = mockSearch(true);
    const select = vi.mocked(PageSearch.prototype.select);
    act(() => {
      root.render(
        <App
          onReady={(readyHandle) => {
            handle = readyHandle;
          }}
        />,
      );
    });

    act(() => {
      handle.restoreSession(
        'needle',
        {
          caseSensitive: false,
          wholeWord: false,
          useRegularExpression: false,
        },
        null,
      );
      handle.runPendingSearch();
    });

    expect(search).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
    expect(container.querySelector('.findinpage-counter')?.textContent).toBe('0/3');
  });
});
