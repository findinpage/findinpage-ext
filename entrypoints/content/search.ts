export const ACTIVE_HIGHLIGHT_NAME = 'findinpage-active-match';
export const ALL_HIGHLIGHTS_NAME = 'findinpage-all-matches';

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
  signature: string;
  sourceText: string;
}

interface SelectionAnchor {
  startContainer: Node;
  startOffset: number;
  scrollTarget: Element;
  signature: string;
  sourceText: string;
}

export interface SearchResponse {
  results: SearchResultView[];
  durationMs: number;
}

type HighlightRegistry = {
  delete(name: string): void;
  get(name: string): Highlight | undefined;
  set(name: string, highlight: Highlight): void;
};

function getHighlightRegistry(): HighlightRegistry | undefined {
  return (CSS as typeof CSS & { highlights?: HighlightRegistry }).highlights;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function createResultSignature(view: Pick<SearchResultView, 'before' | 'match' | 'after'>): string {
  return `${view.before}\u0000${view.match}\u0000${view.after}`;
}

function isRangeInViewport(range: Range): boolean {
  const rect = range.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left >= viewportLeft &&
    rect.right <= viewportRight &&
    rect.top >= viewportTop &&
    rect.bottom <= viewportBottom
  );
}

function isVisibleTextNode(node: Text, visibilityCache: Map<Element, boolean>): boolean {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue || parent.closest(EXCLUDED_SELECTOR)) {
    return false;
  }

  const cached = visibilityCache.get(parent);
  if (cached === false) return false;
  if (cached === undefined) {
    const style = getComputedStyle(parent);
    const visible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      parent.getClientRects().length > 0;
    visibilityCache.set(parent, visible);
    if (!visible) return false;
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  return [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
}

function* walkComposedTextNodes(
  node: Node,
  visited = new Set<Node>(),
): Generator<Text> {
  if (visited.has(node)) return;
  visited.add(node);

  if (node instanceof Text) {
    yield node;
    return;
  }

  if (node instanceof HTMLSlotElement) {
    const assignedNodes = node.assignedNodes({ flatten: true });
    if (assignedNodes.length > 0) {
      for (const assignedNode of assignedNodes) {
        yield* walkComposedTextNodes(assignedNode, visited);
      }
      return;
    }
  }

  if (node instanceof Element && node.hasAttribute('data-findinpage-host')) return;

  if (node instanceof Element && node.shadowRoot) {
    yield* walkComposedTextNodes(node.shadowRoot, visited);
    return;
  }

  for (const child of node.childNodes) {
    yield* walkComposedTextNodes(child, visited);
  }
}

export function getOpenShadowRoots(root: ParentNode = document.body): ShadowRoot[] {
  const shadowRoots: ShadowRoot[] = [];
  const visit = (parent: ParentNode) => {
    for (const element of parent.querySelectorAll('*')) {
      if (element.hasAttribute('data-findinpage-host')) continue;
      if (!element.shadowRoot) continue;
      shadowRoots.push(element.shadowRoot);
      visit(element.shadowRoot);
    }
  };
  visit(root);
  return shadowRoots;
}

function createExcerpt(
  node: Text,
  matchStart: number,
  matchLength: number,
): Pick<SearchResultView, 'before' | 'match' | 'after'> {
  const nodeText = node.nodeValue ?? '';
  const container = node.parentElement?.closest(SEMANTIC_CONTAINER_SELECTOR);
  const containerText = container?.textContent ?? nodeText;
  let nodePosition = 0;
  if (container) {
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(container);
    prefixRange.setEnd(node, 0);
    nodePosition = prefixRange.toString().length;
  }
  const contextMatchStart = nodePosition + matchStart;
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

    const normalizedQuery = query.toLocaleLowerCase();
    if (!normalizedQuery) {
      return { results: [], durationMs: performance.now() - startedAt };
    }

    const results: SearchResultView[] = [];
    const visibilityCache = new Map<Element, boolean>();
    for (const textNode of walkComposedTextNodes(document.body)) {
      if (!isVisibleTextNode(textNode, visibilityCache)) continue;
      const sourceText = textNode.nodeValue ?? '';
      const searchableText = sourceText.toLocaleLowerCase();
      let offset = 0;

      while ((offset = searchableText.indexOf(normalizedQuery, offset)) !== -1) {
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + normalizedQuery.length);

        const id = `${this.runId}-${results.length}`;
        const scrollTarget =
          textNode.parentElement?.closest(SEMANTIC_CONTAINER_SELECTOR) ??
          textNode.parentElement;

        if (scrollTarget) {
          const view = createExcerpt(textNode, offset, normalizedQuery.length);
          this.locations.set(id, {
            range,
            scrollTarget,
            signature: createResultSignature(view),
            sourceText,
          });
          results.push({
            id,
            ...view,
            order: results.length + 1,
          });
        }

        offset += Math.max(normalizedQuery.length, 1);
      }
    }

    const response = {
      results,
      durationMs: performance.now() - startedAt,
    };
    this.renderAllHighlights();
    return response;
  }

  captureSelection(id: string): SelectionAnchor | undefined {
    const location = this.locations.get(id);
    if (!location) return undefined;

    return {
      startContainer: location.range.startContainer,
      startOffset: location.range.startOffset,
      scrollTarget: location.scrollTarget,
      signature: location.signature,
      sourceText: location.sourceText,
    };
  }

  resolveSelection(anchor: SelectionAnchor): string | undefined {
    const entries = [...this.locations.entries()];
    const exactMatch = entries.find(([, location]) =>
      location.range.startContainer === anchor.startContainer &&
      location.range.startOffset === anchor.startOffset &&
      location.sourceText === anchor.sourceText
    );
    if (exactMatch) return exactMatch[0];

    const sameTarget = entries.find(([, location]) =>
      location.scrollTarget === anchor.scrollTarget &&
      location.signature === anchor.signature
    );
    if (sameTarget) return sameTarget[0];

    return entries.find(([, location]) => location.signature === anchor.signature)?.[0];
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

    if (options.scroll !== false && !isRangeInViewport(location.range)) {
      location.scrollTarget.scrollIntoView({
        behavior: 'auto',
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
    registry?.get(ACTIVE_HIGHLIGHT_NAME)?.clear();
    registry?.get(ALL_HIGHLIGHTS_NAME)?.clear();
    registry?.delete(ACTIVE_HIGHLIGHT_NAME);
    registry?.delete(ALL_HIGHLIGHTS_NAME);
  }
}

export function installPageHighlightStyles(): () => void {
  const style = document.createElement('style');
  style.dataset.findinpageHighlight = 'true';
  style.textContent = `
    ::highlight(${ALL_HIGHLIGHTS_NAME}) {
      background-color: #ffff05;
      color: #000000;
    }

    ::highlight(${ACTIVE_HIGHLIGHT_NAME}) {
      background-color: #ff9632;
      color: #000000;
      text-decoration: underline;
      text-decoration-color: #9a6700;
      text-decoration-thickness: 2px;
    }
  `;
  (document.head ?? document.documentElement).append(style);
  return () => style.remove();
}
