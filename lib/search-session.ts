import {
  normalizeSearchOptions,
} from '@/entrypoints/content/search-options';
import type { SearchOptions } from '@/entrypoints/content/search';

export const SEARCH_SESSION_STORAGE_PREFIX = 'findinpage.search-session';
export const SEARCH_SESSION_VERSION = 1;

export interface SearchResultAnchor {
  before: string;
  match: string;
  after: string;
}

export interface SearchSession {
  version: typeof SEARCH_SESSION_VERSION;
  isOpen: boolean;
  query: string;
  searchOptions: SearchOptions;
  searchUrl?: string;
  activeResultIndex?: number;
  activeResultUrl?: string;
  activeResultAnchor?: SearchResultAnchor;
}

export type SearchSessionPatch = Partial<
  Pick<SearchSession, 'isOpen' | 'query' | 'searchOptions' | 'searchUrl'>
> & {
  activeResultIndex?: number | null;
  activeResultUrl?: string | null;
  activeResultAnchor?: SearchResultAnchor | null;
};

export type SearchSessionMessage =
  | { type: 'GET_SEARCH_SESSION' }
  | { type: 'UPDATE_SEARCH_SESSION'; patch: SearchSessionPatch };

export type SearchSessionResponse =
  | { ok: true; session?: SearchSession }
  | { ok: false };

export interface SearchSessionStore {
  load(): Promise<SearchSession | undefined>;
  update(patch: SearchSessionPatch): Promise<void>;
}

export function getSearchSessionStorageKey(tabId: number): string {
  return `${SEARCH_SESSION_STORAGE_PREFIX}.${tabId}`;
}

export function normalizePageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    return url.href;
  } catch {
    return undefined;
  }
}

export function normalizeSearchSession(value: unknown): SearchSession | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<SearchSession>;
  if (candidate.version !== SEARCH_SESSION_VERSION) return undefined;
  if (typeof candidate.isOpen !== 'boolean' || typeof candidate.query !== 'string') {
    return undefined;
  }

  const searchUrl = candidate.searchUrl === undefined
    ? undefined
    : normalizePageUrl(candidate.searchUrl);
  if (candidate.searchUrl !== undefined && !searchUrl) return undefined;
  const activeResultIndex = candidate.activeResultIndex;
  if (
    activeResultIndex !== undefined &&
    (!Number.isInteger(activeResultIndex) || activeResultIndex < 0)
  ) {
    return undefined;
  }
  const activeResultUrl = candidate.activeResultUrl === undefined
    ? undefined
    : normalizePageUrl(candidate.activeResultUrl);
  if (candidate.activeResultUrl !== undefined && !activeResultUrl) return undefined;
  const hasCompleteActiveResult =
    activeResultIndex !== undefined && activeResultUrl !== undefined;
  const activeResultAnchor = normalizeSearchResultAnchor(candidate.activeResultAnchor);

  return {
    version: SEARCH_SESSION_VERSION,
    isOpen: candidate.isOpen,
    query: candidate.query,
    searchOptions: normalizeSearchOptions(candidate.searchOptions),
    searchUrl,
    activeResultIndex: hasCompleteActiveResult ? activeResultIndex : undefined,
    activeResultUrl: hasCompleteActiveResult ? activeResultUrl : undefined,
    activeResultAnchor: hasCompleteActiveResult ? activeResultAnchor : undefined,
  };
}

function normalizeSearchResultAnchor(value: unknown): SearchResultAnchor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<SearchResultAnchor>;
  if (
    typeof candidate.before !== 'string' ||
    typeof candidate.match !== 'string' ||
    typeof candidate.after !== 'string' ||
    candidate.match.length === 0 ||
    candidate.before.length > 256 ||
    candidate.match.length > 256 ||
    candidate.after.length > 256
  ) return undefined;
  return {
    before: candidate.before,
    match: candidate.match,
    after: candidate.after,
  };
}

export function getRestoredActiveResultIndex(
  session: SearchSession,
  currentUrl: string | undefined,
): number | null | undefined {
  if (!currentUrl || session.searchUrl !== currentUrl) return undefined;
  if (session.activeResultUrl !== currentUrl) return null;
  return session.activeResultIndex ?? null;
}

export function createSearchSession(
  patch: SearchSessionPatch = {},
): SearchSession {
  return {
    version: SEARCH_SESSION_VERSION,
    isOpen: patch.isOpen ?? false,
    query: patch.query ?? '',
    searchOptions: normalizeSearchOptions(patch.searchOptions),
    searchUrl: patch.searchUrl ? normalizePageUrl(patch.searchUrl) : undefined,
    activeResultIndex: patch.activeResultIndex ?? undefined,
    activeResultUrl: patch.activeResultUrl
      ? normalizePageUrl(patch.activeResultUrl)
      : undefined,
    activeResultAnchor: patch.activeResultAnchor ?? undefined,
  };
}

export function mergeSearchSession(
  current: SearchSession | undefined,
  patch: SearchSessionPatch,
): SearchSession {
  const base = current ?? createSearchSession();
  const activeResultIndex = patch.activeResultIndex === null
    ? undefined
    : patch.activeResultIndex ?? base.activeResultIndex;
  const activeResultUrl = patch.activeResultUrl === null
    ? undefined
    : patch.activeResultUrl ?? base.activeResultUrl;
  const activeResultAnchor = patch.activeResultAnchor === null
    ? undefined
    : patch.activeResultAnchor ?? base.activeResultAnchor;
  return createSearchSession({
    ...base,
    ...patch,
    searchOptions: patch.searchOptions
      ? normalizeSearchOptions(patch.searchOptions)
      : base.searchOptions,
    activeResultIndex,
    activeResultUrl,
    activeResultAnchor,
  });
}
