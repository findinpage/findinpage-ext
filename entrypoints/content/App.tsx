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
  getSearchableShadowRoots,
  PageSearch,
  type HighlightMode,
  type SearchError,
  type SearchOptions,
  type SearchResultView,
} from './search';
import type { SearchOptionsStore } from './search-options';
import type { SearchResultAnchor } from '@/lib/search-session';

function toResultAnchor(result: SearchResultView): SearchResultAnchor {
  return { before: result.before, match: result.match, after: result.after };
}

function findAnchoredResult(
  results: SearchResultView[],
  anchor: SearchResultAnchor,
  fallbackIndex?: number | null,
): SearchResultView | undefined {
  const matches = results.filter((result) =>
    result.before === anchor.before &&
    result.match === anchor.match &&
    result.after === anchor.after);
  if (matches.length === 0) return undefined;
  if (fallbackIndex === null || fallbackIndex === undefined) return matches[0];
  return matches.reduce((nearest, result) =>
    Math.abs(results.indexOf(result) - fallbackIndex) < Math.abs(results.indexOf(nearest) - fallbackIndex)
      ? result
      : nearest);
}

export interface FindInPageHandle {
  openAndFocus(query?: string, options?: Partial<SearchOptions>): void;
  restoreSession(
    query: string,
    options: SearchOptions,
    activeResultIndex?: number | null,
    open?: boolean,
    activeResultAnchor?: SearchResultAnchor,
  ): void;
  runPendingSearch(): void;
  navigate(direction: -1 | 1): void;
  search(selection: SearchSelectionRequest): void;
  toggle(): void;
  close(): void;
  focus(): void;
  handleFindShortcut(): 'open' | 'focus' | 'close';
  isSearchInputFocused(): boolean;
  isOpen(): boolean;
  getDebugState(): Record<string, unknown>;
  closeTransient(): boolean;
  destroy(): void;
}

export interface SearchSelectionRequest {
  text: string;
  range: Range;
}

interface AppProps {
  onReady(handle: FindInPageHandle): void;
  initialQuery?: string;
  initialSearchOptions?: SearchOptions;
  onOpenChange?(isOpen: boolean): void;
  onQueryChange?(query: string, options: SearchOptions): void;
  onSearchOptionsChange?(options: SearchOptions): void;
  onSearchExecuted?(query: string, options: SearchOptions): void;
  onActiveResultChange?(index: number | undefined, anchor?: SearchResultAnchor): void;
  onDebugEvent?(event: string, details?: Record<string, unknown>): void;
  installAction?: {
    label: string;
    onClick(): void;
  };
  searchOptionsStore?: SearchOptionsStore;
  keepHighlightsOnClose?: boolean;
  locale?: SupportedLocale;
}

export function App({
  onReady,
  initialQuery = '',
  initialSearchOptions,
  onOpenChange,
  onQueryChange,
  onSearchOptionsChange,
  onSearchExecuted,
  onActiveResultChange,
  onDebugEvent,
  installAction,
  searchOptionsStore,
  keepHighlightsOnClose = false,
  locale = getBrowserLocale(),
}: AppProps) {
  const t = useCallback(
    (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(
    initialSearchOptions ?? DEFAULT_SEARCH_OPTIONS,
  );
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
  const highlightFrameRef = useRef<number | undefined>(undefined);
  const searchTaskIdRef = useRef<number | undefined>(undefined);
  const pendingSearchRef = useRef(false);
  const searchCompleteRef = useRef(true);
  const pageRefreshRunningRef = useRef(false);
  const pageRefreshPendingRef = useRef(false);
  const pageRefreshRequestRef = useRef<() => void>(() => {});
  const pageRefreshFinishedRef = useRef<() => void>(() => {});
  const pendingNavigationRef = useRef<-1 | 1 | undefined>(undefined);
  const skipNextOpenFocusRef = useRef(false);
  const pendingActiveResultIndexRef = useRef<number | null | undefined>(undefined);
  const pendingActiveResultAnchorRef = useRef<SearchResultAnchor | undefined>(undefined);
  const restorationAnchorRef = useRef<SearchResultAnchor | undefined>(undefined);
  const resultsStateRef = useRef<SearchResultView[]>([]);
  const activeIdRef = useRef<string | undefined>(undefined);
  const queryRef = useRef(query);
  const searchOptionsRef = useRef(searchOptions);
  const restoreSessionRef = useRef<(
    query: string,
    options: SearchOptions,
    activeResultIndex?: number | null,
    open?: boolean,
    activeResultAnchor?: SearchResultAnchor,
  ) => void>(() => {});
  const runPendingSearchRef = useRef<() => void>(() => {});
  const navigateShortcutRef = useRef<(direction: -1 | 1) => void>(() => {});
  const searchSelectionRef = useRef<(selection: SearchSelectionRequest) => void>(() => {});
  const resultVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => resultsRef.current,
    estimateSize: () => 60,
    overscan: 6,
  });
  queryRef.current = query;
  searchOptionsRef.current = searchOptions;
  resultsStateRef.current = results;
  activeIdRef.current = activeId;

  const debug = useCallback((event: string, details?: Record<string, unknown>) => {
    onDebugEvent?.(event, details);
  }, [onDebugEvent]);

  useEffect(() => installPageHighlightStyles(), []);

  useEffect(() => {
    if (!searchOptionsStore || initialSearchOptions) return;
    let active = true;
    void searchOptionsStore.load().then((options) => {
      if (active) setSearchOptions(options);
    });
    return () => {
      active = false;
    };
  }, [initialSearchOptions, searchOptionsStore]);

  const setOptionsVisibility = useCallback((open: boolean) => {
    optionsOpenRef.current = open;
    setOptionsOpen(open);
  }, []);

  const focusInputWithoutSelection = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  const handleOptionsOpenChange = useCallback((open: boolean) => {
    debug('ui.options.visibility-changed', { open });
    setOptionsVisibility(open);
    if (!open && isOpenRef.current) focusInputWithoutSelection();
  }, [debug, focusInputWithoutSelection, setOptionsVisibility]);

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
    debug('focus.requested', {
      activeElement: document.activeElement?.nodeName,
      inputFocused: document.activeElement === inputRef.current,
    });
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
  }, [debug]);

  const close = useCallback(() => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    optionsOpenRef.current = false;
    setOptionsOpen(false);
    // WebKit repaints mutated highlights more reliably while their host UI is visible.
    searchRef.current.cancelSearch();
    searchTaskIdRef.current = undefined;
    setIsSearching(false);
    if (!keepHighlightsOnClose) searchRef.current.hideHighlights();
    setPanelVisibility(false);
    setIsOpen(false);
    onOpenChange?.(false);
    restoreFocusRef.current?.focus({ preventScroll: true });
    restoreFocusRef.current = null;
    deferHighlightUpdate(() => {
      if (!isOpenRef.current && !keepHighlightsOnClose) searchRef.current.hideHighlights();
    });
  }, [deferHighlightUpdate, keepHighlightsOnClose, onOpenChange, setPanelVisibility]);

  useEffect(() => {
    if (isOpenRef.current) return;
    if (keepHighlightsOnClose) searchRef.current.restoreHighlights(activeId);
    else searchRef.current.hideHighlights();
  }, [activeId, keepHighlightsOnClose]);

  useEffect(() => {
    const open = (
      queryOverride?: string | boolean,
      optionsOverride?: Partial<SearchOptions>,
      reportOpen = true,
    ) => {
      const restoreHighlights = typeof queryOverride === 'boolean' ? queryOverride : true;
      if (typeof queryOverride === 'string') {
        setQuery(queryOverride);
        lastSearchSignatureRef.current = undefined;
      }
      if (optionsOverride) {
        setSearchOptions({ ...DEFAULT_SEARCH_OPTIONS, ...optionsOverride });
        lastSearchSignatureRef.current = undefined;
      }
      if (!isOpenRef.current) {
        isOpenRef.current = true;
        restoreFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setPanelVisibility(true);
        setIsOpen(true);
        if (reportOpen) onOpenChange?.(true);
        if (restoreHighlights) {
          deferHighlightUpdate(() => {
            if (isOpenRef.current) searchRef.current.restoreHighlights(activeId);
          });
        }
      }
      focusInput();
    };

    const handle: FindInPageHandle = {
      openAndFocus: (queryOverride, optionsOverride) => open(queryOverride, optionsOverride),
      restoreSession(query, options, activeResultIndex, open, activeResultAnchor) {
        restoreSessionRef.current(query, options, activeResultIndex, open, activeResultAnchor);
      },
      runPendingSearch() {
        runPendingSearchRef.current();
      },
      navigate(direction) {
        navigateShortcutRef.current(direction);
      },
      search(selection) {
        searchSelectionRef.current(selection);
      },
      toggle() {
        if (isOpenRef.current) close();
        else open();
      },
      close,
      focus: focusInput,
      handleFindShortcut() {
        const input = inputRef.current;
        const root = input?.getRootNode();
        const inputFocused = Boolean(
          input && root && 'activeElement' in root && root.activeElement === input,
        );
        if (!isOpenRef.current) {
          debug('shortcut.find.decision', { action: 'open', open: false, inputFocused });
          open();
          return 'open';
        }
        if (!inputFocused) {
          debug('shortcut.find.decision', { action: 'focus', open: true, inputFocused });
          focusInput();
          return 'focus';
        }
        debug('shortcut.find.decision', { action: 'close', open: true, inputFocused });
        close();
        return 'close';
      },
      isSearchInputFocused() {
        const input = inputRef.current;
        if (!input) return false;
        const root = input.getRootNode();
        return 'activeElement' in root && root.activeElement === input;
      },
      isOpen: () => isOpenRef.current,
      getDebugState() {
        const panel = panelRef.current;
        if (!panel) return { open: isOpenRef.current, panel: 'missing' };
        const style = getComputedStyle(panel);
        const rect = panel.getBoundingClientRect();
        return {
          open: isOpenRef.current,
          connected: panel.isConnected,
          dataOpen: panel.dataset.open,
          ariaHidden: panel.getAttribute('aria-hidden'),
          inert: panel.inert,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          pointerEvents: style.pointerEvents,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
        };
      },
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
  }, [activeId, close, debug, deferHighlightUpdate, focusInput, focusInputWithoutSelection, onOpenChange, onReady, setOptionsVisibility, setPanelVisibility]);

  useEffect(() => {
    if (!isOpen) return;
    if (skipNextOpenFocusRef.current) {
      skipNextOpenFocusRef.current = false;
      debug('focus.skipped', { source: 'session-restore' });
      return;
    }
    focusInput();
  }, [debug, focusInput, isOpen]);

  const runSearch = useCallback(
    (
      preservePosition: boolean,
      navigateOnComplete?: -1 | 1,
      nextQuery = query,
      nextSearchOptions = searchOptions,
      selectedRange?: Range,
      scrollToInitialResult = true,
      initialResultIndex?: number | null,
      source = 'unknown',
      initialResultAnchor?: SearchResultAnchor,
    ) => {
      const isBackgroundRefresh = source === 'page-mutation';
      const resultAnchor = initialResultAnchor ?? (preservePosition
        ? restorationAnchorRef.current
        : undefined);
      const selectionAnchor =
        preservePosition && activeIdRef.current
          ? searchRef.current.captureSelection(activeIdRef.current)
          : undefined;
      if (preservePosition) {
        pendingResultsScrollTopRef.current = resultsRef.current?.scrollTop ?? 0;
      }
      const rangeSelectionAnchor = selectedRange
        ? searchRef.current.captureRangeSelection(selectedRange)
        : undefined;

      lastSearchSignatureRef.current = JSON.stringify([nextQuery, nextSearchOptions]);
      if (source !== 'page-mutation') {
        pageRefreshRunningRef.current = false;
        pageRefreshPendingRef.current = false;
      }
      pendingSearchRef.current = false;
      if (!isBackgroundRefresh) searchCompleteRef.current = nextQuery.length === 0;
      debug('search.started', {
        source,
        query: nextQuery,
        options: nextSearchOptions,
        preservePosition,
        navigateOnComplete,
        initialResultIndex,
        initialResultAnchor: resultAnchor,
        activeId: activeIdRef.current,
      });
      onSearchExecuted?.(nextQuery, nextSearchOptions);
      if (!isBackgroundRefresh) setIsSearching(nextQuery.length > 0);
      let selectedInitialResult = false;
      let selectedResultId: string | undefined;
      let taskId: number | undefined;
      const task = searchRef.current.search(nextQuery, nextSearchOptions, (response) => {
        if (taskId !== undefined && searchTaskIdRef.current !== taskId) return;
        setSearchError(response.error);
        setResults(response.results);
        resultsStateRef.current = response.results;
        setHighlightMode(response.highlightMode);
        if (!isBackgroundRefresh) {
          setIsSearching(!response.complete);
          searchCompleteRef.current = response.complete;
        }

        const resolvedId = selectionAnchor
          ? searchRef.current.resolveSelection(selectionAnchor)
          : undefined;
        const selectedRangeId = rangeSelectionAnchor && response.complete
          ? searchRef.current.resolveRangeSelection(rangeSelectionAnchor)
          : undefined;
        const nextResult = rangeSelectionAnchor
          ? response.complete
            ? response.results.find((result) => result.id === selectedRangeId) ?? response.results[0]
            : undefined
          : navigateOnComplete
          ? response.complete
            ? response.results[navigateOnComplete === 1 ? 0 : response.results.length - 1]
            : undefined
          : resultAnchor
            ? response.complete
              ? findAnchoredResult(response.results, resultAnchor, initialResultIndex)
              : undefined
          : initialResultIndex === null
            ? undefined
          : initialResultIndex !== undefined
            ? response.results[initialResultIndex] ??
              (response.complete && response.results.length > 0
                ? response.results[Math.min(initialResultIndex, response.results.length - 1)]
                : undefined)
          : preservePosition
            ? response.results.find((result) => result.id === resolvedId)
            : response.results[0];
        if (!selectedInitialResult && nextResult) {
          selectedInitialResult = true;
          selectedResultId = nextResult.id;
          const didSelect = searchRef.current.select(nextResult.id, {
            scroll: scrollToInitialResult && !preservePosition && !rangeSelectionAnchor,
          });
          const nextActiveId = didSelect ? nextResult.id : undefined;
          setActiveId(nextActiveId);
          activeIdRef.current = nextActiveId;
          debug('selection.initialized', {
            source,
            index: response.results.indexOf(nextResult),
            resultId: nextActiveId,
            requestedIndex: initialResultIndex,
            restoredByAnchor: Boolean(resultAnchor),
            scroll: scrollToInitialResult && !preservePosition && !rangeSelectionAnchor,
          });
          onActiveResultChange?.(response.results.indexOf(nextResult), toResultAnchor(nextResult));
          if (resultAnchor) restorationAnchorRef.current = undefined;
        } else if (response.complete && initialResultIndex === null) {
          setActiveId(undefined);
          activeIdRef.current = undefined;
          onActiveResultChange?.(undefined);
        } else if (response.complete && response.results.length === 0) {
          setActiveId(undefined);
          activeIdRef.current = undefined;
          onActiveResultChange?.(undefined);
        } else if (response.complete && selectedResultId) {
          searchRef.current.select(selectedResultId, { scroll: false });
        }
        debug('search.batch', {
          source,
          query: nextQuery,
          options: nextSearchOptions,
          complete: response.complete,
          resultCount: response.results.length,
          selectedIndex: response.results.findIndex((result) => result.id === activeIdRef.current),
          error: response.error?.code,
        });
        if (response.complete) {
          if (isBackgroundRefresh) {
            pageRefreshRunningRef.current = false;
            pageRefreshFinishedRef.current();
          }
          if (pageRefreshPendingRef.current) {
            pageRefreshPendingRef.current = false;
            debug('page-refresh.draining');
            queueMicrotask(() => pageRefreshRequestRef.current());
          }
        }
        if (response.complete && pendingNavigationRef.current !== undefined) {
          const direction = pendingNavigationRef.current;
          pendingNavigationRef.current = undefined;
          navigateShortcutRef.current(direction);
        }
      });
      taskId = task.id;
      searchTaskIdRef.current = task.id;
    },
    [activeId, debug, onActiveResultChange, onSearchExecuted, query, searchOptions],
  );

  restoreSessionRef.current = (
    restoredQuery,
    restoredOptions,
    activeResultIndex,
    open = true,
    activeResultAnchor,
  ) => {
    debug('session.restore.requested', {
      query: restoredQuery,
      options: restoredOptions,
      activeResultIndex,
      activeResultAnchor,
      open,
    });
    queryRef.current = restoredQuery;
    searchOptionsRef.current = restoredOptions;
    setQuery(restoredQuery);
    setSearchOptions(restoredOptions);
    setSearchError(undefined);
    setResults([]);
    setActiveId(undefined);
    lastSearchSignatureRef.current = JSON.stringify([restoredQuery, restoredOptions]);
    pendingSearchRef.current = open && restoredQuery.length > 0;
    pendingActiveResultIndexRef.current = activeResultIndex;
    pendingActiveResultAnchorRef.current = activeResultAnchor;
    restorationAnchorRef.current = activeResultAnchor;
    if (!open) return;
    if (!isOpenRef.current) {
      skipNextOpenFocusRef.current = true;
      isOpenRef.current = true;
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPanelVisibility(true);
      setIsOpen(true);
    }
  };

  runPendingSearchRef.current = () => {
    debug('session.restore.search-requested', {
      query: queryRef.current,
      options: searchOptionsRef.current,
      activeResultIndex: pendingActiveResultIndexRef.current,
      activeResultAnchor: pendingActiveResultAnchorRef.current,
    });
    runSearch(
      false,
      undefined,
      queryRef.current,
      searchOptionsRef.current,
      undefined,
      false,
      pendingActiveResultIndexRef.current,
      'session-restore',
      pendingActiveResultAnchorRef.current,
    );
    pendingActiveResultIndexRef.current = undefined;
    pendingActiveResultAnchorRef.current = undefined;
  };

  useEffect(() => {
    if (!isOpen) return;
    if (lastSearchSignatureRef.current === JSON.stringify([query, searchOptions])) return;

    const timeout = window.setTimeout(() => {
      runSearch(false, undefined, query, searchOptions, undefined, true, undefined, 'query-debounce');
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [isOpen, query, runSearch, searchOptions]);

  useEffect(() => {
    if (!isOpen || query.length === 0) return;

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
          if (pageRefreshRunningRef.current) {
            debug('page-refresh.mutation-ignored', { recordCount: records.length });
            return;
          }
          const isInsideExtensionUi = (node: Node) => {
            const element = node.nodeType === Node.ELEMENT_NODE
              ? node as Element
              : node.parentElement;
            return Boolean(element?.closest('[data-findinpage-host]'));
          };
          const isOwnNode = (node: Node) => {
            if (node.nodeType !== 1) return false;
            const element = node as Element;
            return isInsideExtensionUi(element) ||
              element.hasAttribute('data-findinpage-highlight') ||
              element.hasAttribute('data-findinpage-fallback') ||
              element.hasAttribute('data-findinpage-control-mirror');
          };
          if (records.every((record) => {
            if (isInsideExtensionUi(record.target)) return true;
            const changedNodes = [...record.addedNodes, ...record.removedNodes];
            return changedNodes.length > 0 && changedNodes.every(isOwnNode);
          })) return;
          const activeSelection = activeIdRef.current
            ? searchRef.current.captureSelection(activeIdRef.current)
            : undefined;
          if (activeSelection?.startContainer.isConnected) {
            debug('page-refresh.mutation-skipped', {
              reason: 'active-result-connected',
              recordCount: records.length,
            });
            return;
          }
          scheduleRefresh('mutation');
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
          ownerDocument.defaultView?.addEventListener('load', handleDocumentLoad);
          ownerDocument.addEventListener('input', handleControlValueChange, true);
          ownerDocument.addEventListener('change', handleControlValueChange, true);
        }
        if (ownerDocument.body) observeRoot(ownerDocument.body);
        for (const shadowRoot of getSearchableShadowRoots(ownerDocument.body)) {
          observeRoot(shadowRoot);
        }
      }
    };
    const scheduleRefresh = (trigger = 'unknown') => {
      observeAccessibleDocuments();
      debug(`page-refresh.requested.${trigger}`, {
        trigger,
        running: pageRefreshRunningRef.current,
        pending: pageRefreshPendingRef.current,
        foregroundSearchComplete: searchCompleteRef.current,
      });
      if (pageRefreshRunningRef.current || !searchCompleteRef.current) {
        pageRefreshPendingRef.current = true;
        debug('page-refresh.queued', {
          reason: pageRefreshRunningRef.current ? 'refresh-running' : 'foreground-search-running',
        });
        return;
      }
      pageRefreshRunningRef.current = true;
      for (const observer of observers.values()) observer.disconnect();
      runSearch(true, undefined, query, searchOptions, undefined, true, undefined, 'page-mutation');
    };
    pageRefreshRequestRef.current = scheduleRefresh;
    pageRefreshFinishedRef.current = () => {
      for (const root of observedRoots) {
        const ownerDocument = root.ownerDocument ?? document;
        const observer = observers.get(ownerDocument);
        if (!observer) continue;
        observer.takeRecords();
        try {
          observer.observe(root, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        } catch {
          // The frame may have navigated while the background refresh was running.
        }
      }
      debug('page-refresh.observers-restored', { rootCount: observedRoots.size });
    };
    function handleDocumentLoad() {
      scheduleRefresh('document-load');
    }
    const handleControlValueChange = (event: Event) => {
      if (event.composedPath().includes(panelRef.current as EventTarget)) return;
      const target = event.target;
      if (!target || typeof target !== 'object' || !('matches' in target)) return;
      if ((target as Element).matches('textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"]')) {
        scheduleRefresh('control-value');
      }
    };

    observeAccessibleDocuments();

    return () => {
      pageRefreshRequestRef.current = () => {};
      pageRefreshFinishedRef.current = () => {};
      pageRefreshRunningRef.current = false;
      pageRefreshPendingRef.current = false;
      for (const observer of observers.values()) observer.disconnect();
      for (const ownerDocument of observedDocuments) {
        ownerDocument.defaultView?.removeEventListener('load', handleDocumentLoad);
        ownerDocument.removeEventListener('input', handleControlValueChange, true);
        ownerDocument.removeEventListener('change', handleControlValueChange, true);
      }
    };
  }, [isOpen, query, runSearch]);

  const selectResult = (result: SearchResultView, scroll = true, source = 'unknown') => {
    restorationAnchorRef.current = undefined;
    if (searchRef.current.select(result.id, { scroll })) {
      setActiveId(result.id);
      activeIdRef.current = result.id;
      const index = resultsStateRef.current.findIndex((candidate) => candidate.id === result.id);
      debug('selection.changed', { source, index, resultId: result.id, scroll });
      onActiveResultChange?.(index, toResultAnchor(result));
      return;
    }

    debug('selection.stale', { source, resultId: result.id });
    runSearch(false, undefined, queryRef.current, searchOptionsRef.current, undefined, true, undefined, 'stale-selection');
  };

  const navigateResult = (direction: -1 | 1, source = 'unknown') => {
    const currentResults = resultsStateRef.current;
    debug('navigation.requested', {
      source,
      direction,
      resultCount: currentResults.length,
      activeId: activeIdRef.current,
      pendingSearch: pendingSearchRef.current,
      searchComplete: searchCompleteRef.current,
    });
    if (!searchCompleteRef.current) {
      pendingNavigationRef.current = direction;
      debug('navigation.queued', { source, direction });
      return;
    }
    if (currentResults.length === 0) return;

    const currentIndex = currentResults.findIndex((result) => result.id === activeIdRef.current);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : currentResults.length - 1
        : (currentIndex + direction + currentResults.length) % currentResults.length;
    selectResult(currentResults[nextIndex], true, source);
  };

  navigateShortcutRef.current = (direction) => {
    const wasOpen = isOpenRef.current;
    if (!wasOpen) {
      isOpenRef.current = true;
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPanelVisibility(true);
      setIsOpen(true);
      onOpenChange?.(true);
      focusInput();
    }

    const signature = JSON.stringify([queryRef.current, searchOptionsRef.current]);
    debug('navigation.shortcut.decision', {
      direction,
      pendingSearch: pendingSearchRef.current,
      signatureMatches: lastSearchSignatureRef.current === signature,
      searchComplete: searchCompleteRef.current,
      resultCount: resultsStateRef.current.length,
    });
    if (pendingSearchRef.current || lastSearchSignatureRef.current !== signature) {
      pendingNavigationRef.current = direction;
      runSearch(false, undefined, queryRef.current, searchOptionsRef.current, undefined, true, pendingActiveResultIndexRef.current, 'navigation-shortcut');
      return;
    }
    navigateResult(direction, 'navigation-shortcut');
  };

  searchSelectionRef.current = (selection) => {
    pendingSearchRef.current = false;
    debug('search.selection-requested', {
      query: selection.text,
      options: searchOptions,
    });
    setQuery(selection.text);
    onQueryChange?.(selection.text, searchOptions);
    runSearch(false, undefined, selection.text, searchOptions, selection.range, true, undefined, 'selection-shortcut');
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
      if (
        pendingSearchRef.current ||
        lastSearchSignatureRef.current !== JSON.stringify([query, searchOptions])
      ) {
        runSearch(false, undefined, query, searchOptions, undefined, true, undefined, 'input-enter');
      } else if (!navigationDisabled) {
        navigateResult(1, 'input-enter');
      }
    } else if (event.key === 'ArrowUp' && !navigationDisabled) {
      event.preventDefault();
      navigateResult(-1, 'input-arrow-up');
    } else if (event.key === 'ArrowDown' && !navigationDisabled) {
      event.preventDefault();
      navigateResult(1, 'input-arrow-down');
    }
  };

  const updateSearchOption = (name: keyof SearchOptions, checked: boolean) => {
    pendingSearchRef.current = false;
    const nextOptions = { ...searchOptions, [name]: checked };
    debug('search.options.changed', { name, checked, options: nextOptions });
    setSearchOptions(nextOptions);
    void searchOptionsStore?.save(nextOptions);
    onSearchOptionsChange?.(nextOptions);
  };

  const logUiEvent = (event: React.SyntheticEvent, eventName: string) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const keyboardEvent = event.nativeEvent instanceof KeyboardEvent
      ? event.nativeEvent
      : undefined;
    debug(`ui.event.${eventName}`, {
      tag: target?.tagName,
      role: target?.getAttribute('role'),
      ariaLabel: target?.getAttribute('aria-label'),
      inputType: target instanceof HTMLInputElement ? target.type : undefined,
      key: keyboardEvent?.key,
      metaKey: keyboardEvent?.metaKey,
      ctrlKey: keyboardEvent?.ctrlKey,
      altKey: keyboardEvent?.altKey,
      shiftKey: keyboardEvent?.shiftKey,
    });
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
      onPointerDownCapture={(event) => logUiEvent(event, 'pointerdown')}
      onClickCapture={(event) => logUiEvent(event, 'click')}
      onKeyDownCapture={(event) => logUiEvent(event, 'keydown')}
      onFocusCapture={(event) => logUiEvent(event, 'focus')}
      onBlurCapture={(event) => logUiEvent(event, 'blur')}
      onChangeCapture={(event) => logUiEvent(event, 'change')}
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
            onChange={(event) => {
              pendingSearchRef.current = false;
              debug('search.query.changed', {
                query: event.target.value,
                options: searchOptions,
              });
              setQuery(event.target.value);
              onQueryChange?.(event.target.value, searchOptions);
            }}
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
          onClick={() => navigateResult(-1, 'previous-button')}
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
          onClick={() => navigateResult(1, 'next-button')}
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
                    selectResult(result, true, 'result-click');
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
