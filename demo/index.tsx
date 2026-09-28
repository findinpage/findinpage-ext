import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  App,
  type FindInPageHandle,
  type SearchSelectionRequest,
} from '@/entrypoints/content/App';
import {
  normalizeSearchOptions,
  SEARCH_OPTIONS_STORAGE_KEY,
  serializeSearchOptions,
  type SearchOptionsStore,
} from '@/entrypoints/content/search-options';
import panelStyles from '@/assets/tailwind.css?inline';
import { getBrowserLocale, resolveLocale, type SupportedLocale } from '@/lib/i18n';
import {
  DEFAULT_SEARCH_OPTIONS,
  PageSearch,
  type SearchOptions,
  type SearchResponse,
  type SearchResultDiagnostic,
} from '@/entrypoints/content/search';

export interface FindInPageDemoOptions {
  installUrl: string;
  installLabel?: string;
  initialQuery?: string;
  locale?: SupportedLocale | string;
  testMode?: boolean;
}

export interface FindInPageDemoTestResult extends SearchResponse {
  diagnostics: SearchResultDiagnostic[];
}

export interface FindInPageDemoTestApi {
  begin(): void;
  search(query: string, options?: Partial<SearchOptions>): Promise<FindInPageDemoTestResult>;
  select(id: string, options?: { scroll?: boolean }): boolean;
  cancel(): void;
  clear(): void;
  end(): void;
}

export interface FindInPageDemoHandle {
  open(query?: string): void;
  navigate(direction: -1 | 1): void;
  search(selection: SearchSelectionRequest): void;
  close(): void;
  focus(): void;
  isOpen(): boolean;
  destroy(): void;
  testApi?: FindInPageDemoTestApi;
}

declare global {
  interface Window {
    FindInPageDemo?: {
      mount(options: FindInPageDemoOptions): FindInPageDemoHandle;
    };
  }
}

const demoSearchOptionsStore: SearchOptionsStore = {
  async load() {
    try {
      const value = localStorage.getItem(SEARCH_OPTIONS_STORAGE_KEY);
      return normalizeSearchOptions(value ? JSON.parse(value) : undefined);
    } catch {
      return normalizeSearchOptions(undefined);
    }
  },
  async save(options) {
    try {
      localStorage.setItem(
        SEARCH_OPTIONS_STORAGE_KEY,
        JSON.stringify(serializeSearchOptions(options)),
      );
    } catch {
      // Search remains usable with in-memory preferences when storage is unavailable.
    }
  },
};

function resolveColorScheme(): 'light' | 'dark' {
  const root = document.documentElement;
  if (
    root.style.colorScheme === 'dark' ||
    root.classList.contains('dark') ||
    root.dataset.theme === 'dark'
  ) {
    return 'dark';
  }
  if (
    root.style.colorScheme === 'light' ||
    root.classList.contains('light') ||
    root.dataset.theme === 'light'
  ) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function mount(options: FindInPageDemoOptions): FindInPageDemoHandle {
  const existing = document.querySelector<HTMLElement>('[data-findinpage-demo-host]');
  if (existing) {
    throw new Error('Find in Page demo is already mounted.');
  }

  const host = document.createElement('div');
  host.dataset.findinpageHost = 'true';
  host.dataset.findinpageDemoHost = 'true';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelStyles;
  const container = document.createElement('div');
  shadow.append(style, container);
  document.documentElement.append(host);

  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const syncColorScheme = () => {
    host.dataset.findinpageColorScheme = resolveColorScheme();
  };
  syncColorScheme();

  const ownerDocument = host.ownerDocument;
  const ThemeMutationObserver = ownerDocument.defaultView?.MutationObserver;
  const themeObserver = ThemeMutationObserver
    ? new ThemeMutationObserver(syncColorScheme)
    : undefined;
  try {
    themeObserver?.observe(ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
  } catch {
    // Some isolated browser worlds reject observing their wrapped document node.
  }
  colorScheme.addEventListener('change', syncColorScheme);

  let appHandle: FindInPageHandle | undefined;
  let openWhenReady = false;
  let openQueryWhenReady: string | undefined;
  let navigateWhenReady: -1 | 1 | undefined;
  let destroyed = false;
  const testSearch = options.testMode ? new PageSearch() : undefined;
  let restoreOpenAfterTest = false;
  const root = createRoot(container);

  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !appHandle?.isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (appHandle.closeTransient()) return;
    appHandle.close();
  };
  window.addEventListener('keydown', onEscape, { capture: true });

  root.render(
    <React.StrictMode>
      <App
        locale={options.locale ? resolveLocale([options.locale]) : getBrowserLocale()}
        initialQuery={options.initialQuery}
        searchOptionsStore={demoSearchOptionsStore}
        installAction={{
          label: options.installLabel ?? 'Add to browser',
          onClick() {
            if (options.installUrl.startsWith('#')) {
              appHandle?.close();
              document.querySelector(options.installUrl)?.scrollIntoView({ block: 'start' });
              return;
            }
            window.open(options.installUrl, '_blank', 'noopener,noreferrer');
          },
        }}
        onReady={(handle) => {
          appHandle = handle;
          if (navigateWhenReady) {
            const direction = navigateWhenReady;
            navigateWhenReady = undefined;
            openWhenReady = false;
            handle.navigate(direction);
          } else if (openWhenReady) {
            openWhenReady = false;
            const query = openQueryWhenReady;
            openQueryWhenReady = undefined;
            handle.openAndFocus(query);
          }
        }}
      />
    </React.StrictMode>,
  );

  const testApi: FindInPageDemoTestApi | undefined = testSearch ? {
    begin() {
      restoreOpenAfterTest = appHandle?.isOpen() ?? false;
      appHandle?.close();
      testSearch.clear();
    },
    async search(query, searchOptions = {}) {
      appHandle?.openAndFocus(query, searchOptions);
      const response = await testSearch.search(query, {
        ...DEFAULT_SEARCH_OPTIONS,
        ...searchOptions,
      }).done;
      return { ...response, diagnostics: testSearch.diagnose(response.results) };
    },
    select(id, selectOptions) {
      return testSearch.select(id, selectOptions);
    },
    cancel() {
      testSearch.cancelSearch();
    },
    clear() {
      testSearch.clear();
    },
    end() {
      testSearch.clear();
      if (restoreOpenAfterTest) appHandle?.openAndFocus();
      restoreOpenAfterTest = false;
    },
  } : undefined;

  const handle: FindInPageDemoHandle = {
    open(query) {
      if (destroyed) return;
      if (appHandle) appHandle.openAndFocus(query);
      else {
        openWhenReady = true;
        openQueryWhenReady = query;
      }
    },
    navigate(direction) {
      if (destroyed) return;
      if (appHandle) appHandle.navigate(direction);
      else {
        openWhenReady = true;
        navigateWhenReady = direction;
      }
    },
    search(selection) {
      if (destroyed || !appHandle?.isOpen()) return;
      appHandle.search(selection);
    },
    close() {
      appHandle?.close();
    },
    focus() {
      appHandle?.focus();
    },
    isOpen() {
      return appHandle?.isOpen() ?? false;
    },
    testApi,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('keydown', onEscape, { capture: true });
      themeObserver?.disconnect();
      colorScheme.removeEventListener('change', syncColorScheme);
      appHandle?.destroy();
      testSearch?.clear();
      root.unmount();
      host.remove();
    },
  };

  return handle;
}

window.FindInPageDemo = { mount };
