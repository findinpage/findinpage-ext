import React, { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, type FindInPageHandle } from './App';
import {
  normalizeSearchOptions,
  SEARCH_OPTIONS_STORAGE_KEY,
  serializeSearchOptions,
  type SearchOptionsStore,
} from './search-options';
import '@/assets/tailwind.css';
import {
  getBrowserLocale,
  getEffectiveLocale,
  loadLocalePreference,
  LOCALE_STORAGE_KEY,
  normalizeLocalePreference,
  type SupportedLocale,
} from '@/lib/i18n';
import {
  getRestoredActiveResultIndex,
  normalizePageUrl,
  type SearchSession,
  type SearchSessionMessage,
  type SearchSessionPatch,
  type SearchSessionResponse,
} from '@/lib/search-session';
import {
  loadThemePreference,
  normalizeThemePreference,
  resolveColorScheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/lib/theme';

type MountedUi = {
  root: Root;
};

type FindInPageMessage = {
  type: 'TOGGLE_FIND_IN_PAGE';
};

const extensionSearchOptionsStore: SearchOptionsStore = {
  async load() {
    try {
      const stored = await browser.storage.local.get(SEARCH_OPTIONS_STORAGE_KEY);
      return normalizeSearchOptions(stored[SEARCH_OPTIONS_STORAGE_KEY]);
    } catch {
      return normalizeSearchOptions(undefined);
    }
  },
  async save(options) {
    try {
      await browser.storage.local.set({
        [SEARCH_OPTIONS_STORAGE_KEY]: serializeSearchOptions(options),
      });
    } catch {
      // Search remains usable with in-memory preferences when storage is unavailable.
    }
  },
};

async function loadSearchSession(): Promise<SearchSession | undefined> {
  try {
    const response = await browser.runtime.sendMessage<
      SearchSessionMessage,
      SearchSessionResponse
    >({ type: 'GET_SEARCH_SESSION' });
    return response?.ok ? response.session : undefined;
  } catch {
    return undefined;
  }
}

function updateSearchSession(patch: SearchSessionPatch): void {
  void browser.runtime.sendMessage<SearchSessionMessage, SearchSessionResponse>({
    type: 'UPDATE_SEARCH_SESSION',
    patch,
  }).catch(() => undefined);
}

function LocalizedApp(props: Omit<React.ComponentProps<typeof App>, 'locale'>) {
  const [locale, setLocale] = useState<SupportedLocale>(getBrowserLocale());

  useEffect(() => {
    let active = true;
    void loadLocalePreference().then((preference) => {
      if (active) setLocale(getEffectiveLocale(preference));
    });
    const onStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes[LOCALE_STORAGE_KEY]) return;
      setLocale(getEffectiveLocale(normalizeLocalePreference(changes[LOCALE_STORAGE_KEY].newValue)));
    };
    browser.storage.onChanged.addListener(onStorageChange);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onStorageChange);
    };
  }, []);

  return <App {...props} locale={locale} />;
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    let appHandle: FindInPageHandle | undefined;
    let shadowHostElement: HTMLElement | undefined;
    let openWhenReady = false;
    let navigateWhenReady: -1 | 1 | undefined;
    let restoredSession = false;
    const currentUrl = normalizePageUrl(location.href);
    const initialStatePromise = Promise.all([
      loadSearchSession(),
      extensionSearchOptionsStore.load(),
      loadThemePreference(),
    ]);
    const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    let themePreference: ThemePreference = 'system';

    if (location.origin === 'https://findin.page') {
      document.documentElement.dataset.findinpageExtension = '1';
      document.dispatchEvent(new CustomEvent('findinpage:extension-ready'));
    }

    const syncColorScheme = () => {
      shadowHostElement?.setAttribute(
        'data-findinpage-color-scheme',
        resolveColorScheme(themePreference, systemColorScheme.matches),
      );
    };

    const onThemeStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes[THEME_STORAGE_KEY]) return;
      themePreference = normalizeThemePreference(changes[THEME_STORAGE_KEY].newValue);
      syncColorScheme();
    };

    systemColorScheme.addEventListener('change', syncColorScheme);
    browser.storage.onChanged.addListener(onThemeStorageChange);

    const onFindShortcut = (event: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const primaryModifier = isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      const isFindShortcut =
        primaryModifier &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing &&
        event.key.toLowerCase() === 'f';

      if (!isFindShortcut) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (appHandle) {
        appHandle.toggle();
      } else {
        openWhenReady = true;
      }
    };

    const onNavigationShortcut = (event: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const primaryModifier = isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      const isNavigationShortcut =
        primaryModifier &&
        !event.altKey &&
        !event.isComposing &&
        event.key.toLowerCase() === 'g';

      if (!isNavigationShortcut) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const direction = event.shiftKey ? -1 : 1;
      if (appHandle) {
        appHandle.navigate(direction);
      } else {
        navigateWhenReady = direction;
      }
    };

    const onSearchSelectionShortcut = (event: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const primaryModifier = isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      const isSearchSelectionShortcut =
        primaryModifier &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing &&
        event.key.toLowerCase() === 'e';

      if (!isSearchSelectionShortcut || !appHandle?.isOpen()) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString() ?? '';
      if (!selectedText.trim() || !selection?.rangeCount) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      appHandle.search({ text: selectedText, range: selection.getRangeAt(0).cloneRange() });
    };

    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !appHandle?.isOpen()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (appHandle.closeTransient()) return;
      appHandle.close();
    };

    const keepFindInPageFocused = (event: FocusEvent) => {
      if (!appHandle?.isOpen() || !shadowHostElement) return;
      const target = event.target;
      if (
        target === shadowHostElement ||
        (target instanceof Node && shadowHostElement.contains(target))
      ) {
        return;
      }

      // Page dialogs often install focus traps. While Find in Page is open, keep its
      // search input as the active focus boundary and hide the escaped event.
      event.stopImmediatePropagation();
      appHandle.focus();
    };

    window.addEventListener('keydown', onFindShortcut, { capture: true });
    window.addEventListener('keydown', onNavigationShortcut, { capture: true });
    window.addEventListener('keydown', onSearchSelectionShortcut, { capture: true });
    window.addEventListener('keydown', onGlobalKeyDown, { capture: true });
    window.addEventListener('focus', keepFindInPageFocused, { capture: true });
    window.addEventListener('focusin', keepFindInPageFocused, { capture: true });

    const onMessage = (message: FindInPageMessage) => {
      if (message.type !== 'TOGGLE_FIND_IN_PAGE') return;

      if (appHandle) {
        appHandle.toggle();
      } else {
        openWhenReady = true;
      }
    };
    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      window.removeEventListener('keydown', onFindShortcut, { capture: true });
      window.removeEventListener('keydown', onNavigationShortcut, { capture: true });
      window.removeEventListener('keydown', onSearchSelectionShortcut, { capture: true });
      window.removeEventListener('keydown', onGlobalKeyDown, { capture: true });
      window.removeEventListener('focus', keepFindInPageFocused, { capture: true });
      window.removeEventListener('focusin', keepFindInPageFocused, { capture: true });
      browser.runtime.onMessage.removeListener(onMessage);
      systemColorScheme.removeEventListener('change', syncColorScheme);
      browser.storage.onChanged.removeListener(onThemeStorageChange);
    });

    const [savedSession, globalSearchOptions, savedThemePreference] = await initialStatePromise;
    themePreference = savedThemePreference;
    const restoreSamePage = Boolean(
      savedSession?.isOpen &&
      savedSession.searchUrl &&
      currentUrl === savedSession.searchUrl,
    );
    const initialSearchOptions = restoreSamePage
      ? savedSession!.searchOptions
      : globalSearchOptions;

    const ui = await createShadowRootUi<MountedUi>(ctx, {
      name: 'findinpage-search',
      position: 'modal',
      zIndex: 2_147_483_647,
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        shadowHostElement = shadowHost;
        shadowHost.dataset.findinpageHost = 'true';
        syncColorScheme();
        shadowHost.style.margin = '0';
        shadowHost.style.padding = '0';
        shadowHost.style.border = '0';
        shadowHost.style.background = 'transparent';
        shadowHost.style.fontSize = '13px';
        shadowHost.style.lineHeight = 'normal';
        shadowHost.style.pointerEvents = 'none';
        shadowHost.style.setProperty('text-size-adjust', 'none');
        shadowHost.style.setProperty('-webkit-text-size-adjust', 'none');
        shadowHost.style.setProperty('zoom', '1');

        if ('showPopover' in shadowHost) {
          shadowHost.setAttribute('popover', 'manual');
          shadowHost.showPopover();
        }

        const root = createRoot(container);
        root.render(
          <React.StrictMode>
            <LocalizedApp
              initialQuery={savedSession?.query ?? ''}
              initialSearchOptions={initialSearchOptions}
              searchOptionsStore={extensionSearchOptionsStore}
              onOpenChange={(isOpen) => updateSearchSession({ isOpen })}
              onQueryChange={(query, searchOptions) => updateSearchSession({
                query,
                searchOptions,
                searchUrl: currentUrl,
              })}
              onSearchOptionsChange={(searchOptions) => updateSearchSession({
                searchOptions,
                searchUrl: currentUrl,
              })}
              onSearchExecuted={(query, searchOptions) => updateSearchSession({
                query,
                searchOptions,
                searchUrl: currentUrl,
              })}
              onActiveResultChange={(activeResultIndex) => updateSearchSession({
                activeResultIndex: activeResultIndex ?? null,
                activeResultUrl: activeResultIndex === undefined
                  ? null
                  : currentUrl,
              })}
              onReady={(handle) => {
                appHandle = handle;
                if (navigateWhenReady) {
                  const direction = navigateWhenReady;
                  navigateWhenReady = undefined;
                  openWhenReady = false;
                  handle.navigate(direction);
                } else if (openWhenReady) {
                  openWhenReady = false;
                  handle.openAndFocus();
                } else if (savedSession?.isOpen && !restoredSession) {
                  restoredSession = true;
                  handle.restoreSession(
                    savedSession.query,
                    initialSearchOptions,
                    getRestoredActiveResultIndex(savedSession, currentUrl),
                  );
                  if (restoreSamePage && savedSession.query.length > 0) {
                    if (document.readyState === 'loading') {
                      const runRestoredSearch = () => handle.runPendingSearch();
                      document.addEventListener('DOMContentLoaded', runRestoredSearch, {
                        once: true,
                      });
                      ctx.onInvalidated(() => {
                        document.removeEventListener('DOMContentLoaded', runRestoredSearch);
                      });
                    } else {
                      handle.runPendingSearch();
                    }
                  }
                }
              }}
            />
          </React.StrictMode>,
        );
        return { root };
      },
      onRemove(mounted) {
        appHandle?.destroy();
        appHandle = undefined;
        shadowHostElement = undefined;
        mounted?.root.unmount();
      },
    });

    ui.autoMount();
  },
});
