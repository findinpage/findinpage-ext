import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  installPageHighlightStyles,
  MAX_RESULTS,
  PageSearch,
  type SearchResultView,
} from './search';

export interface PageSiftHandle {
  openAndFocus(): void;
  toggle(): void;
  destroy(): void;
}

interface AppProps {
  onReady(handle: PageSiftHandle): void;
}

export function App({ onReady }: AppProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultView[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(new PageSearch());
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const resultsScrollTopRef = useRef(0);
  const lastSearchedQueryRef = useRef<string | undefined>(undefined);
  const hasOpenedRef = useRef(false);
  const restoreScrollRef = useRef(false);
  const pendingResultsScrollTopRef = useRef<number | undefined>(undefined);

  useEffect(() => installPageHighlightStyles(), []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const close = useCallback(() => {
    resultsScrollTopRef.current = resultsRef.current?.scrollTop ?? resultsScrollTopRef.current;
    searchRef.current.hideHighlights();
    setIsOpen(false);
    restoreFocusRef.current?.focus({ preventScroll: true });
    restoreFocusRef.current = null;
  }, []);

  useEffect(() => {
    const open = () => {
      if (!isOpen) {
        restoreFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        restoreScrollRef.current = hasOpenedRef.current;
        hasOpenedRef.current = true;
        searchRef.current.restoreHighlights(activeId);
        setIsOpen(true);
      }
      focusInput();
    };

    const handle: PageSiftHandle = {
      openAndFocus: open,
      toggle() {
        if (isOpen) close();
        else open();
      },
      destroy() {
        searchRef.current.clear();
      },
    };
    onReady(handle);
  }, [activeId, close, focusInput, isOpen, onReady]);

  useEffect(() => {
    if (!isOpen) return;
    focusInput();
    if (restoreScrollRef.current) {
      restoreScrollRef.current = false;
      requestAnimationFrame(() => {
        resultsRef.current?.scrollTo({ top: resultsScrollTopRef.current });
      });
    }
  }, [focusInput, isOpen]);

  const runSearch = useCallback(
    (preservePosition: boolean) => {
      const previousIndex = results.findIndex((result) => result.id === activeId);
      if (preservePosition) {
        pendingResultsScrollTopRef.current = resultsRef.current?.scrollTop ?? 0;
      }

      const response = searchRef.current.search(query);
      lastSearchedQueryRef.current = query;
      setResults(response.results);
      setTruncated(response.truncated);

      const nextIndex = preservePosition && previousIndex >= 0 ? previousIndex : 0;
      const nextResult = response.results[Math.min(nextIndex, response.results.length - 1)];
      setActiveId(
        nextResult && searchRef.current.select(nextResult.id, { scroll: false })
          ? nextResult.id
          : undefined,
      );
    },
    [activeId, query, results],
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
    if (!isOpen || !query.trim()) return;

    let refreshTimeout: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => runSearch(true), 250);
    };

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.addEventListener('scroll', scheduleRefresh, { capture: true, passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scheduleRefresh, { capture: true });
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
    };
  }, [isOpen, query, runSearch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [close, isOpen]);

  const selectResult = (result: SearchResultView, scroll = true) => {
    if (searchRef.current.select(result.id, { scroll })) {
      setActiveId(result.id);
      return;
    }

    const refreshed = searchRef.current.search(query);
    setResults(refreshed.results);
    setTruncated(refreshed.truncated);
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
    const nextIndex = currentIndex === -1 ? (direction === 1 ? 0 : results.length - 1) : currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= results.length) return;
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
    const activeResult = resultsRef.current?.querySelector<HTMLElement>(
      `[data-result-id="${CSS.escape(activeId)}"]`,
    );
    activeResult?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;
  const activeIndex = results.findIndex((result) => result.id === activeId);
  const currentResult = activeIndex >= 0 ? activeIndex + 1 : 0;
  const totalResults = truncated ? `${MAX_RESULTS}+` : String(results.length);
  const previousDisabled = results.length === 0 || activeIndex <= 0;
  const nextDisabled = results.length === 0 || activeIndex >= results.length - 1;

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowUp' && !previousDisabled) {
      event.preventDefault();
      navigateResult(-1);
    } else if (event.key === 'ArrowDown' && !nextDisabled) {
      event.preventDefault();
      navigateResult(1);
    }
  };

  return (
    <section
      className="pagesift-panel"
      aria-label="PageSift page search"
      onKeyDown={handlePanelKeyDown}
    >
      <div className="pagesift-toolbar">
        <Input
          ref={inputRef}
          type="search"
          variant="bare"
          aria-label="Search this page"
          placeholder="Find on this page"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span
          className="pagesift-counter"
          aria-live="polite"
        >
          {currentResult}/{totalResults}
        </span>
        <span className="pagesift-divider" aria-hidden="true" />
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          aria-label="Previous result"
          title="Previous result"
          disabled={previousDisabled}
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
          disabled={nextDisabled}
          onClick={() => navigateResult(1)}
        >
          <ChevronDown data-icon="inline-start" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          onClick={close}
          aria-label="Close PageSift"
          title="Close"
        >
          <X data-icon="inline-start" aria-hidden="true" />
        </Button>
      </div>

      <div
        ref={resultsRef}
        className="pagesift-results"
        role="list"
        aria-label="Search results"
      >
        {!hasQuery && (
          <div className="pagesift-empty">
            <div className="pagesift-empty-icon" aria-hidden="true">
              <Search />
            </div>
            <p className="pagesift-empty-copy">
              Matches will appear here with their surrounding context.
            </p>
          </div>
        )}

        {hasQuery && results.length === 0 && (
          <div className="pagesift-empty pagesift-empty--compact">
            <p className="pagesift-empty-copy">No matches on this page.</p>
          </div>
        )}

        {results.map((result) => (
          <Button
            key={result.id}
            type="button"
            variant="result"
            size="result"
            role="listitem"
            data-result-id={result.id}
            aria-current={activeId === result.id ? 'true' : undefined}
            onClick={() => selectResult(result)}
          >
            <span className="pagesift-index">
              {result.order}
            </span>
            <span className="pagesift-result-copy">
              {result.before}
              <mark
                className={cn(
                  'pagesift-match',
                  activeId === result.id && 'pagesift-match--active',
                )}
              >
                {result.match}
              </mark>
              {result.after}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
