import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Asterisk, CaseSensitive, Check, ChevronDown, ChevronUp, Search, WholeWord, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/toggle';
import { getBrowserLocale, translate, type SupportedLocale } from '@/lib/i18n';
import {
  DEFAULT_SEARCH_OPTIONS,
  installPageHighlightStyles,
  getAccessibleDocuments,
  getOpenShadowRoots,
  PageSearch,
  type HighlightMode,
  type SearchError,
  type SearchOptions,
  type SearchResultView,
} from './search';
import type { SearchOptionsStore } from './search-options';

export interface FindInPageHandle {
  openAndFocus(): void;
  navigate(direction: -1 | 1): void;
  search(text: string): void;
  toggle(): void;
  close(): void;
  focus(): void;
  isOpen(): boolean;
  closeTransient(): boolean;
  destroy(): void;
}

interface AppProps {
  onReady(handle: FindInPageHandle): void;
  initialQuery?: string;
  installAction?: {
    label: string;
    onClick(): void;
  };
  searchOptionsStore?: SearchOptionsStore;
  locale?: SupportedLocale;
}

export function App({
  onReady,
  initialQuery = '',
  installAction,
  searchOptionsStore,
  locale = getBrowserLocale(),
}: AppProps) {
  const t = useCallback(
    (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [searchError, setSearchError] = useState<SearchError>();
  const [isSearching, setIsSearching] = useState(false);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('native');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [results, setResults] = useState<SearchResultView[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const panelRef = useRef<HTMLElement>(null);
  const optionsOpenRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpenRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(new PageSearch());
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const lastSearchSignatureRef = useRef<string | undefined>(undefined);
  const pendingResultsScrollTopRef = useRef<number | undefined>(undefined);
  const skipNextResultListScrollRef = useRef(false);
  const suppressPageScrollRefreshUntilRef = useRef(0);
  const highlightFrameRef = useRef<number | undefined>(undefined);
  const searchTaskIdRef = useRef<number | undefined>(undefined);
  const navigateShortcutRef = useRef<(direction: -1 | 1) => void>(() => {});
  const searchTextRef = useRef<(text: string) => void>(() => {});
  const resultVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => resultsRef.current,
    estimateSize: () => 60,
    overscan: 6,
  });

  useEffect(() => installPageHighlightStyles(), []);

  useEffect(() => {
    if (!searchOptionsStore) return;
    let active = true;
    void searchOptionsStore.load().then((options) => {
      if (active) setSearchOptions(options);
    });
    return () => {
      active = false;
    };
  }, [searchOptionsStore]);

  const setOptionsVisibility = useCallback((open: boolean) => {
    optionsOpenRef.current = open;
    setOptionsOpen(open);
  }, []);

  const focusInputWithoutSelection = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  const handleOptionsOpenChange = useCallback((open: boolean) => {
    setOptionsVisibility(open);
    if (!open && isOpenRef.current) focusInputWithoutSelection();
  }, [focusInputWithoutSelection, setOptionsVisibility]);

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
    optionsOpenRef.current = false;
    setOptionsOpen(false);
    // WebKit repaints mutated highlights more reliably while their host UI is visible.
    searchRef.current.cancelSearch();
    searchTaskIdRef.current = undefined;
    setIsSearching(false);
    searchRef.current.hideHighlights();
    setPanelVisibility(false);
    setIsOpen(false);
    restoreFocusRef.current?.focus({ preventScroll: true });
    restoreFocusRef.current = null;
    deferHighlightUpdate(() => {
      if (!isOpenRef.current) searchRef.current.hideHighlights();
    });
  }, [deferHighlightUpdate, setPanelVisibility]);

  useEffect(() => {
    const open = (restoreHighlights = true) => {
      if (!isOpenRef.current) {
        isOpenRef.current = true;
        restoreFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setPanelVisibility(true);
        setIsOpen(true);
        if (restoreHighlights) {
          deferHighlightUpdate(() => {
            if (isOpenRef.current) searchRef.current.restoreHighlights(activeId);
          });
        }
      }
      focusInput();
    };

    const handle: FindInPageHandle = {
      openAndFocus: open,
      navigate(direction) {
        navigateShortcutRef.current(direction);
      },
      search(text) {
        searchTextRef.current(text);
      },
      toggle() {
        if (isOpenRef.current) close();
        else open();
      },
      close,
      focus: focusInput,
      isOpen: () => isOpenRef.current,
      closeTransient() {
        if (!optionsOpenRef.current) return false;
        setOptionsVisibility(false);
        focusInputWithoutSelection();
        return true;
      },
      destroy() {
        if (highlightFrameRef.current !== undefined) {
          cancelAnimationFrame(highlightFrameRef.current);
        }
        searchRef.current.clear();
      },
    };
    onReady(handle);
  }, [activeId, close, deferHighlightUpdate, focusInput, focusInputWithoutSelection, onReady, setOptionsVisibility, setPanelVisibility]);

  useEffect(() => {
    if (!isOpen) return;
    focusInput();
  }, [focusInput, isOpen]);

  const runSearch = useCallback(
    (
      preservePosition: boolean,
      navigateOnComplete?: -1 | 1,
      nextQuery = query,
      nextSearchOptions = searchOptions,
    ) => {
      const selectionAnchor =
        preservePosition && activeId
          ? searchRef.current.captureSelection(activeId)
          : undefined;
      if (preservePosition) {
        pendingResultsScrollTopRef.current = resultsRef.current?.scrollTop ?? 0;
      }

      lastSearchSignatureRef.current = JSON.stringify([nextQuery, nextSearchOptions]);
      setIsSearching(nextQuery.length > 0);
      let selectedInitialResult = false;
      let selectedResultId: string | undefined;
      let taskId: number | undefined;
      const task = searchRef.current.search(nextQuery, nextSearchOptions, (response) => {
        if (taskId !== undefined && searchTaskIdRef.current !== taskId) return;
        setSearchError(response.error);
        setResults(response.results);
        setHighlightMode(response.highlightMode);
        setIsSearching(!response.complete);

        const resolvedId = selectionAnchor
          ? searchRef.current.resolveSelection(selectionAnchor)
          : undefined;
        const nextResult = navigateOnComplete
          ? response.complete
            ? response.results[navigateOnComplete === 1 ? 0 : response.results.length - 1]
            : undefined
          : preservePosition
            ? response.results.find((result) => result.id === resolvedId)
            : response.results[0];
        if (!selectedInitialResult && nextResult) {
          selectedInitialResult = true;
          selectedResultId = nextResult.id;
          if (!preservePosition) suppressPageScrollRefreshUntilRef.current = performance.now() + 500;
          setActiveId(
            searchRef.current.select(nextResult.id, { scroll: !preservePosition })
              ? nextResult.id
              : undefined,
          );
        } else if (response.complete && response.results.length === 0) {
          setActiveId(undefined);
        } else if (response.complete && selectedResultId) {
          searchRef.current.select(selectedResultId, { scroll: false });
        }
      });
      taskId = task.id;
      searchTaskIdRef.current = task.id;
    },
    [activeId, query, searchOptions],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (lastSearchSignatureRef.current === JSON.stringify([query, searchOptions])) return;

    const timeout = window.setTimeout(() => {
      runSearch(false);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [isOpen, query, runSearch, searchOptions]);

  useEffect(() => {
    if (!isOpen || query.length === 0) return;

    let refreshTimeout: number | undefined;
    const observedRoots = new Set<Node>();
    const observedDocuments = new Set<Document>();
    const observers = new Map<Document, MutationObserver>();
    const observeRoot = (root: Node) => {
      if (observedRoots.has(root)) return;
      observedRoots.add(root);
      const ownerDocument = root.ownerDocument ?? document;
      const NodeForDocument = ownerDocument.defaultView?.Node;
      if (!NodeForDocument || !(root instanceof NodeForDocument)) return;
      let observer = observers.get(ownerDocument);
      if (!observer) {
        const MutationObserverForDocument = ownerDocument.defaultView?.MutationObserver;
        if (!MutationObserverForDocument) return;
        observer = new MutationObserverForDocument((records) => {
          const isOwnNode = (node: Node) => {
            if (node.nodeType !== 1) return false;
            const element = node as Element;
            return element.hasAttribute('data-findinpage-fallback') ||
              element.hasAttribute('data-findinpage-control-mirror');
          };
          if (records.every((record) =>
            [...record.addedNodes, ...record.removedNodes].some(isOwnNode)
          )) return;
          scheduleRefresh();
        });
        observers.set(ownerDocument, observer);
      }
      try {
        observer.observe(root, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      } catch {
        // Some browsers reject observing a same-origin node from another realm.
      }
    };
    const observeAccessibleDocuments = () => {
      for (const ownerDocument of getAccessibleDocuments()) {
        if (!observedDocuments.has(ownerDocument)) {
          observedDocuments.add(ownerDocument);
          ownerDocument.addEventListener('load', scheduleRefresh, true);
          ownerDocument.addEventListener('input', handleControlValueChange, true);
          ownerDocument.addEventListener('change', handleControlValueChange, true);
          ownerDocument.defaultView?.addEventListener('scroll', handlePageScroll, {
            capture: true,
            passive: true,
          });
        }
        if (ownerDocument.body) observeRoot(ownerDocument.body);
        for (const shadowRoot of getOpenShadowRoots(ownerDocument.body)) {
          observeRoot(shadowRoot);
        }
      }
    };
    const scheduleRefresh = () => {
      observeAccessibleDocuments();
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => runSearch(true), 250);
    };
    const handlePageScroll = (event: Event) => {
      if (event.composedPath().includes(resultsRef.current as EventTarget)) return;
      if (performance.now() < suppressPageScrollRefreshUntilRef.current) return;
      scheduleRefresh();
    };
    const handleControlValueChange = (event: Event) => {
      const target = event.target;
      if (!target || typeof target !== 'object' || !('matches' in target)) return;
      if ((target as Element).matches('textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"]')) {
        scheduleRefresh();
      }
    };

    observeAccessibleDocuments();

    return () => {
      for (const observer of observers.values()) observer.disconnect();
      for (const ownerDocument of observedDocuments) {
        ownerDocument.removeEventListener('load', scheduleRefresh, true);
        ownerDocument.removeEventListener('input', handleControlValueChange, true);
        ownerDocument.removeEventListener('change', handleControlValueChange, true);
        ownerDocument.defaultView?.removeEventListener('scroll', handlePageScroll, {
          capture: true,
        });
      }
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

    runSearch(false);
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

  navigateShortcutRef.current = (direction) => {
    const wasOpen = isOpenRef.current;
    if (!wasOpen) {
      isOpenRef.current = true;
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPanelVisibility(true);
      setIsOpen(true);
      focusInput();
    }

    const signature = JSON.stringify([query, searchOptions]);
    if (lastSearchSignatureRef.current !== signature) {
      runSearch(false, direction);
      return;
    }
    navigateResult(direction);
  };

  searchTextRef.current = (text) => {
    setQuery(text);
    runSearch(false, undefined, text);
    focusInput();
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
  const hasActiveSearchOptions = Object.values(searchOptions).some(Boolean);
  const activeIndex = results.findIndex((result) => result.id === activeId);
  const currentResult = activeIndex >= 0 ? activeIndex + 1 : 0;
  const totalResults = String(results.length);
  const navigationDisabled = results.length === 0;
  const activeOptionId = activeId ? `findinpage-result-${activeId}` : undefined;
  const searchStatus = searchError
    ? ''
    : !hasQuery
    ? t('enterSearch')
    : results.length === 0
      ? t('noMatches')
      : [
          isSearching ? t('searching') : '',
          t(results.length === 1 ? 'matchOne' : 'matchMany', { count: results.length }) + '.',
          t('selectedResult', { current: currentResult }),
          highlightMode === 'native' ? '' : t('compatibilityHighlighting'),
        ].filter(Boolean).join(' ');

  const handleSearchInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (lastSearchSignatureRef.current !== JSON.stringify([query, searchOptions])) {
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

  const updateSearchOption = (name: keyof SearchOptions, checked: boolean) => {
    const nextOptions = { ...searchOptions, [name]: checked };
    setSearchOptions(nextOptions);
    void searchOptionsStore?.save(nextOptions);
  };

  return (
    <section
      ref={panelRef}
      className="findinpage-panel"
      role="search"
      lang={locale}
      dir="ltr"
      aria-label={t('panelLabel')}
      aria-hidden={!isOpen}
      data-open={isOpen}
      inert={isOpen ? undefined : true}
    >
      <div className="findinpage-toolbar">
        <div className="findinpage-input-wrapper">
          <Input
            ref={inputRef}
            type="search"
            variant="bare"
            role="combobox"
            aria-label={t('searchLabel')}
            aria-autocomplete="none"
            aria-controls="findinpage-results"
            aria-expanded={results.length > 0}
            aria-activedescendant={activeOptionId}
            aria-keyshortcuts="Enter ArrowUp ArrowDown"
            aria-invalid={searchError ? true : undefined}
            aria-describedby={searchError ? 'findinpage-search-error' : undefined}
            placeholder={t('searchPlaceholder')}
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
          <Popover open={optionsOpen} onOpenChange={handleOptionsOpenChange}>
            <PopoverTrigger
              className={cn(
                'findinpage-options-trigger',
                hasActiveSearchOptions && 'findinpage-options-trigger--active',
              )}
              aria-label={t('searchOptions')}
              title={t('searchOptions')}
            >
              <span aria-hidden="true">Aa</span>
            </PopoverTrigger>
            <PopoverContent
              container={panelRef}
              align="end"
              side="bottom"
              sideOffset={8}
              aria-label={t('searchOptions')}
            >
              <PopoverTitle className="sr-only">{t('searchOptions')}</PopoverTitle>
              <div className="findinpage-options-list">
                {([
                  ['caseSensitive', t('matchCase'), <CaseSensitive data-icon="inline-start" aria-hidden="true" />],
                  ['wholeWord', t('matchWholeWord'), <WholeWord data-icon="inline-start" aria-hidden="true" />],
                  [
                    'useRegularExpression',
                    t('useRegularExpression'),
                    <Asterisk data-icon="inline-start" aria-hidden="true" />,
                  ],
                ] as const).map(([name, label, icon]) => (
                  <Toggle
                    key={name}
                    className="findinpage-options-toggle"
                    aria-label={label}
                    pressed={searchOptions[name]}
                    onPressedChange={(pressed) => updateSearchOption(name, pressed)}
                  >
                    {icon}
                    <span>{label}</span>
                    <span className="findinpage-options-selection" aria-hidden="true">
                      <Check />
                    </span>
                  </Toggle>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {searchStatus}
        </span>
        <span className="findinpage-divider" aria-hidden="true" />
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          aria-label={t('previousResult')}
          title={t('previousResult')}
          disabled={navigationDisabled}
          onClick={() => navigateResult(-1)}
        >
          <ChevronUp data-icon="inline-start" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          aria-label={t('nextResult')}
          title={t('nextResult')}
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
          aria-label={t('closeFind')}
          title={t('close')}
        >
          <X data-icon="inline-start" aria-hidden="true" />
        </Button>
      </div>

      {searchError && (
        <p id="findinpage-search-error" className="findinpage-search-error" role="alert">
          {searchError.code === 'invalid_regular_expression' ? t('invalidRegularExpression') : searchError.message}
        </p>
      )}

      <div
        id="findinpage-results"
        ref={resultsRef}
        className="findinpage-results"
        role={results.length > 0 ? 'listbox' : undefined}
        aria-label={t('resultsLabel')}
      >
        {!hasQuery && (
          <div className="findinpage-empty">
            <div className="findinpage-empty-icon" aria-hidden="true">
              <Search />
            </div>
            <p className="findinpage-empty-copy">
              {t('emptyHint')}
            </p>
          </div>
        )}

        {hasQuery && !searchError && results.length === 0 && (
          <div className="findinpage-empty findinpage-empty--compact">
            <p className="findinpage-empty-copy">
              {isSearching ? t('searchingPage') : t('noMatches')}
            </p>
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
                    focusInputWithoutSelection();
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

      {(isSearching || highlightMode !== 'native') && (
        <p className="findinpage-search-note" role="status">
          {isSearching
            ? t(results.length === 1 ? 'matchesFoundOne' : 'matchesFoundMany', { count: results.length })
            : t('compatibilityHighlighting')}
        </p>
      )}

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
