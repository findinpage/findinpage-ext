export const MAX_RESULTS = 500;
export const ACTIVE_HIGHLIGHT_NAME = 'pagesift-active-match';
export const ALL_HIGHLIGHTS_NAME = 'pagesift-all-matches';

const EXCLUDED_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'input',
  'select',
  '[hidden]',
  '[aria-hidden="true"]',
].join(',');

const SEMANTIC_CONTAINER_SELECTOR = [
  'p',
  'li',
  'td',
  'th',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
].join(',');

export interface SearchResultView {
  id: string;
  before: string;
  match: string;
  after: string;
  order: number;
}

interface MatchLocation {
  range: Range;
  scrollTarget: Element;
}

export interface SearchResponse {
  results: SearchResultView[];
  truncated: boolean;
  durationMs: number;
}

type HighlightRegistry = {
  delete(name: string): void;
  set(name: string, highlight: Highlight): void;
};

function getHighlightRegistry(): HighlightRegistry | undefined {
  return (CSS as typeof CSS & { highlights?: HighlightRegistry }).highlights;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isVisibleTextNode(node: Text, visibilityCache: Map<Element, boolean>): boolean {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue?.trim() || parent.closest(EXCLUDED_SELECTOR)) {
    return false;
  }

  const cached = visibilityCache.get(parent);
  if (cached !== undefined) return cached;

  const style = getComputedStyle(parent);
  const visible =
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    parent.getClientRects().length > 0;

  visibilityCache.set(parent, visible);
  return visible;
}

function createExcerpt(
  node: Text,
  matchStart: number,
  matchLength: number,
): Pick<SearchResultView, 'before' | 'match' | 'after'> {
  const nodeText = node.nodeValue ?? '';
  const container = node.parentElement?.closest(SEMANTIC_CONTAINER_SELECTOR);
  const containerText = container instanceof HTMLElement ? container.innerText : nodeText;
  const nodePosition = containerText.indexOf(nodeText);
  const contextMatchStart = nodePosition >= 0 ? nodePosition + matchStart : matchStart;
  const contextMatchEnd = contextMatchStart + matchLength;

  const beforeStart = Math.max(0, contextMatchStart - 72);
  const afterEnd = Math.min(containerText.length, contextMatchEnd + 88);
  const before = normalizeWhitespace(containerText.slice(beforeStart, contextMatchStart));
  const match = containerText.slice(contextMatchStart, contextMatchEnd) || nodeText.slice(matchStart, matchStart + matchLength);
  const after = normalizeWhitespace(containerText.slice(contextMatchEnd, afterEnd));

  return {
    before: `${beforeStart > 0 ? '...' : ''}${before}`,
    match,
    after: `${after}${afterEnd < containerText.length ? '...' : ''}`,
  };
}

export class PageSearch {
  private locations = new Map<string, MatchLocation>();
  private runId = 0;

  search(query: string): SearchResponse {
    const startedAt = performance.now();
    this.clearHighlights();
    this.locations.clear();
    this.runId += 1;

    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return { results: [], truncated: false, durationMs: performance.now() - startedAt };
    }

    const results: SearchResultView[] = [];
    const visibilityCache = new Map<Element, boolean>();
    // This light-DOM walker cannot enter PageSift's Shadow Root UI.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (candidate) =>
        isVisibleTextNode(candidate as Text, visibilityCache)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });

    let currentNode: Node | null;
    let foundMoreThanLimit = false;

    while ((currentNode = walker.nextNode())) {
      const textNode = currentNode as Text;
      const sourceText = textNode.nodeValue ?? '';
      const searchableText = sourceText.toLocaleLowerCase();
      let offset = 0;

      while ((offset = searchableText.indexOf(normalizedQuery, offset)) !== -1) {
        if (results.length >= MAX_RESULTS) {
          foundMoreThanLimit = true;
          break;
        }

        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + normalizedQuery.length);

        const id = `${this.runId}-${results.length}`;
        const scrollTarget =
          textNode.parentElement?.closest(SEMANTIC_CONTAINER_SELECTOR) ??
          textNode.parentElement;

        if (scrollTarget) {
          const view = createExcerpt(textNode, offset, normalizedQuery.length);
          this.locations.set(id, { range, scrollTarget });
          results.push({
            id,
            ...view,
            order: results.length + 1,
          });
        }

        offset += Math.max(normalizedQuery.length, 1);
      }

      if (foundMoreThanLimit) break;
    }

    const response = {
      results,
      truncated: foundMoreThanLimit,
      durationMs: performance.now() - startedAt,
    };
    this.renderAllHighlights();
    return response;
  }

  select(id: string, options: { scroll?: boolean } = {}): boolean {
    const location = this.locations.get(id);
    if (
      !location ||
      !location.range.startContainer.isConnected ||
      !location.scrollTarget.isConnected
    ) {
      return false;
    }

    this.clearActiveHighlight();
    const registry = getHighlightRegistry();
    if (registry && typeof Highlight !== 'undefined') {
      registry.set(ACTIVE_HIGHLIGHT_NAME, new Highlight(location.range));
    }

    if (options.scroll !== false) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      location.scrollTarget.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
    return true;
  }

  clear(): void {
    this.clearHighlights();
    this.locations.clear();
  }

  hideHighlights(): void {
    this.clearHighlights();
  }

  restoreHighlights(activeId?: string): void {
    this.renderAllHighlights();
    if (activeId) this.select(activeId, { scroll: false });
  }

  private renderAllHighlights(): void {
    const registry = getHighlightRegistry();
    registry?.delete(ALL_HIGHLIGHTS_NAME);
    if (!registry || typeof Highlight === 'undefined') return;

    const ranges = [...this.locations.values()]
      .map(({ range }) => range)
      .filter((range) => range.startContainer.isConnected);
    if (ranges.length > 0) {
      registry.set(ALL_HIGHLIGHTS_NAME, new Highlight(...ranges));
    }
  }

  private clearActiveHighlight(): void {
    getHighlightRegistry()?.delete(ACTIVE_HIGHLIGHT_NAME);
  }

  private clearHighlights(): void {
    const registry = getHighlightRegistry();
    registry?.delete(ACTIVE_HIGHLIGHT_NAME);
    registry?.delete(ALL_HIGHLIGHTS_NAME);
  }
}

export function installPageHighlightStyles(): () => void {
  const style = document.createElement('style');
  style.dataset.pagesiftHighlight = 'true';
  style.textContent = `
    ::highlight(${ALL_HIGHLIGHTS_NAME}) {
      background-color: #ffff05;
      color: inherit;
    }

    ::highlight(${ACTIVE_HIGHLIGHT_NAME}) {
      background-color: #ff9632;
      color: #171717;
      text-decoration: underline;
      text-decoration-color: #9a6700;
      text-decoration-thickness: 2px;
    }
  `;
  (document.head ?? document.documentElement).append(style);
  return () => style.remove();
}
