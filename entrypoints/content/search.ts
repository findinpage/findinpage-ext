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

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegularExpression: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegularExpression: false,
};

export interface SearchError {
  code: 'invalid_regular_expression';
  message: string;
}

interface MatchLocation {
  range?: Range;
  control?: HTMLTextAreaElement;
  matchStart: number;
  matchEnd: number;
  scrollTarget: Element;
  document: Document;
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
  error?: SearchError;
}

type HighlightRegistry = {
  delete(name: string): void;
  get(name: string): Highlight | undefined;
  set(name: string, highlight: Highlight): void;
};

function getHighlightRegistry(document: Document): HighlightRegistry | undefined {
  return (document.defaultView?.CSS as typeof CSS & { highlights?: HighlightRegistry } | undefined)
    ?.highlights;
}

type HighlightConstructor = new (...ranges: Range[]) => Highlight;

function getHighlightConstructor(document: Document): HighlightConstructor | undefined {
  return (document.defaultView as (Window & { Highlight?: HighlightConstructor }) | null)?.Highlight;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function createResultSignature(view: Pick<SearchResultView, 'before' | 'match' | 'after'>): string {
  return `${view.before}\u0000${view.match}\u0000${view.after}`;
}

const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPreviousCodePoint(value: string, offset: number): string | undefined {
  if (offset <= 0) return undefined;
  const trailingUnit = value.charCodeAt(offset - 1);
  const startsWithLowSurrogate = trailingUnit >= 0xdc00 && trailingUnit <= 0xdfff;
  if (startsWithLowSurrogate && offset > 1) {
    const leadingUnit = value.charCodeAt(offset - 2);
    if (leadingUnit >= 0xd800 && leadingUnit <= 0xdbff) {
      return value.slice(offset - 2, offset);
    }
  }
  return value[offset - 1];
}

function getNextCodePoint(value: string, offset: number): string | undefined {
  const codePoint = value.codePointAt(offset);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

function hasWholeWordBoundaries(value: string, start: number, end: number): boolean {
  const before = getPreviousCodePoint(value, start);
  const after = getNextCodePoint(value, end);
  return (!before || !WORD_CHARACTER_PATTERN.test(before)) &&
    (!after || !WORD_CHARACTER_PATTERN.test(after));
}

function isVisibleTextNode(node: Text, visibilityCache: Map<Element, boolean>): boolean {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue || parent.closest(EXCLUDED_SELECTOR)) {
    return false;
  }

  const cached = visibilityCache.get(parent);
  if (cached === false) return false;
  if (cached === undefined) {
    const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
    if (!style) return false;
    const visible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      parent.getClientRects().length > 0;
    visibilityCache.set(parent, visible);
    if (!visible) return false;
  }

  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  return (
    isDocumentFrameVisible(node.ownerDocument, visibilityCache) &&
    [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0)
  );
}

function isVisibleTextArea(
  control: HTMLTextAreaElement,
  visibilityCache: Map<Element, boolean>,
): boolean {
  const cached = visibilityCache.get(control);
  if (cached === false) return false;
  if (cached === undefined) {
    const style = control.ownerDocument.defaultView?.getComputedStyle(control);
    const visible = Boolean(
      style &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      control.getClientRects().length > 0
    );
    visibilityCache.set(control, visible);
    if (!visible) return false;
  }
  return isDocumentFrameVisible(control.ownerDocument, visibilityCache);
}

function isDocumentFrameVisible(
  ownerDocument: Document,
  visibilityCache: Map<Element, boolean>,
): boolean {
  let currentDocument: Document | null = ownerDocument;
  while (currentDocument && currentDocument !== document) {
    const frame: Element | null = currentDocument.defaultView?.frameElement ?? null;
    if (!frame) return false;
    const cached = visibilityCache.get(frame);
    if (cached === false) return false;
    if (cached === undefined) {
      const style = frame.ownerDocument.defaultView?.getComputedStyle(frame);
      const visible = Boolean(
        style &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.visibility !== 'collapse' &&
        frame.getClientRects().length > 0
      );
      visibilityCache.set(frame, visible);
      if (!visible) return false;
    }
    currentDocument = frame.ownerDocument;
  }
  return true;
}

type SearchSource = Text | HTMLTextAreaElement;

function* walkComposedSearchSources(
  node: Node,
  visited = new Set<Node>(),
): Generator<SearchSource> {
  if (visited.has(node)) return;
  visited.add(node);

  if (node.nodeType === Node.TEXT_NODE) {
    yield node as Text;
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'slot') {
    const assignedNodes = (node as HTMLSlotElement).assignedNodes({ flatten: true });
    if (assignedNodes.length > 0) {
      for (const assignedNode of assignedNodes) {
        yield* walkComposedSearchSources(assignedNode, visited);
      }
      return;
    }
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : undefined;
  if (element?.hasAttribute('data-findinpage-host')) return;

  if (element?.localName === 'textarea') {
    yield element as HTMLTextAreaElement;
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'iframe') {
    const iframe = node as HTMLIFrameElement;
    try {
      const frameDocument = iframe.contentDocument;
      if (frameDocument?.body) {
        yield* walkComposedSearchSources(frameDocument.body, visited);
      }
    } catch {
      // Cross-origin frame documents are intentionally unavailable to page scripts.
    }
    return;
  }

  if (element?.shadowRoot) {
    yield* walkComposedSearchSources(element.shadowRoot, visited);
    return;
  }

  for (const child of node.childNodes) {
    yield* walkComposedSearchSources(child, visited);
  }
}

export function getAccessibleDocuments(root: Document = document): Document[] {
  const documents: Document[] = [];
  const visited = new Set<Document>();
  const visitParent = (parent: ParentNode) => {
    for (const element of parent.querySelectorAll('*')) {
      if (element.shadowRoot) visitParent(element.shadowRoot);
      if (element.localName !== 'iframe') continue;
      try {
        const frameDocument = (element as HTMLIFrameElement).contentDocument;
        if (frameDocument) visit(frameDocument);
      } catch {
        // Ignore cross-origin frames.
      }
    }
  };
  const visit = (current: Document) => {
    if (visited.has(current)) return;
    visited.add(current);
    documents.push(current);
    visitParent(current);
  };
  visit(root);
  return documents;
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
    const prefixRange = node.ownerDocument.createRange();
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

function createValueExcerpt(
  value: string,
  matchStart: number,
  matchLength: number,
): Pick<SearchResultView, 'before' | 'match' | 'after'> {
  const matchEnd = matchStart + matchLength;
  const beforeStart = Math.max(0, matchStart - 72);
  const afterEnd = Math.min(value.length, matchEnd + 88);
  return {
    before: `${beforeStart > 0 ? '...' : ''}${normalizeWhitespace(value.slice(beforeStart, matchStart))}`,
    match: value.slice(matchStart, matchEnd),
    after: `${normalizeWhitespace(value.slice(matchEnd, afterEnd))}${afterEnd < value.length ? '...' : ''}`,
  };
}

export class PageSearch {
  private locations = new Map<string, MatchLocation>();
  private highlightedDocuments = new Set<Document>();
  private frameHighlightStyles = new Map<Document, HTMLStyleElement>();
  private runId = 0;

  search(query: string, options: SearchOptions = DEFAULT_SEARCH_OPTIONS): SearchResponse {
    const startedAt = performance.now();
    this.clearHighlights();
    this.locations.clear();
    this.runId += 1;

    if (!query) {
      return { results: [], durationMs: performance.now() - startedAt };
    }

    let matcher: RegExp;
    try {
      matcher = new RegExp(
        options.useRegularExpression ? query : escapeRegularExpression(query),
        `gu${options.caseSensitive ? '' : 'i'}`,
      );
    } catch {
      return {
        results: [],
        durationMs: performance.now() - startedAt,
        error: {
          code: 'invalid_regular_expression',
          message: 'Invalid regular expression.',
        },
      };
    }

    const results: SearchResultView[] = [];
    const visibilityCache = new Map<Element, boolean>();
    for (const source of walkComposedSearchSources(document.body)) {
      const isTextArea = source.nodeType === Node.ELEMENT_NODE;
      if (isTextArea) {
        if (!isVisibleTextArea(source as HTMLTextAreaElement, visibilityCache)) continue;
      } else if (!isVisibleTextNode(source as Text, visibilityCache)) {
        continue;
      }
      const sourceText = isTextArea
        ? (source as HTMLTextAreaElement).value
        : (source as Text).nodeValue ?? '';
      matcher.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = matcher.exec(sourceText)) !== null) {
        const offset = match.index;
        const matchLength = match[0].length;
        if (matchLength === 0) {
          const nextCodePoint = sourceText.codePointAt(matcher.lastIndex);
          matcher.lastIndex += nextCodePoint !== undefined && nextCodePoint > 0xffff ? 2 : 1;
          continue;
        }
        if (
          options.wholeWord &&
          !hasWholeWordBoundaries(sourceText, offset, offset + matchLength)
        ) {
          continue;
        }

        const ownerDocument = source.ownerDocument;
        const range = isTextArea ? undefined : ownerDocument.createRange();
        range?.setStart(source, offset);
        range?.setEnd(source, offset + matchLength);

        const id = `${this.runId}-${results.length}`;
        const scrollTarget =
          isTextArea
            ? source as HTMLTextAreaElement
            : (source as Text).parentElement?.closest(SEMANTIC_CONTAINER_SELECTOR) ??
              (source as Text).parentElement;

        if (scrollTarget) {
          const view = isTextArea
            ? createValueExcerpt(sourceText, offset, matchLength)
            : createExcerpt(source as Text, offset, matchLength);
          this.locations.set(id, {
            range,
            control: isTextArea ? source as HTMLTextAreaElement : undefined,
            matchStart: offset,
            matchEnd: offset + matchLength,
            scrollTarget,
            document: ownerDocument,
            signature: createResultSignature(view),
            sourceText,
          });
          results.push({
            id,
            ...view,
            order: results.length + 1,
          });
        }

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
      startContainer: location.range?.startContainer ?? location.control!,
      startOffset: location.range?.startOffset ?? location.matchStart,
      scrollTarget: location.scrollTarget,
      signature: location.signature,
      sourceText: location.sourceText,
    };
  }

  resolveSelection(anchor: SelectionAnchor): string | undefined {
    const entries = [...this.locations.entries()];
    const exactMatch = entries.find(([, location]) =>
      (location.range?.startContainer ?? location.control) === anchor.startContainer &&
      (location.range?.startOffset ?? location.matchStart) === anchor.startOffset &&
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
      !(location.range?.startContainer ?? location.control)?.isConnected ||
      !location.scrollTarget.isConnected
    ) {
      return false;
    }

    this.clearActiveHighlight();
    const registry = getHighlightRegistry(location.document);
    const HighlightForDocument = getHighlightConstructor(location.document);
    if (registry && HighlightForDocument && location.range) {
      registry.set(ACTIVE_HIGHLIGHT_NAME, new HighlightForDocument(location.range));
    }

    if (location.control) {
      location.control.setSelectionRange(location.matchStart, location.matchEnd);
    }
    if (options.scroll !== false) {
      this.scrollLocationIntoView(location);
      this.scrollFrameIntoView(location.document);
    }
    return true;
  }

  clear(): void {
    this.clearHighlights();
    this.locations.clear();
    for (const style of this.frameHighlightStyles.values()) style.remove();
    this.frameHighlightStyles.clear();
  }

  hideHighlights(): void {
    this.clearHighlights();
  }

  restoreHighlights(activeId?: string): void {
    this.renderAllHighlights();
    if (activeId) this.select(activeId, { scroll: false });
  }

  private renderAllHighlights(): void {
    const rangesByDocument = new Map<Document, Range[]>();
    for (const { document, range } of this.locations.values()) {
      if (!range?.startContainer.isConnected) continue;
      const ranges = rangesByDocument.get(document) ?? [];
      ranges.push(range);
      rangesByDocument.set(document, ranges);
    }

    for (const [ownerDocument, ranges] of rangesByDocument) {
      const registry = getHighlightRegistry(ownerDocument);
      const HighlightForDocument = getHighlightConstructor(ownerDocument);
      if (!registry || !HighlightForDocument) continue;
      if (ownerDocument !== document) this.ensureFrameHighlightStyles(ownerDocument);
      registry.delete(ALL_HIGHLIGHTS_NAME);
      registry.set(ALL_HIGHLIGHTS_NAME, new HighlightForDocument(...ranges));
      this.highlightedDocuments.add(ownerDocument);
    }
  }

  private clearActiveHighlight(): void {
    for (const ownerDocument of this.highlightedDocuments) {
      getHighlightRegistry(ownerDocument)?.delete(ACTIVE_HIGHLIGHT_NAME);
    }
  }

  private clearHighlights(): void {
    for (const ownerDocument of this.highlightedDocuments) {
      const registry = getHighlightRegistry(ownerDocument);
      registry?.get(ACTIVE_HIGHLIGHT_NAME)?.clear();
      registry?.get(ALL_HIGHLIGHTS_NAME)?.clear();
      registry?.delete(ACTIVE_HIGHLIGHT_NAME);
      registry?.delete(ALL_HIGHLIGHTS_NAME);
    }
    this.highlightedDocuments.clear();
  }

  private ensureFrameHighlightStyles(ownerDocument: Document): void {
    if (this.frameHighlightStyles.has(ownerDocument)) return;
    const style = createPageHighlightStyle(ownerDocument);
    this.frameHighlightStyles.set(ownerDocument, style);
  }

  private scrollLocationIntoView(location: MatchLocation): void {
    if (!location.range) {
      location.scrollTarget.scrollIntoView({
        behavior: 'instant',
        block: 'center',
        inline: 'nearest',
      });
      return;
    }

    const ownerWindow = location.document.defaultView;
    if (!ownerWindow) return;

    let ancestor = location.range.startContainer.parentElement;
    while (ancestor && ancestor !== location.document.body) {
      if (
        ancestor.scrollHeight > ancestor.clientHeight ||
        ancestor.scrollWidth > ancestor.clientWidth
      ) {
        const rangeRect = location.range.getBoundingClientRect();
        const ancestorRect = ancestor.getBoundingClientRect();
        ancestor.scrollBy({
          behavior: 'instant',
          left: rangeRect.left - ancestorRect.left - (ancestor.clientWidth - rangeRect.width) / 2,
          top: rangeRect.top - ancestorRect.top - (ancestor.clientHeight - rangeRect.height) / 2,
        });
      }
      ancestor = ancestor.parentElement;
    }

    const rect = location.range.getBoundingClientRect();
    const viewport = ownerWindow.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? ownerWindow.innerWidth;
    const viewportHeight = viewport?.height ?? ownerWindow.innerHeight;
    ownerWindow.scrollBy({
      behavior: 'instant',
      left: rect.left - viewportLeft - (viewportWidth - rect.width) / 2,
      top: rect.top - viewportTop - (viewportHeight - rect.height) / 2,
    });
  }

  private scrollFrameIntoView(ownerDocument: Document): void {
    let currentDocument: Document | null = ownerDocument;
    while (currentDocument && currentDocument !== document) {
      const frame: Element | null = currentDocument.defaultView?.frameElement ?? null;
      if (!frame || frame.nodeType !== Node.ELEMENT_NODE) break;
      frame.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      currentDocument = frame.ownerDocument;
    }
  }
}

function createPageHighlightStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
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
  (ownerDocument.head ?? ownerDocument.documentElement).append(style);
  return style;
}

export function installPageHighlightStyles(): () => void {
  const style = createPageHighlightStyle(document);
  return () => style.remove();
}
