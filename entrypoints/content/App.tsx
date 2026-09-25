import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  installPageHighlightStyles,
  getOpenShadowRoots,
  PageSearch,
  type SearchResultView,
} from './search';

export interface FindInPageHandle {
  openAndFocus(): void;
  toggle(): void;
  close(): void;
  focus(): void;
  isOpen(): boolean;
  destroy(): void;
}

interface AppProps {
  onReady(handle: FindInPageHandle): void;
  installAction?: {
    label: string;
    onClick(): void;
  };
}

export function App({ onReady, installAction }: AppProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultView[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpenRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(new PageSearch());
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const lastSearchedQueryRef = useRef<string | undefined>(undefined);
  const pendingResultsScrollTopRef = useRef<number | undefined>(undefined);
  const skipNextResultListScrollRef = useRef(false);
  const suppressPageScrollRefreshUntilRef = useRef(0);
  const highlightFrameRef = useRef<number | undefined>(undefined);
  const resultVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => resultsRef.current,
    estimateSize: () => 60,
    overscan: 6,
  });

  useEffect(() => installPageHighlightStyles(), []);

  const setPanelVisibility = useCallback((visible: boolean) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.dataset.open = String(visible);
    panel.setAttribute('aria-hidden', String(!visible));
    panel.inert = !visible;
  }, []);

  const deferHighlightUpdate = useCallback((update: () => void) => {
    if (highlightFrameRef.current !== undefined) {
      cancelAnimationFrame(highlightFrameRef.current);
    }
    highlightFrameRef.current = requestAnimationFrame(() => {
      highlightFrameRef.current = requestAnimationFrame(() => {
        highlightFrameRef.current = undefined;
        update();
      });
    });
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const close = useCallback(() => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    setPanelVisibility(false);
    setIsOpen(false);
    restoreFocusRef.current?.focus({ preventScroll: true });
    restoreFocusRef.current = null;
    deferHighlightUpdate(() => {
      if (!isOpenRef.current) searchRef.current.hideHighlights();
    });
  }, [deferHighlightUpdate, setPanelVisibility]);

  useEffect(() => {
    const open = () => {
      if (!isOpenRef.current) {
        isOpenRef.current = true;
        restoreFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setPanelVisibility(true);
        setIsOpen(true);
        deferHighlightUpdate(() => {
          if (isOpenRef.current) searchRef.current.restoreHighlights(activeId);
        });
      }
      focusInput();
    };

    const handle: FindInPageHandle = {
      openAndFocus: open,
      toggle() {
        if (isOpenRef.current) close();
        else open();
      },
      close,
      focus: focusInput,
      isOpen: () => isOpenRef.current,
      destroy() {
        if (highlightFrameRef.current !== undefined) {
          cancelAnimationFrame(highlightFrameRef.current);
        }
        searchRef.current.clear();
      },
    };
    onReady(handle);
  }, [activeId, close, deferHighlightUpdate, focusInput, onReady, setPanelVisibility]);

  useEffect(() => {
    if (!isOpen) return;
    focusInput();
  }, [focusInput, isOpen]);

  const runSearch = useCallback(
    (preservePosition: boolean) => {
      const selectionAnchor =
        preservePosition && activeId
          ? searchRef.current.captureSelection(activeId)
          : undefined;
      if (preservePosition) {
        pendingResultsScrollTopRef.current = resultsRef.current?.scrollTop ?? 0;
      }

      const response = searchRef.current.search(query);
      lastSearchedQueryRef.current = query;
      setResults(response.results);

      const resolvedId = selectionAnchor
        ? searchRef.current.resolveSelection(selectionAnchor)
        : undefined;
      const nextResult = preservePosition
        ? response.results.find((result) => result.id === resolvedId)
        : response.results[0];
      if (!preservePosition) {
        suppressPageScrollRefreshUntilRef.current = performance.now() + 500;
      }
      setActiveId(
        nextResult && searchRef.current.select(nextResult.id, { scroll: !preservePosition })
          ? nextResult.id
          : undefined,
      );
    },
    [activeId, query],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (lastSearchedQueryRef.current === query) return;

    const timeout = window.setTimeout(() => {
      runSearch(false);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [isOpen, query, runSearch]);

  useEffect(() => {
    if (!isOpen || query.length === 0) return;

    let refreshTimeout: number | undefined;
    const observedRoots = new Set<Node>();
    const observeRoot = (root: Node) => {
      if (observedRoots.has(root)) return;
      observedRoots.add(root);
      observer.observe(root, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    };
    const observeOpenShadowRoots = () => {
      for (const shadowRoot of getOpenShadowRoots()) observeRoot(shadowRoot);
    };
    const scheduleRefresh = () => {
      observeOpenShadowRoots();
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => runSearch(true), 250);
    };
    const handlePageScroll = (event: Event) => {
      if (event.composedPath().includes(resultsRef.current as EventTarget)) return;
      if (performance.now() < suppressPageScrollRefreshUntilRef.current) return;
      scheduleRefresh();
    };

    const observer = new MutationObserver(scheduleRefresh);
    observeRoot(document.body);
    observeOpenShadowRoots();
    window.addEventListener('scroll', handlePageScroll, { capture: true, passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handlePageScroll, { capture: true });
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
    };
  }, [isOpen, query, runSearch]);

  const selectResult = (result: SearchResultView, scroll = true) => {
    if (scroll) {
      suppressPageScrollRefreshUntilRef.current = performance.now() + 500;
    }
    if (searchRef.current.select(result.id, { scroll })) {
      setActiveId(result.id);
      return;
    }

    const refreshed = searchRef.current.search(query);
    setResults(refreshed.results);
    const firstResult = refreshed.results[0];
    setActiveId(
      firstResult && searchRef.current.select(firstResult.id, { scroll: false })
        ? firstResult.id
        : undefined,
    );
  };

  const navigateResult = (direction: -1 | 1) => {
    if (results.length === 0) return;

    const currentIndex = results.findIndex((result) => result.id === activeId);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : results.length - 1
        : (currentIndex + direction + results.length) % results.length;
    selectResult(results[nextIndex]);
  };

  useEffect(() => {
    if (!activeId) return;
    if (pendingResultsScrollTopRef.current !== undefined) {
      const scrollTop = pendingResultsScrollTopRef.current;
      pendingResultsScrollTopRef.current = undefined;
      requestAnimationFrame(() => resultsRef.current?.scrollTo({ top: scrollTop }));
      return;
    }
    if (skipNextResultListScrollRef.current) {
      skipNextResultListScrollRef.current = false;
      return;
    }
    const activeIndex = results.findIndex((result) => result.id === activeId);
    if (activeIndex < 0) return;

    resultVirtualizer.scrollToIndex(activeIndex, { align: 'auto' });
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const container = resultsRef.current;
        const activeResult = container?.querySelector<HTMLElement>(
          `[data-index="${activeIndex}"]`,
        );
        if (!container || !activeResult) return;

        const containerRect = container.getBoundingClientRect();
        const resultRect = activeResult.getBoundingClientRect();
        if (resultRect.top < containerRect.top) {
          container.scrollTop += resultRect.top - containerRect.top;
        } else if (resultRect.bottom > containerRect.bottom) {
          container.scrollTop += resultRect.bottom - containerRect.bottom;
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeId, resultVirtualizer, results]);

  const hasQuery = query.length > 0;
  const activeIndex = results.findIndex((result) => result.id === activeId);
  const currentResult = activeIndex >= 0 ? activeIndex + 1 : 0;
  const totalResults = String(results.length);
  const navigationDisabled = results.length === 0;
  const activeOptionId = activeId ? `findinpage-result-${activeId}` : undefined;
  const searchStatus = !hasQuery
    ? 'Enter a search term.'
    : results.length === 0
      ? 'No matches on this page.'
      : `${results.length} ${results.length === 1 ? 'match' : 'matches'}. Result ${currentResult} selected.`;

  const handleSearchInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (lastSearchedQueryRef.current !== query) {
        runSearch(false);
      } else if (!navigationDisabled) {
        navigateResult(1);
      }
    } else if (event.key === 'ArrowUp' && !navigationDisabled) {
      event.preventDefault();
      navigateResult(-1);
    } else if (event.key === 'ArrowDown' && !navigationDisabled) {
      event.preventDefault();
      navigateResult(1);
    }
  };

  return (
    <section
      ref={panelRef}
      className="findinpage-panel"
      role="search"
      aria-label="Find in Page page search"
      aria-hidden={!isOpen}
      data-open={isOpen}
      inert={isOpen ? undefined : true}
    >
      <div className="findinpage-toolbar">
        <Input
          ref={inputRef}
          type="search"
          variant="bare"
          role="combobox"
          aria-label="Search this page"
          aria-autocomplete="none"
          aria-controls="findinpage-results"
          aria-expanded={results.length > 0}
          aria-activedescendant={activeOptionId}
          aria-keyshortcuts="Enter ArrowUp ArrowDown"
          placeholder="Find in Page"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onKeyDown={handleSearchInputKeyDown}
          onChange={(event) => setQuery(event.target.value)}
        />
        {results.length > 0 && (
          <span
            className="findinpage-counter"
            aria-hidden="true"
          >
            {currentResult}/{totalResults}
          </span>
        )}
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {searchStatus}
        </span>
        <span className="findinpage-divider" aria-hidden="true" />
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          aria-label="Previous result"
          title="Previous result"
          disabled={navigationDisabled}
          onClick={() => navigateResult(-1)}
        >
          <ChevronUp data-icon="inline-start" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          aria-label="Next result"
          title="Next result"
          disabled={navigationDisabled}
          onClick={() => navigateResult(1)}
        >
          <ChevronDown data-icon="inline-start" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          onClick={close}
          aria-label="Close Find in Page"
          title="Close"
        >
          <X data-icon="inline-start" aria-hidden="true" />
        </Button>
      </div>

      <div
        id="findinpage-results"
        ref={resultsRef}
        className="findinpage-results"
        role={results.length > 0 ? 'listbox' : undefined}
        aria-label="Search results"
      >
        {!hasQuery && (
          <div className="findinpage-empty">
            <div className="findinpage-empty-icon" aria-hidden="true">
              <Search />
            </div>
            <p className="findinpage-empty-copy">
              Matches will appear here with their surrounding context.
            </p>
          </div>
        )}

        {hasQuery && results.length === 0 && (
          <div className="findinpage-empty findinpage-empty--compact">
            <p className="findinpage-empty-copy">No matches on this page.</p>
          </div>
        )}

        {results.length > 0 && (
          <div
            className="findinpage-results-virtual"
            role="presentation"
            style={{ height: `${resultVirtualizer.getTotalSize()}px` }}
          >
            {resultVirtualizer.getVirtualItems().map((virtualItem) => {
              const result = results[virtualItem.index];
              return (
                <Button
                  key={virtualItem.key}
                  ref={resultVirtualizer.measureElement}
                  type="button"
                  variant="result"
                  size="result"
                  id={`findinpage-result-${result.id}`}
                  role="option"
                  tabIndex={-1}
                  data-index={virtualItem.index}
                  data-result-id={result.id}
                  aria-posinset={virtualItem.index + 1}
                  aria-setsize={results.length}
                  aria-selected={activeId === result.id}
                  style={{ top: `${virtualItem.start}px` }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (result.id !== activeId) {
                      skipNextResultListScrollRef.current = true;
                    }
                    selectResult(result);
                  }}
                >
                  <span className="findinpage-index">
                    {result.order}
                  </span>
                  <span className="findinpage-result-copy">
                    {result.before}
                    <mark
                      className={cn(
                        'findinpage-match',
                        activeId === result.id && 'findinpage-match--active',
                      )}
                    >
                      {result.match}
                    </mark>
                    {result.after}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {installAction && (
        <div className="findinpage-install">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="findinpage-install-button"
            onClick={installAction.onClick}
          >
            {installAction.label}
          </Button>
        </div>
      )}

    </section>
  );
}
