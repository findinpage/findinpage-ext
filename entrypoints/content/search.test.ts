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
    document.body.innerHTML = '';
    pageSearch = new PageSearch();
    installNativeHighlights();
  });

  afterEach(() => pageSearch.clear());

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
