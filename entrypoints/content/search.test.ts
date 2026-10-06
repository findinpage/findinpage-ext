import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_HIGHLIGHT_NAME,
  ALL_HIGHLIGHTS_NAME,
  PageSearch,
  type SearchResponse,
} from './search';

class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) { this.ranges = ranges; }
  clear() { this.ranges = []; }
}

function installNativeHighlights() {
  const registry = new Map<string, FakeHighlight>();
  Object.defineProperty(window, 'Highlight', { configurable: true, value: FakeHighlight });
  Object.defineProperty(window.CSS, 'highlights', { configurable: true, value: registry });
  return registry;
}

function removeNativeHighlights() {
  Object.defineProperty(window, 'Highlight', { configurable: true, value: undefined });
  Object.defineProperty(window.CSS, 'highlights', { configurable: true, value: undefined });
}

async function search(pageSearch: PageSearch, query: string) {
  const updates: SearchResponse[] = [];
  const task = pageSearch.search(query, undefined, (response) => updates.push(response));
  const response = await task.done;
  return { response, updates, task };
}

describe('PageSearch', () => {
  let pageSearch: PageSearch;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    pageSearch = new PageSearch();
    installNativeHighlights();
  });

  afterEach(() => {
    pageSearch.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('matches across inline text nodes but not across blocks or br elements', async () => {
    document.body.innerHTML = `
      <p>hello <strong>world</strong></p>
      <p>hello</p><p>world</p>
      <div>hello<br>world</div>
    `;
    const { response } = await search(pageSearch, 'hello world');
    expect(response.results).toHaveLength(1);
    expect(response.results[0].match).toBe('hello world');
  });

  it('searches a retained closed shadow root without changing its closed semantics', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const closedRoot = host.attachShadow({ mode: 'closed' });
    closedRoot.innerHTML = '<p>closed needle</p>';
    expect(host.shadowRoot).toBeNull();

    const closedSearch = new PageSearch({ getRoots: () => [closedRoot] });
    const { response } = await search(closedSearch, 'needle');

    expect(response.results).toHaveLength(1);
    expect(response.results[0].match).toBe('needle');
    expect(closedRoot.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);
    expect(host.shadowRoot).toBeNull();
    closedSearch.clear();
    expect(closedRoot.querySelector('style[data-findinpage-highlight]')).toBeNull();
  });

  it('searches a closed root that existed before search initialization through the extension DOM API', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const closedRoot = host.attachShadow({ mode: 'closed' });
    closedRoot.innerHTML = '<p>early sealed signal</p>';
    vi.stubGlobal('browser', {
      dom: {
        openOrClosedShadowRoot: (element: HTMLElement) => element === host ? closedRoot : null,
      },
    });

    const { response } = await search(pageSearch, 'signal');

    expect(response.results).toHaveLength(1);
    expect(host.shadowRoot).toBeNull();
  });

  it('searches nested open and closed roots below a retained closed root without duplicates', async () => {
    const roots = new WeakMap<Element, ShadowRoot>();
    const host = document.createElement('div');
    document.body.append(host);
    const outer = host.attachShadow({ mode: 'closed' });
    roots.set(host, outer);
    outer.innerHTML = '<p>needle outer</p><div id="open-host"></div><div id="closed-host"></div>';
    const openHost = outer.querySelector('#open-host')!;
    openHost.attachShadow({ mode: 'open' }).innerHTML = '<p>needle open nested</p>';
    const closedHost = outer.querySelector('#closed-host')!;
    const innerClosed = closedHost.attachShadow({ mode: 'closed' });
    roots.set(closedHost, innerClosed);
    innerClosed.innerHTML = '<p>needle closed nested</p>';

    const closedSearch = new PageSearch({
      getRoots: () => [outer, innerClosed],
      getShadowRoot: (element) => element.shadowRoot ?? roots.get(element),
    });
    const { response } = await search(closedSearch, 'needle');

    expect(response.results).toHaveLength(3);
    expect([...outer.children].filter((element) => element.matches('style[data-findinpage-highlight]'))).toHaveLength(1);
    expect(openHost.shadowRoot?.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);
    expect(innerClosed.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);
    closedSearch.clear();
  });

  it('searches supported inputs and textarea while excluding sensitive and non-text controls', async () => {
    document.body.innerHTML = `
      <input value="needle default">
      <input type="search" value="needle search">
      <input type="email" value="needle@example.com">
      <input type="tel" value="needle tel">
      <input type="url" value="https://needle.test">
      <textarea>needle area</textarea>
      <input type="password" value="needle secret">
      <input type="number" value="1">
    `;
    const { response } = await search(pageSearch, 'needle');
    expect(response.results).toHaveLength(6);
    expect(document.querySelectorAll('[data-findinpage-control-mirror]')).toHaveLength(6);
    expect(document.documentElement.lastElementChild?.hasAttribute('data-findinpage-control-mirror')).toBe(true);
    expect((document.querySelector('input') as HTMLInputElement).style.color).toBe('');
  });

  it('updates active control highlights and rebuilds mirrors when values change', async () => {
    document.body.innerHTML = '<textarea style="color: rgb(10, 20, 30)">needle first needle</textarea>';
    const control = document.querySelector('textarea')!;
    const firstSearch = await search(pageSearch, 'needle');
    expect(pageSearch.select(firstSearch.response.results[1].id, { scroll: false })).toBe(true);
    const marks = [...document.querySelectorAll<HTMLElement>('[data-findinpage-control-match]')];
    expect(marks[0].style.backgroundColor).toBe('rgb(255, 255, 5)');
    expect(marks[1].style.backgroundColor).toBe('rgb(255, 150, 50)');

    control.value = 'updated needle';
    const secondSearch = await search(pageSearch, 'updated');
    expect(secondSearch.response.results).toHaveLength(1);
    expect(document.querySelectorAll('[data-findinpage-control-mirror]')).toHaveLength(1);
    pageSearch.clear();
    expect(control.style.color).toBe('rgb(10, 20, 30)');
    expect(document.querySelector('[data-findinpage-control-mirror]')).toBeNull();
  });

  it('publishes intermediate batches without limiting the final result count', async () => {
    document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>needle ${index}</p>`).join('');
    const { response, updates } = await search(pageSearch, 'needle');
    expect(response.results).toHaveLength(170);
    expect(response.complete).toBe(true);
    expect(updates.some((update) => !update.complete)).toBe(true);
    expect(updates.at(-1)?.results).toHaveLength(170);
  });

  it('cancels an in-flight search without publishing a completed update', async () => {
    document.body.innerHTML = Array.from({ length: 170 }, () => '<p>needle</p>').join('');
    const updates: SearchResponse[] = [];
    const task = pageSearch.search('needle', undefined, (response) => {
      updates.push(response);
      if (!response.complete) queueMicrotask(() => task.cancel());
    });
    await task.done;
    expect(updates.some((update) => !update.complete)).toBe(true);
    expect(updates.at(-1)?.complete).toBe(false);
  });

  it('registers native all-match and active highlights', async () => {
    const registry = installNativeHighlights();
    document.body.innerHTML = '<p>needle and needle</p>';
    const { response } = await search(pageSearch, 'needle');
    expect(response.highlightMode).toBe('native');
    expect(registry.get(ALL_HIGHLIGHTS_NAME)?.ranges).toHaveLength(2);
    expect(pageSearch.select(response.results[1].id, { scroll: false })).toBe(true);
    expect(registry.get(ACTIVE_HIGHLIGHT_NAME)?.ranges).toHaveLength(1);
    pageSearch.hideHighlights();
    expect(registry.has(ALL_HIGHLIGHTS_NAME)).toBe(false);
    pageSearch.restoreHighlights(response.results[1].id);
    expect(registry.has(ACTIVE_HIGHLIGHT_NAME)).toBe(true);
  });

  it('installs and reuses native highlight styles in an open shadow root', async () => {
    const host = document.createElement('div');
    host.dataset.component = 'RelativeTime';
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<span part="root">4 days ago</span>';
    document.body.append(host);

    const first = await search(pageSearch, 'ago');
    expect(first.response.results).toHaveLength(1);
    expect(shadowRoot.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);

    await search(pageSearch, 'days');
    pageSearch.hideHighlights();
    pageSearch.restoreHighlights();
    expect(shadowRoot.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);

    pageSearch.clear();
    expect(shadowRoot.querySelector('style[data-findinpage-highlight]')).toBeNull();
  });

  it('searches visible text directly under a shadow root', async () => {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.append(document.createTextNode('direct shadow needle'));
    document.body.append(host);

    const { response } = await search(pageSearch, 'needle');

    expect(response.results).toHaveLength(1);
    expect(response.results[0].match).toBe('needle');
    expect(shadowRoot.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);
  });

  it('prunes highlight styles for disconnected shadow roots on the next search', async () => {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<p>needle</p>';
    document.body.append(host);
    await search(pageSearch, 'needle');
    expect(shadowRoot.querySelector('style[data-findinpage-highlight]')).not.toBeNull();

    host.remove();
    document.body.innerHTML = '<p>next needle</p>';
    await search(pageSearch, 'needle');

    expect(shadowRoot.querySelector('style[data-findinpage-highlight]')).toBeNull();
  });

  it('highlights a shadow root inside a same-origin iframe with its own registry', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const frameDocument = iframe.contentDocument!;
    const frameWindow = iframe.contentWindow!;
    const frameGlobal = frameWindow as unknown as typeof globalThis;
    const registry = new Map<string, FakeHighlight>();
    Object.defineProperty(frameWindow, 'Highlight', { configurable: true, value: FakeHighlight });
    Object.defineProperty(frameGlobal.CSS, 'highlights', { configurable: true, value: registry });
    Object.defineProperty(frameGlobal.Element.prototype, 'getClientRects', {
      configurable: true,
      value: () => [{ width: 100, height: 20 }],
    });
    Object.defineProperty(frameGlobal.Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [{ width: 40, height: 16 }],
    });
    const host = frameDocument.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<p>iframe needle</p>';
    frameDocument.body.append(host);

    const { response } = await search(pageSearch, 'needle');

    expect(response.results).toHaveLength(1);
    expect(registry.get(ALL_HIGHLIGHTS_NAME)?.ranges).toHaveLength(1);
    expect(shadowRoot.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);
    pageSearch.clear();
    expect(shadowRoot.querySelector('style[data-findinpage-highlight]')).toBeNull();
  });

  it('resolves the exact repeated match selected on the page', async () => {
    document.body.innerHTML = '<p>for for <strong>for</strong> for</p>';
    const strongText = document.querySelector('strong')!.firstChild!;
    const selectedRange = document.createRange();
    selectedRange.selectNodeContents(strongText);
    const anchor = pageSearch.captureRangeSelection(selectedRange);

    const { response } = await search(pageSearch, 'for');

    expect(response.results).toHaveLength(4);
    expect(pageSearch.resolveRangeSelection(anchor)).toBe(response.results[2].id);
    expect(pageSearch.select(response.results[2].id, { scroll: false })).toBe(true);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('does not horizontally center a match that is already visible in the viewport', async () => {
    document.body.innerHTML = '<p>needle</p>';
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 300, right: 340, top: 700, bottom: 716, width: 40, height: 16,
      x: 300, y: 700, toJSON: () => ({}),
    });
    const { response } = await search(pageSearch, 'needle');

    pageSearch.select(response.results[0].id);

    expect(window.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 0 }));
  });

  it('uses the nearest viewport edge when a match is horizontally out of view', async () => {
    document.body.innerHTML = '<p>needle</p>';
    const left = window.innerWidth + 100;
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      left, right: left + 40, top: 700, bottom: 716, width: 40, height: 16,
      x: left, y: 700, toJSON: () => ({}),
    });
    const { response } = await search(pageSearch, 'needle');

    pageSearch.select(response.results[0].id);

    expect(window.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 140 }));
  });

  it('does not horizontally center a visible match inside a scrollable ancestor', async () => {
    document.body.innerHTML = '<div><p>needle</p></div>';
    const scroller = document.querySelector('div')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 200 },
      clientWidth: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 800 },
    });
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 500, top: 100, bottom: 300, width: 400, height: 200,
      x: 100, y: 100, toJSON: () => ({}),
    });
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 220, right: 260, top: 160, bottom: 176, width: 40, height: 16,
      x: 220, y: 160, toJSON: () => ({}),
    });
    const { response } = await search(pageSearch, 'needle');

    pageSearch.select(response.results[0].id);

    expect(scroller.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 0 }));
  });

  it('falls back to spans and restores the original text on clear', async () => {
    removeNativeHighlights();
    document.body.innerHTML = '<p>hello <strong>world</strong></p>';
    const originalText = document.body.textContent;
    const { response } = await search(pageSearch, 'hello world');
    expect(response.highlightMode).toBe('fallback');
    expect(document.querySelectorAll('[data-findinpage-fallback="match"]')).toHaveLength(2);
    expect(pageSearch.select(response.results[0].id, { scroll: false })).toBe(true);
    expect(document.querySelectorAll('[data-findinpage-fallback="active"]')).toHaveLength(2);
    pageSearch.hideHighlights();
    expect(document.querySelectorAll('[data-findinpage-fallback="hidden"]')).toHaveLength(2);
    pageSearch.clear();
    expect(document.querySelector('[data-findinpage-fallback]')).toBeNull();
    expect(document.body.textContent).toBe(originalText);
  });

  it('styles fallback spans inside a shadow root and restores its text', async () => {
    removeNativeHighlights();
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<p>shadow needle text</p>';
    document.body.append(host);
    const originalText = shadowRoot.textContent;

    const { response } = await search(pageSearch, 'needle');
    expect(response.highlightMode).toBe('fallback');
    expect(shadowRoot.querySelector('[data-findinpage-fallback="match"]')).not.toBeNull();
    expect(shadowRoot.querySelectorAll('style[data-findinpage-highlight]')).toHaveLength(1);

    pageSearch.clear();
    expect(shadowRoot.querySelector('[data-findinpage-fallback]')).toBeNull();
    expect(shadowRoot.querySelector('style[data-findinpage-highlight]')).toBeNull();
    expect(shadowRoot.textContent).toBe(originalText);
  });

  it('returns an error for an invalid regular expression', async () => {
    document.body.innerHTML = '<p>text</p>';
    const task = pageSearch.search('[', {
      caseSensitive: false,
      wholeWord: false,
      useRegularExpression: true,
    });
    expect((await task.done).error?.code).toBe('invalid_regular_expression');
  });
});
