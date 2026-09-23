import { useCallback, useEffect, useRef, useState } from 'react';
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

function SearchIcon() {
  return <span aria-hidden="true" className="search-glyph" />;
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

  useEffect(() => installPageHighlightStyles(), []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const close = useCallback(() => {
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
  }, [close, focusInput, isOpen, onReady]);

  useEffect(() => {
    if (!isOpen) return;
    focusInput();
  }, [focusInput, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timeout = window.setTimeout(() => {
      const response = searchRef.current.search(query);
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
      className="pagesift-panel"
      aria-label="PageSift page search"
      onKeyDown={handlePanelKeyDown}
    >
      <div className="search-field">
        <input
          ref={inputRef}
          type="search"
          aria-label="Search this page"
          placeholder="Find on this page"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="result-counter" aria-live="polite">
          {currentResult}/{totalResults}
        </span>
        <span className="field-divider" aria-hidden="true" />
        <button
          className="navigation-button"
          type="button"
          aria-label="Previous result"
          title="Previous result"
          disabled={previousDisabled}
          onClick={() => navigateResult(-1)}
        >
          <span className="chevron chevron-up" aria-hidden="true" />
        </button>
        <button
          className="navigation-button"
          type="button"
          aria-label="Next result"
          title="Next result"
          disabled={nextDisabled}
          onClick={() => navigateResult(1)}
        >
          <span className="chevron chevron-down" aria-hidden="true" />
        </button>
        <button
          className="close-button"
          type="button"
          onClick={close}
          aria-label="Close PageSift"
          title="Close"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div ref={resultsRef} className="results" role="list" aria-label="Search results">
        {!hasQuery && (
          <div className="empty-state">
            <div className="empty-symbol" aria-hidden="true">
              <SearchIcon />
            </div>
            <p>Matches will appear here with their surrounding context.</p>
          </div>
        )}

        {hasQuery && results.length === 0 && (
          <div className="empty-state compact">
            <p>No matches on this page.</p>
          </div>
        )}

        {results.map((result) => (
          <button
            key={result.id}
            type="button"
            role="listitem"
            data-result-id={result.id}
            className={`result-row${activeId === result.id ? ' active' : ''}`}
            aria-current={activeId === result.id ? 'true' : undefined}
            onClick={() => selectResult(result)}
          >
            <span className="result-number">{result.order}</span>
            <span className="result-excerpt">
              {result.before}
              <mark>{result.match}</mark>
              {result.after}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
