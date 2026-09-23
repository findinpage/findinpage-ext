import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
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

  useEffect(() => {
    if (!isOpen) return;
    if (lastSearchedQueryRef.current === query) return;

    const timeout = window.setTimeout(() => {
      const response = searchRef.current.search(query);
      lastSearchedQueryRef.current = query;
      setResults(response.results);
      setTruncated(response.truncated);
      const firstResult = response.results[0];
      setActiveId(
        firstResult && searchRef.current.select(firstResult.id, { scroll: false })
          ? firstResult.id
          : undefined,
      );
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [isOpen, query]);

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
      className="pointer-events-auto fixed top-3 right-3 flex max-h-[min(68vh,600px)] w-[min(396px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
      aria-label="PageSift page search"
      onKeyDown={handlePanelKeyDown}
    >
      <div className="flex min-h-15 items-center gap-2 border-b border-border bg-card px-4 focus-within:ring-1 focus-within:ring-ring">
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
          className="min-w-10 shrink-0 text-center text-xs text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {currentResult}/{totalResults}
        </span>
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          aria-label="Previous result"
          title="Previous result"
          disabled={previousDisabled}
          onClick={() => navigateResult(-1)}
        >
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            strokeWidth={2.2}
            data-icon="inline-start"
            aria-hidden="true"
          />
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
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2.2}
            data-icon="inline-start"
            aria-hidden="true"
          />
        </Button>
        <Button
          variant="ghost"
          size="panelIcon"
          type="button"
          onClick={close}
          aria-label="Close PageSift"
          title="Close"
        >
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2.2}
            data-icon="inline-start"
            aria-hidden="true"
          />
        </Button>
      </div>

      <div
        ref={resultsRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        role="list"
        aria-label="Search results"
      >
        {!hasQuery && (
          <div className="grid min-h-36 place-items-center content-center gap-2.5 px-8 py-6 text-center text-xs text-muted-foreground">
            <div className="grid size-8 place-items-center rounded-4xl bg-muted" aria-hidden="true">
              <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.8} />
            </div>
            <p className="m-0 max-w-56 leading-5">
              Matches will appear here with their surrounding context.
            </p>
          </div>
        )}

        {hasQuery && results.length === 0 && (
          <div className="grid min-h-24 place-items-center px-8 py-5 text-center text-xs text-muted-foreground">
            <p className="m-0 max-w-56 leading-5">No matches on this page.</p>
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
            className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-2 text-left text-[13px] font-normal whitespace-normal"
            aria-current={activeId === result.id ? 'true' : undefined}
            onClick={() => selectResult(result)}
          >
            <span
              className="mt-px inline-flex h-5 min-w-5 items-center justify-center justify-self-center rounded-4xl bg-muted px-1 text-[10px] font-medium text-muted-foreground tabular-nums"
            >
              {result.order}
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere] leading-[1.45]">
              {result.before}
              <mark
                className={cn(
                  'bg-match px-0.5 font-medium text-match-foreground',
                  activeId === result.id &&
                    'bg-match-active underline decoration-match-decoration decoration-2',
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
