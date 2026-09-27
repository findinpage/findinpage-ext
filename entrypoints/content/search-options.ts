import {
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
} from './search';

export const SEARCH_OPTIONS_STORAGE_KEY = 'findinpage.search-options';
export const SEARCH_OPTIONS_STORAGE_VERSION = 1;

interface StoredSearchOptions extends SearchOptions {
  version: typeof SEARCH_OPTIONS_STORAGE_VERSION;
}

export interface SearchOptionsStore {
  load(): Promise<SearchOptions>;
  save(options: SearchOptions): Promise<void>;
}

export function normalizeSearchOptions(value: unknown): SearchOptions {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SEARCH_OPTIONS };
  const candidate = value as Partial<StoredSearchOptions>;
  return {
    caseSensitive:
      typeof candidate.caseSensitive === 'boolean'
        ? candidate.caseSensitive
        : DEFAULT_SEARCH_OPTIONS.caseSensitive,
    wholeWord:
      typeof candidate.wholeWord === 'boolean'
        ? candidate.wholeWord
        : DEFAULT_SEARCH_OPTIONS.wholeWord,
    useRegularExpression:
      typeof candidate.useRegularExpression === 'boolean'
        ? candidate.useRegularExpression
        : DEFAULT_SEARCH_OPTIONS.useRegularExpression,
  };
}

export function serializeSearchOptions(options: SearchOptions): StoredSearchOptions {
  return {
    version: SEARCH_OPTIONS_STORAGE_VERSION,
    ...normalizeSearchOptions(options),
  };
}
