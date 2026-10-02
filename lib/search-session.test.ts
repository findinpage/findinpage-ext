import { describe, expect, it } from 'vitest';
import {
  createSearchSession,
  getRestoredActiveResultIndex,
  mergeSearchSession,
  normalizePageUrl,
  normalizeSearchSession,
  SEARCH_SESSION_VERSION,
} from './search-session';

describe('search session state', () => {
  it('normalizes fragments while preserving query strings', () => {
    expect(normalizePageUrl('https://example.com/path?q=one#result')).toBe(
      'https://example.com/path?q=one',
    );
    expect(normalizePageUrl('https://example.com/path?q=two')).not.toBe(
      normalizePageUrl('https://example.com/path?q=one'),
    );
    expect(normalizePageUrl('chrome://settings')).toBeUndefined();
  });

  it('rejects malformed session state', () => {
    expect(normalizeSearchSession(undefined)).toBeUndefined();
    expect(normalizeSearchSession({
      version: SEARCH_SESSION_VERSION,
      isOpen: 'yes',
      query: 'needle',
    })).toBeUndefined();
    expect(normalizeSearchSession({
      version: SEARCH_SESSION_VERSION,
      isOpen: true,
      query: 'needle',
      searchUrl: 'not a url',
    })).toBeUndefined();
    expect(normalizeSearchSession({
      version: SEARCH_SESSION_VERSION,
      isOpen: true,
      query: 'needle',
      activeResultIndex: -1,
    })).toBeUndefined();
  });

  it('merges patches without discarding the rest of the tab session', () => {
    const initial = createSearchSession({
      isOpen: true,
      query: 'needle',
      searchOptions: {
        caseSensitive: true,
        wholeWord: false,
        useRegularExpression: false,
      },
      searchUrl: 'https://example.com/page#match',
      activeResultIndex: 2,
      activeResultUrl: 'https://example.com/page#result-3',
      activeResultAnchor: { before: 'before', match: 'needle', after: 'after' },
    });

    expect(mergeSearchSession(initial, { isOpen: false })).toEqual({
      ...initial,
      isOpen: false,
    });
    expect(mergeSearchSession(initial, { activeResultIndex: null }).activeResultIndex)
      .toBeUndefined();
    expect(initial.searchUrl).toBe('https://example.com/page');
    expect(initial.activeResultUrl).toBe('https://example.com/page');
  });

  it('keeps a bounded text excerpt with the active result', () => {
    const session = normalizeSearchSession({
      version: SEARCH_SESSION_VERSION,
      isOpen: true,
      query: 'needle',
      searchOptions: {},
      searchUrl: 'https://example.com/page',
      activeResultIndex: 2,
      activeResultUrl: 'https://example.com/page',
      activeResultAnchor: { before: 'before', match: 'needle', after: 'after' },
    });

    expect(session?.activeResultAnchor).toEqual({
      before: 'before',
      match: 'needle',
      after: 'after',
    });
  });

  it('does not restore an index that has no same-page URL binding', () => {
    const legacy = normalizeSearchSession({
      version: SEARCH_SESSION_VERSION,
      isOpen: true,
      query: 'needle',
      searchOptions: {},
      searchUrl: 'https://example.com/new-page',
      activeResultIndex: 4,
    });

    expect(legacy?.activeResultIndex).toBeUndefined();
    expect(legacy?.activeResultUrl).toBeUndefined();
  });

  it('does not restore an old-page index after the search URL moves to a new page', () => {
    const session = createSearchSession({
      isOpen: true,
      query: 'needle',
      searchUrl: 'https://example.com/new-page',
      activeResultIndex: 4,
      activeResultUrl: 'https://example.com/old-page',
    });

    expect(getRestoredActiveResultIndex(session, 'https://example.com/new-page'))
      .toBeNull();
    expect(getRestoredActiveResultIndex(
      createSearchSession({
        ...session,
        activeResultUrl: 'https://example.com/new-page',
      }),
      'https://example.com/new-page',
    )).toBe(4);
  });
});
