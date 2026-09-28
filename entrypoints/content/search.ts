export const ACTIVE_HIGHLIGHT_NAME = 'findinpage-active-match';
export const ALL_HIGHLIGHTS_NAME = 'findinpage-all-matches';

const EXCLUDED_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'textarea', 'input', 'select',
  '[hidden]', '[aria-hidden="true"]', '[data-findinpage-host]',
  '[data-findinpage-fallback]', '[data-findinpage-control-mirror]',
].join(',');
const SEMANTIC_CONTAINER_SELECTOR = [
  'p', 'li', 'td', 'th', 'blockquote', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
].join(',');
const BLOCK_CONTAINER_SELECTOR = [
  SEMANTIC_CONTAINER_SELECTOR, 'div', 'section', 'article', 'main', 'aside',
  'nav', 'header', 'footer', 'form', 'fieldset', 'label', 'body',
].join(',');
const SUPPORTED_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url']);
const BATCH_SIZE = 80;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

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

export type HighlightMode = 'native' | 'fallback' | 'mixed';

export interface SearchResponse {
  results: SearchResultView[];
  durationMs: number;
  complete: boolean;
  highlightMode: HighlightMode;
  error?: SearchError;
}

export interface SearchResultDiagnostic {
  id: string;
  sourceType: 'light-dom' | 'shadow-dom' | 'control';
  documentDepth: number;
}

export interface SearchTask {
  id: number;
  cancel(): void;
  done: Promise<SearchResponse>;
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

interface TextFlow {
  kind: 'text';
  text: string;
  segments: TextSegment[];
  container: Element;
  document: Document;
}

interface ControlSource {
  kind: 'control';
  text: string;
  control: TextControl;
  document: Document;
}

type SearchSource = TextFlow | ControlSource;

interface MatchLocation {
  range?: Range;
  control?: TextControl;
  matchStart: number;
  matchEnd: number;
  scrollTarget: Element;
  document: Document;
  signature: string;
  sourceText: string;
  fallbackSpans?: HTMLElement[];
}

export interface SelectionAnchor {
  startContainer: Node;
  startOffset: number;
  scrollTarget: Element;
  signature: string;
  sourceText: string;
}

export interface RangeSelectionAnchor {
  document: Document;
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
}

type HighlightRegistry = {
  delete(name: string): void;
  get(name: string): Highlight | undefined;
  set(name: string, highlight: Highlight): void;
};
type HighlightConstructor = new (...ranges: Range[]) => Highlight;

interface ControlMirror {
  control: TextControl;
  root: HTMLDivElement;
  content: HTMLDivElement;
  matchElements: Map<string, HTMLElement[]>;
  cleanup(): void;
  sync(): void;
}

function getHighlightRegistry(ownerDocument: Document): HighlightRegistry | undefined {
  return (ownerDocument.defaultView?.CSS as typeof CSS & { highlights?: HighlightRegistry } | undefined)
    ?.highlights;
}

function getHighlightConstructor(ownerDocument: Document): HighlightConstructor | undefined {
  return (ownerDocument.defaultView as (Window & { Highlight?: HighlightConstructor }) | null)
    ?.Highlight;
}

function supportsNativeHighlight(ownerDocument: Document): boolean {
  return Boolean(getHighlightRegistry(ownerDocument) && getHighlightConstructor(ownerDocument));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function createResultSignature(view: Pick<SearchResultView, 'before' | 'match' | 'after'>): string {
  return `${view.before}\u0000${view.match}\u0000${view.after}`;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPreviousCodePoint(value: string, offset: number): string | undefined {
  if (offset <= 0) return undefined;
  const trailingUnit = value.charCodeAt(offset - 1);
  if (trailingUnit >= 0xdc00 && trailingUnit <= 0xdfff && offset > 1) {
    const leadingUnit = value.charCodeAt(offset - 2);
    if (leadingUnit >= 0xd800 && leadingUnit <= 0xdbff) return value.slice(offset - 2, offset);
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

function getNearestInlineScrollDelta(
  targetStart: number,
  targetEnd: number,
  viewportStart: number,
  viewportEnd: number,
): number {
  if (targetStart < viewportStart && targetEnd <= viewportEnd) {
    return targetStart - viewportStart;
  }
  if (targetEnd > viewportEnd && targetStart >= viewportStart) {
    return targetEnd - viewportEnd;
  }
  return 0;
}

function isSupportedControl(element: Element): element is TextControl {
  if (element.localName === 'textarea') return true;
  if (element.localName !== 'input') return false;
  return SUPPORTED_INPUT_TYPES.has((element as HTMLInputElement).type.toLowerCase());
}

function isVisibleElement(element: Element, visibilityCache: Map<Element, boolean>): boolean {
  const cached = visibilityCache.get(element);
  if (cached !== undefined) return cached;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const visible = Boolean(
    style && style.display !== 'none' && style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' && element.getClientRects().length > 0 &&
    isDocumentFrameVisible(element.ownerDocument, visibilityCache),
  );
  visibilityCache.set(element, visible);
  return visible;
}

function isVisibleTextNode(node: Text, visibilityCache: Map<Element, boolean>): boolean {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue || parent.closest(EXCLUDED_SELECTOR) || !isVisibleElement(parent, visibilityCache)) {
    return false;
  }
  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  return [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
}

function isDocumentFrameVisible(ownerDocument: Document, visibilityCache: Map<Element, boolean>): boolean {
  let currentDocument: Document | null = ownerDocument;
  while (currentDocument && currentDocument !== document) {
    const frame: Element | null = currentDocument.defaultView?.frameElement ?? null;
    if (!frame) return false;
    const cached = visibilityCache.get(frame);
    if (cached === false) return false;
    if (cached === undefined) {
      const style = frame.ownerDocument.defaultView?.getComputedStyle(frame);
      const visible = Boolean(style && style.display !== 'none' && style.visibility !== 'hidden' &&
        style.visibility !== 'collapse' && frame.getClientRects().length > 0);
      visibilityCache.set(frame, visible);
      if (!visible) return false;
    }
    currentDocument = frame.ownerDocument;
  }
  return true;
}

function getBlockContainer(node: Text): Element | null {
  return node.parentElement?.closest(BLOCK_CONTAINER_SELECTOR) ?? null;
}

function hasBreakBetween(previous: Text, current: Text, container: Element): boolean {
  const range = previous.ownerDocument.createRange();
  try {
    range.setStartAfter(previous);
    range.setEndBefore(current);
  } catch {
    return true;
  }
  const fragment = range.cloneContents();
  if (fragment.querySelector?.('br')) return true;
  for (const element of fragment.querySelectorAll?.('*') ?? []) {
    if (element.matches(BLOCK_CONTAINER_SELECTOR)) return true;
  }
  return !container.contains(current);
}

export interface PageSearchScope {
  getRoots(): Node[];
  getShadowRoot?(element: Element): ShadowRoot | null | undefined;
}

declare global {
  interface Window {
    __findinpageClosedShadowRoots?: WeakMap<Element, ShadowRoot>;
  }
}

export function getSearchableShadowRoot(element: Element): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  const retainedRoot = window.__findinpageClosedShadowRoots?.get(element);
  if (retainedRoot) return retainedRoot;
  try {
    return typeof browser !== 'undefined' && browser.dom?.openOrClosedShadowRoot
      ? browser.dom.openOrClosedShadowRoot(element as HTMLElement)
      : null;
  } catch {
    return null;
  }
}

function* walkComposedNodes(
  node: Node,
  visited = new Set<Node>(),
  getShadowRoot: (element: Element) => ShadowRoot | null | undefined = getSearchableShadowRoot,
): Generator<Node> {
  if (visited.has(node)) return;
  visited.add(node);
  if (node.nodeType === Node.TEXT_NODE) {
    yield node;
    return;
  }
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : undefined;
  if (element?.hasAttribute('data-findinpage-host') || element?.hasAttribute('data-findinpage-fallback') ||
      element?.hasAttribute('data-findinpage-control-mirror')) return;
  if (element?.localName === 'slot') {
    const assigned = (element as HTMLSlotElement).assignedNodes({ flatten: true });
    if (assigned.length) {
      for (const assignedNode of assigned) yield* walkComposedNodes(assignedNode, visited, getShadowRoot);
      return;
    }
  }
  if (element?.localName === 'iframe') {
    try {
      const frameDocument = (element as HTMLIFrameElement).contentDocument;
      if (frameDocument?.body) yield* walkComposedNodes(frameDocument.body, visited, getShadowRoot);
    } catch {
      // Cross-origin frames are unavailable to content scripts.
    }
    return;
  }
  const shadowRoot = element ? getShadowRoot(element) : undefined;
  if (shadowRoot) {
    yield* walkComposedNodes(shadowRoot, visited, getShadowRoot);
    return;
  }
  if (element && isSupportedControl(element)) {
    yield element;
    return;
  }
  for (const child of node.childNodes) yield* walkComposedNodes(child, visited, getShadowRoot);
}

function collectSearchSources(
  roots: Node[],
  visibilityCache: Map<Element, boolean>,
  getShadowRoot?: PageSearchScope['getShadowRoot'],
): SearchSource[] {
  const sources: SearchSource[] = [];
  const visited = new Set<Node>();
  for (const root of roots) {
    let flow: TextFlow | undefined;
    let previousText: Text | undefined;
    for (const node of walkComposedNodes(root, visited, getShadowRoot)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const control = node as TextControl;
      if (isVisibleElement(control, visibilityCache)) {
        sources.push({ kind: 'control', text: control.value, control, document: control.ownerDocument });
      }
      flow = undefined;
      previousText = undefined;
      continue;
    }
    const textNode = node as Text;
    if (!isVisibleTextNode(textNode, visibilityCache)) continue;
    const container = getBlockContainer(textNode);
    if (!container) continue;
    if (!flow || flow.container !== container || flow.document !== textNode.ownerDocument ||
        (previousText && hasBreakBetween(previousText, textNode, container))) {
      flow = { kind: 'text', text: '', segments: [], container, document: textNode.ownerDocument };
      sources.push(flow);
    }
    const start = flow.text.length;
    flow.text += textNode.nodeValue ?? '';
    flow.segments.push({ node: textNode, start, end: flow.text.length });
    previousText = textNode;
    }
  }
  return sources;
}

function offsetToBoundary(flow: TextFlow, offset: number, end: boolean): { node: Text; offset: number } | undefined {
  const segment = flow.segments.find((candidate, index) =>
    end ? offset <= candidate.end && (offset > candidate.start || index === 0) : offset < candidate.end,
  ) ?? (end && offset === flow.text.length ? flow.segments.at(-1) : undefined);
  if (!segment) return undefined;
  return { node: segment.node, offset: Math.max(0, Math.min(offset - segment.start, segment.node.length)) };
}

function createTextRange(flow: TextFlow, start: number, end: number): Range | undefined {
  const startBoundary = offsetToBoundary(flow, start, false);
  const endBoundary = offsetToBoundary(flow, end, true);
  if (!startBoundary || !endBoundary) return undefined;
  const range = flow.document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  return range;
}

function createExcerpt(value: string, matchStart: number, matchLength: number) {
  const matchEnd = matchStart + matchLength;
  const beforeStart = Math.max(0, matchStart - 72);
  const afterEnd = Math.min(value.length, matchEnd + 88);
  return {
    before: `${beforeStart > 0 ? '...' : ''}${normalizeWhitespace(value.slice(beforeStart, matchStart))}`,
    match: value.slice(matchStart, matchEnd),
    after: `${normalizeWhitespace(value.slice(matchEnd, afterEnd))}${afterEnd < value.length ? '...' : ''}`,
  };
}

function nextFrame(ownerDocument: Document): Promise<void> {
  return new Promise((resolve) => {
    const view = ownerDocument.defaultView;
    if (view?.requestAnimationFrame) view.requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function createPageHighlightStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.dataset.findinpageHighlight = 'true';
  style.textContent = `
    ::highlight(${ALL_HIGHLIGHTS_NAME}) { background-color: #ffff05; color: #000000; }
    ::highlight(${ACTIVE_HIGHLIGHT_NAME}) {
      background-color: #ff9632; color: #000000; text-decoration: underline;
      text-decoration-color: #9a6700; text-decoration-thickness: 2px;
    }
    [data-findinpage-fallback="match"] { background: #ffff05 !important; color: #000 !important; }
    [data-findinpage-fallback="active"] {
      background: #ff9632 !important; color: #000 !important; text-decoration: underline !important;
      text-decoration-color: #9a6700 !important; text-decoration-thickness: 2px !important;
    }
  `;
  (ownerDocument.head ?? ownerDocument.documentElement).append(style);
  return style;
}

export function installPageHighlightStyles(): () => void {
  const style = createPageHighlightStyle(document);
  return () => style.remove();
}

export function getAccessibleDocuments(root: Document = document): Document[] {
  const documents: Document[] = [];
  const visited = new Set<Document>();
  const visitParent = (parent: ParentNode) => {
    for (const element of parent.querySelectorAll('*')) {
      const shadowRoot = getSearchableShadowRoot(element);
      if (shadowRoot) visitParent(shadowRoot);
      if (element.localName !== 'iframe') continue;
      try { const frameDocument = (element as HTMLIFrameElement).contentDocument; if (frameDocument) visit(frameDocument); } catch {}
    }
  };
  const visit = (current: Document) => {
    if (visited.has(current)) return;
    visited.add(current); documents.push(current); visitParent(current);
  };
  visit(root);
  return documents;
}

export function getSearchableShadowRoots(root: ParentNode = document.body): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const visit = (parent: ParentNode) => {
    for (const element of parent.querySelectorAll('*')) {
      if (element.hasAttribute('data-findinpage-host')) continue;
      const shadowRoot = getSearchableShadowRoot(element);
      if (!shadowRoot) continue;
      roots.push(shadowRoot); visit(shadowRoot);
    }
  };
  visit(root);
  return roots;
}

export class PageSearch {
  private locations = new Map<string, MatchLocation>();
  private highlightedDocuments = new Set<Document>();
  private frameHighlightStyles = new Map<Document, HTMLStyleElement>();
  private fallbackSpans = new Set<HTMLElement>();
  private mirrors = new Map<TextControl, ControlMirror>();
  private runId = 0;
  private activeTask?: { id: number; cancelled: boolean };
  private highlightsVisible = true;

  constructor(private readonly scope?: PageSearchScope) {}

  search(
    query: string,
    options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
    onUpdate?: (response: SearchResponse) => void,
  ): SearchTask {
    this.cancelSearch();
    this.clearRenderedHighlights();
    this.locations.clear();
    const taskState = { id: ++this.runId, cancelled: false };
    this.activeTask = taskState;
    this.highlightsVisible = true;
    const startedAt = performance.now();
    const results: SearchResultView[] = [];
    let matcher: RegExp;

    try {
      matcher = new RegExp(options.useRegularExpression ? query : escapeRegularExpression(query),
        `gu${options.caseSensitive ? '' : 'i'}`);
    } catch {
      const response: SearchResponse = {
        results, durationMs: performance.now() - startedAt, complete: true,
        highlightMode: 'native',
        error: { code: 'invalid_regular_expression', message: 'Invalid regular expression.' },
      };
      onUpdate?.(response);
      return { id: taskState.id, cancel: () => { taskState.cancelled = true; }, done: Promise.resolve(response) };
    }

    const done = (async (): Promise<SearchResponse> => {
      if (!query) {
        const empty = this.response(results, startedAt, true);
        onUpdate?.(empty);
        return empty;
      }
      const visibilityCache = new Map<Element, boolean>();
      const roots = this.scope?.getRoots() ?? (document.body ? [document.body] : []);
      const sources = collectSearchSources(roots, visibilityCache, this.scope?.getShadowRoot);
      for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
        if (taskState.cancelled) return this.response(results, startedAt, true);
        const source = sources[sourceIndex];
        matcher.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = matcher.exec(source.text)) !== null) {
          const matchLength = match[0].length;
          if (matchLength === 0) {
            const codePoint = source.text.codePointAt(matcher.lastIndex);
            matcher.lastIndex += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
            continue;
          }
          const offset = match.index;
          if (options.wholeWord && !hasWholeWordBoundaries(source.text, offset, offset + matchLength)) continue;
          const range = source.kind === 'text' ? createTextRange(source, offset, offset + matchLength) : undefined;
          if (source.kind === 'text' && !range) continue;
          const view = createExcerpt(source.text, offset, matchLength);
          const id = `${taskState.id}-${results.length}`;
          const scrollTarget = source.kind === 'control' ? source.control :
            source.container.closest(SEMANTIC_CONTAINER_SELECTOR) ?? source.container;
          this.locations.set(id, {
            range,
            control: source.kind === 'control' ? source.control : undefined,
            matchStart: offset,
            matchEnd: offset + matchLength,
            scrollTarget,
            document: source.document,
            signature: createResultSignature(view),
            sourceText: source.text,
          });
          results.push({ id, ...view, order: results.length + 1 });
        }
        if ((sourceIndex + 1) % BATCH_SIZE === 0) {
          if (this.highlightsVisible) this.renderNativeHighlights();
          onUpdate?.(this.response(results, startedAt, false));
          await nextFrame(source.document);
        }
      }
      if (!taskState.cancelled && this.highlightsVisible) this.renderAllHighlights();
      const response = this.response(results, startedAt, true);
      if (!taskState.cancelled) onUpdate?.(response);
      return response;
    })();

    return {
      id: taskState.id,
      cancel: () => { taskState.cancelled = true; },
      done,
    };
  }

  cancelSearch(): void {
    if (this.activeTask) this.activeTask.cancelled = true;
    this.activeTask = undefined;
  }

  diagnose(results: SearchResultView[]): SearchResultDiagnostic[] {
    return results.flatMap((result) => {
      const location = this.locations.get(result.id);
      if (!location) return [];
      let documentDepth = 0;
      let ownerDocument: Document | null = location.document;
      while (ownerDocument && ownerDocument !== document) {
        documentDepth += 1;
        ownerDocument = ownerDocument.defaultView?.frameElement?.ownerDocument ?? null;
      }
      const root = location.range?.startContainer.getRootNode();
      return [{
        id: result.id,
        sourceType: location.control
          ? 'control'
          : root && root.nodeType === Node.DOCUMENT_FRAGMENT_NODE
            ? 'shadow-dom'
            : 'light-dom',
        documentDepth,
      }];
    });
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

  captureRangeSelection(range: Range): RangeSelectionAnchor {
    const rect = range.getBoundingClientRect();
    return {
      document: range.startContainer.ownerDocument ?? document,
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
    };
  }

  resolveRangeSelection(anchor: RangeSelectionAnchor): string | undefined {
    const entries = [...this.locations.entries()].filter(
      (entry): entry is [string, MatchLocation & { range: Range }] =>
        entry[1].document === anchor.document && Boolean(entry[1].range),
    );
    const exact = entries.find(([, location]) =>
      location.range.startContainer === anchor.startContainer &&
      location.range.startOffset === anchor.startOffset &&
      location.range.endContainer === anchor.endContainer &&
      location.range.endOffset === anchor.endOffset);
    if (exact) return exact[0];

    const tolerance = 1;
    return entries.find(([, location]) => {
      const rect = location.range.getBoundingClientRect();
      return Math.abs(rect.left - anchor.rect.left) <= tolerance &&
        Math.abs(rect.top - anchor.rect.top) <= tolerance &&
        Math.abs(rect.right - anchor.rect.right) <= tolerance &&
        Math.abs(rect.bottom - anchor.rect.bottom) <= tolerance;
    })?.[0];
  }

  resolveSelection(anchor: SelectionAnchor): string | undefined {
    const entries = [...this.locations.entries()];
    return entries.find(([, location]) =>
      (location.range?.startContainer ?? location.control) === anchor.startContainer &&
      (location.range?.startOffset ?? location.matchStart) === anchor.startOffset &&
      location.sourceText === anchor.sourceText)?.[0] ??
      entries.find(([, location]) => location.scrollTarget === anchor.scrollTarget && location.signature === anchor.signature)?.[0] ??
      entries.find(([, location]) => location.signature === anchor.signature)?.[0];
  }

  select(id: string, options: { scroll?: boolean } = {}): boolean {
    const location = this.locations.get(id);
    const target = location?.fallbackSpans?.[0] ?? location?.range?.startContainer ?? location?.control;
    if (!location || !target?.isConnected || !location.scrollTarget.isConnected) return false;
    this.clearActiveHighlight();
    if (location.control) {
      try { location.control.setSelectionRange(location.matchStart, location.matchEnd); } catch {}
      this.setMirrorActive(id);
    } else if (location.fallbackSpans?.length) {
      for (const span of location.fallbackSpans) span.dataset.findinpageFallback = 'active';
    } else if (location.range) {
      const registry = getHighlightRegistry(location.document);
      const HighlightForDocument = getHighlightConstructor(location.document);
      if (registry && HighlightForDocument) registry.set(ACTIVE_HIGHLIGHT_NAME, new HighlightForDocument(location.range));
    }
    if (options.scroll !== false) {
      this.scrollLocationIntoView(location);
      this.scrollFrameIntoView(location.document);
    }
    return true;
  }

  clear(): void {
    this.cancelSearch();
    this.clearRenderedHighlights();
    this.locations.clear();
    for (const style of this.frameHighlightStyles.values()) style.remove();
    this.frameHighlightStyles.clear();
  }

  hideHighlights(): void {
    this.highlightsVisible = false;
    for (const ownerDocument of this.highlightedDocuments) {
      const registry = getHighlightRegistry(ownerDocument);
      registry?.delete(ACTIVE_HIGHLIGHT_NAME);
      registry?.delete(ALL_HIGHLIGHTS_NAME);
    }
    this.highlightedDocuments.clear();
    for (const span of this.fallbackSpans) span.dataset.findinpageFallback = 'hidden';
    for (const mirror of this.mirrors.values()) mirror.root.style.display = 'none';
  }

  restoreHighlights(activeId?: string): void {
    this.highlightsVisible = true;
    if (this.fallbackSpans.size || this.mirrors.size) {
      this.renderNativeHighlights();
      for (const span of this.fallbackSpans) span.dataset.findinpageFallback = 'match';
      for (const mirror of this.mirrors.values()) {
        mirror.root.style.display = '';
        mirror.sync();
      }
    } else {
      this.renderAllHighlights();
    }
    if (activeId) this.select(activeId, { scroll: false });
  }

  private response(results: SearchResultView[], startedAt: number, complete: boolean): SearchResponse {
    const documents = new Set([...this.locations.values()].filter((location) => location.range).map((location) => location.document));
    const modes = [...documents].map((ownerDocument) => supportsNativeHighlight(ownerDocument));
    const highlightMode: HighlightMode = modes.length === 0 || modes.every(Boolean) ? 'native' : modes.every((value) => !value) ? 'fallback' : 'mixed';
    return { results: [...results], durationMs: performance.now() - startedAt, complete, highlightMode };
  }

  private renderAllHighlights(): void {
    this.clearRenderedHighlights();
    this.renderNativeHighlights();
    this.renderFallbackHighlights();
    this.renderControlMirrors();
  }

  private renderNativeHighlights(): void {
    const rangesByDocument = new Map<Document, Range[]>();
    for (const { document: ownerDocument, range } of this.locations.values()) {
      if (!range?.startContainer.isConnected || !supportsNativeHighlight(ownerDocument)) continue;
      const ranges = rangesByDocument.get(ownerDocument) ?? [];
      ranges.push(range); rangesByDocument.set(ownerDocument, ranges);
    }
    for (const [ownerDocument, ranges] of rangesByDocument) {
      const registry = getHighlightRegistry(ownerDocument)!;
      const HighlightForDocument = getHighlightConstructor(ownerDocument)!;
      if (ownerDocument !== document) this.ensureFrameHighlightStyles(ownerDocument);
      registry.delete(ALL_HIGHLIGHTS_NAME);
      registry.set(ALL_HIGHLIGHTS_NAME, new HighlightForDocument(...ranges));
      this.highlightedDocuments.add(ownerDocument);
    }
  }

  private renderFallbackHighlights(): void {
    const entriesByDocument = new Map<Document, Array<[string, MatchLocation]>>();
    for (const entry of this.locations.entries()) {
      const location = entry[1];
      if (!location.range?.startContainer.isConnected || supportsNativeHighlight(location.document)) continue;
      const entries = entriesByDocument.get(location.document) ?? [];
      entries.push(entry); entriesByDocument.set(location.document, entries);
    }
    for (const [ownerDocument, entries] of entriesByDocument) {
      if (ownerDocument !== document) this.ensureFrameHighlightStyles(ownerDocument);
      entries.sort(([, a], [, b]) => b.range!.compareBoundaryPoints(ownerDocument.defaultView!.Range.START_TO_START, a.range!));
      for (const [id, location] of entries) {
      const range = location.range!;
      const walker = location.document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let current: Node | null = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer : walker.nextNode();
      while (current) {
        const node = current as Text;
        if (range.intersectsNode(node)) textNodes.push(node);
        current = walker.nextNode();
      }
      const spans: HTMLElement[] = [];
      for (const node of textNodes.reverse()) {
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.length;
        if (end <= start || !node.parentNode) continue;
        const matched = node.splitText(start);
        matched.splitText(end - start);
        const span = location.document.createElement('span');
        span.dataset.findinpageFallback = 'match';
        span.dataset.findinpageMatchId = id;
        matched.parentNode!.replaceChild(span, matched);
        span.append(matched);
        this.fallbackSpans.add(span); spans.unshift(span);
      }
      location.fallbackSpans = spans;
      }
    }
  }

  private renderControlMirrors(): void {
    const byControl = new Map<TextControl, Array<[string, MatchLocation]>>();
    for (const entry of this.locations.entries()) {
      const control = entry[1].control;
      if (!control?.isConnected) continue;
      const matches = byControl.get(control) ?? [];
      matches.push(entry); byControl.set(control, matches);
    }
    for (const [control, matches] of byControl) this.mirrors.set(control, this.createControlMirror(control, matches));
  }

  private createControlMirror(control: TextControl, matches: Array<[string, MatchLocation]>): ControlMirror {
    const ownerDocument = control.ownerDocument;
    const view = ownerDocument.defaultView!;
    const root = ownerDocument.createElement('div');
    const content = ownerDocument.createElement('div');
    root.dataset.findinpageControlMirror = 'true';
    root.setAttribute('aria-hidden', 'true');
    root.append(content);
    const computed = view.getComputedStyle(control);
    for (const property of computed) {
      root.style.setProperty(
        property,
        computed.getPropertyValue(property),
        computed.getPropertyPriority(property),
      );
    }
    Object.assign(root.style, {
      position: 'absolute', pointerEvents: 'none', overflow: 'hidden', zIndex: '2147483646',
      display: 'block', margin: '0', transform: 'none', inset: 'auto',
      boxSizing: computed.boxSizing, borderRadius: computed.borderRadius,
      borderStyle: 'solid', borderColor: 'transparent',
      borderTopWidth: computed.borderTopWidth, borderRightWidth: computed.borderRightWidth,
      borderBottomWidth: computed.borderBottomWidth, borderLeftWidth: computed.borderLeftWidth,
      padding: computed.padding, font: computed.font, letterSpacing: computed.letterSpacing,
      lineHeight: computed.lineHeight, textAlign: computed.textAlign, textIndent: computed.textIndent,
      textTransform: computed.textTransform, direction: computed.direction, color: 'transparent',
      wordSpacing: computed.wordSpacing, tabSize: computed.tabSize,
      whiteSpace: control.localName === 'textarea' ? 'pre-wrap' : 'pre',
      overflowWrap: control.localName === 'textarea' ? 'break-word' : 'normal',
      background: 'transparent', boxShadow: 'none', outline: 'none', resize: 'none',
    });
    root.style.setProperty('-webkit-text-fill-color', 'transparent');
    Object.assign(content.style, {
      minHeight: '100%',
      minWidth: control.localName === 'textarea' ? '0' : '100%',
      width: control.localName === 'textarea' ? 'auto' : 'max-content',
      boxSizing: 'border-box',
      margin: '0', padding: '0', border: '0',
    });
    const matchElements = new Map<string, HTMLElement[]>();
    let offset = 0;
    for (const [id, location] of matches.sort((a, b) => a[1].matchStart - b[1].matchStart)) {
      content.append(ownerDocument.createTextNode(control.value.slice(offset, location.matchStart)));
      const mark = ownerDocument.createElement('span');
      mark.dataset.findinpageControlMatch = id;
      Object.assign(mark.style, { backgroundColor: '#ffff05', color: '#000' });
      mark.style.setProperty('-webkit-text-fill-color', '#000');
      mark.textContent = control.value.slice(location.matchStart, location.matchEnd);
      content.append(mark); matchElements.set(id, [mark]); offset = location.matchEnd;
    }
    content.append(ownerDocument.createTextNode(control.value.slice(offset)));
    ownerDocument.documentElement.append(root);
    const sync = () => {
      const rect = control.getBoundingClientRect();
      Object.assign(root.style, {
        left: `${rect.left + view.scrollX}px`,
        top: `${rect.top + view.scrollY}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      if (control.localName === 'textarea') {
        const paddingInline = Number.parseFloat(computed.paddingLeft) + Number.parseFloat(computed.paddingRight);
        content.style.width = `${Math.max(0, control.clientWidth - paddingInline)}px`;
      }
      content.style.transform = `translate(${-control.scrollLeft}px, ${-control.scrollTop}px)`;
    };
    const onScroll = () => sync();
    control.addEventListener('scroll', onScroll, { passive: true });
    view.addEventListener('scroll', onScroll, { capture: true, passive: true });
    view.addEventListener('resize', onScroll, { passive: true });
    sync();
    return {
      control, root, content, matchElements, sync,
      cleanup: () => {
        control.removeEventListener('scroll', onScroll);
        view.removeEventListener('scroll', onScroll, { capture: true });
        view.removeEventListener('resize', onScroll);
        root.remove();
      },
    };
  }

  private setMirrorActive(id: string): void {
    for (const mirror of this.mirrors.values()) {
      for (const [matchId, elements] of mirror.matchElements) {
        for (const element of elements) {
          element.style.backgroundColor = matchId === id ? '#ff9632' : '#ffff05';
          element.style.textDecoration = matchId === id ? 'underline 2px #9a6700' : '';
        }
      }
    }
  }

  private clearActiveHighlight(): void {
    for (const ownerDocument of this.highlightedDocuments) getHighlightRegistry(ownerDocument)?.delete(ACTIVE_HIGHLIGHT_NAME);
    for (const span of this.fallbackSpans) span.dataset.findinpageFallback = 'match';
    this.setMirrorActive('');
  }

  private clearRenderedHighlights(): void {
    for (const ownerDocument of this.highlightedDocuments) {
      const registry = getHighlightRegistry(ownerDocument);
      registry?.get(ACTIVE_HIGHLIGHT_NAME)?.clear(); registry?.get(ALL_HIGHLIGHTS_NAME)?.clear();
      registry?.delete(ACTIVE_HIGHLIGHT_NAME); registry?.delete(ALL_HIGHLIGHTS_NAME);
    }
    this.highlightedDocuments.clear();
    for (const mirror of this.mirrors.values()) mirror.cleanup();
    this.mirrors.clear();
    const parents = new Set<Node>();
    for (const span of this.fallbackSpans) {
      if (!span.parentNode) continue;
      const parent = span.parentNode; parents.add(parent);
      parent.replaceChild(span.ownerDocument.createTextNode(span.textContent ?? ''), span);
    }
    for (const parent of parents) parent.normalize();
    this.fallbackSpans.clear();
    for (const location of this.locations.values()) location.fallbackSpans = undefined;
  }

  private ensureFrameHighlightStyles(ownerDocument: Document): void {
    if (!this.frameHighlightStyles.has(ownerDocument)) this.frameHighlightStyles.set(ownerDocument, createPageHighlightStyle(ownerDocument));
  }

  private scrollLocationIntoView(location: MatchLocation): void {
    if (location.control) {
      location.control.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      const mirror = this.mirrors.get(location.control);
      const match = [...(mirror?.matchElements.values() ?? [])].flat().find((element) =>
        element.dataset.findinpageControlMatch && location === this.locations.get(element.dataset.findinpageControlMatch));
      if (mirror && match) {
        const left = Math.max(0, match.offsetLeft - location.control.clientWidth / 2);
        const top = Math.max(0, match.offsetTop - location.control.clientHeight / 2);
        location.control.scrollLeft = left;
        if (location.control.localName === 'textarea') location.control.scrollTop = top;
        mirror.sync();
      }
      return;
    }
    const targetRange = location.range;
    const fallback = location.fallbackSpans?.[0];
    if (!targetRange?.startContainer.isConnected && fallback) {
      fallback.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      return;
    }
    if (!targetRange) return;
    const ownerWindow = location.document.defaultView;
    if (!ownerWindow) return;
    let ancestor = targetRange.startContainer.parentElement;
    while (ancestor && ancestor !== location.document.body) {
      if (ancestor.scrollHeight > ancestor.clientHeight || ancestor.scrollWidth > ancestor.clientWidth) {
        const rangeRect = targetRange.getBoundingClientRect(); const ancestorRect = ancestor.getBoundingClientRect();
        const inlineStart = ancestorRect.left + ancestor.clientLeft;
        ancestor.scrollBy({ behavior: 'instant', left: getNearestInlineScrollDelta(
          rangeRect.left, rangeRect.right, inlineStart, inlineStart + ancestor.clientWidth,
        ),
          top: rangeRect.top - ancestorRect.top - (ancestor.clientHeight - rangeRect.height) / 2 });
      }
      ancestor = ancestor.parentElement;
    }
    const rect = targetRange.getBoundingClientRect(); const viewport = ownerWindow.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportWidth = viewport?.width ?? ownerWindow.innerWidth;
    ownerWindow.scrollBy({ behavior: 'instant',
      left: getNearestInlineScrollDelta(rect.left, rect.right, viewportLeft, viewportLeft + viewportWidth),
      top: rect.top - (viewport?.offsetTop ?? 0) - ((viewport?.height ?? ownerWindow.innerHeight) - rect.height) / 2 });
  }

  private scrollFrameIntoView(ownerDocument: Document): void {
    let current: Document | null = ownerDocument;
    while (current && current !== document) {
      const frame: Element | null = current.defaultView?.frameElement ?? null;
      if (!frame) break;
      frame.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      current = frame.ownerDocument;
    }
  }
}
