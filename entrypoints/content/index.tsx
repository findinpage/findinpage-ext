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
import {
  KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY,
  loadKeepHighlightsOnClose,
  normalizeKeepHighlightsOnClose,
} from '@/lib/highlight-preference';
import { logContentDebug } from '@/lib/debug-log';

type MountedUi = {
  root: Root;
};

type FindInPageMessage = {
  type: 'TOGGLE_FIND_IN_PAGE';
};

type FindInPageResponse = {
  ok: true;
};

type ToolbarToggleEventDetail = {
  handled: boolean;
};

const TOOLBAR_TOGGLE_EVENT = 'findinpage:toolbar-toggle';

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
  void (async () => {
    try {
      await browser.runtime.sendMessage<SearchSessionMessage, SearchSessionResponse>({
        type: 'UPDATE_SEARCH_SESSION',
        patch,
      });
    } catch {
      // The page can finish queued UI work after an extension reload invalidates its context.
    }
  })();
}

function LocalizedApp({
  initialKeepHighlightsOnClose,
  ...props
}: Omit<React.ComponentProps<typeof App>, 'locale' | 'keepHighlightsOnClose'> & {
  initialKeepHighlightsOnClose: boolean;
}) {
  const [locale, setLocale] = useState<SupportedLocale>(getBrowserLocale());
  const [keepHighlightsOnClose, setKeepHighlightsOnClose] = useState(
    initialKeepHighlightsOnClose,
  );

  useEffect(() => {
    let active = true;
    void loadLocalePreference().then((preference) => {
      if (active) setLocale(getEffectiveLocale(preference));
    });
    void loadKeepHighlightsOnClose().then((keepHighlights) => {
      if (active) setKeepHighlightsOnClose(keepHighlights);
    });
    const onStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (changes[LOCALE_STORAGE_KEY]) {
        setLocale(getEffectiveLocale(normalizeLocalePreference(changes[LOCALE_STORAGE_KEY].newValue)));
      }
      if (changes[KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY]) {
        setKeepHighlightsOnClose(normalizeKeepHighlightsOnClose(
          changes[KEEP_HIGHLIGHTS_ON_CLOSE_STORAGE_KEY].newValue,
        ));
      }
    };
    browser.storage.onChanged.addListener(onStorageChange);
    return () => {
      active = false;
      try {
        browser.storage.onChanged.removeListener(onStorageChange);
      } catch {
        // Extension reloads invalidate the API before React runs effect cleanup.
      }
    };
  }, []);

  return (
    <App
      {...props}
      locale={locale}
      keepHighlightsOnClose={keepHighlightsOnClose}
    />
  );
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    logContentDebug('content.main.start', {
      readyState: document.readyState,
      navigationType: navigationEntry?.type,
      visibility: document.visibilityState,
    });
    let contextInvalidated = false;
    let appHandle: FindInPageHandle | undefined;
    let shadowHostElement: HTMLElement | undefined;
    let shadowHostObserver: MutationObserver | undefined;
    let openWhenReady = false;
    let navigateWhenReady: -1 | 1 | undefined;
    let restoredSession = false;
    let sessionLoaded = false;
    let savedSession: SearchSession | undefined;
    let userInteracted = false;
    const currentUrl = normalizePageUrl(location.href);
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

    void loadThemePreference().then((preference) => {
      if (contextInvalidated) return;
      themePreference = preference;
      syncColorScheme();
    });

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

      const open = appHandle?.isOpen() ?? false;
      const inputFocused = appHandle?.isSearchInputFocused() ?? false;
      const plannedAction = !appHandle || !open
        ? 'open'
        : inputFocused
          ? 'close'
          : 'focus';

      logContentDebug('shortcut.find', {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        ready: Boolean(appHandle),
        open,
        inputFocused,
        action: plannedAction,
      });

      event.preventDefault();
      event.stopImmediatePropagation();
      userInteracted = true;

      if (appHandle) {
        appHandle.handleFindShortcut();
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

      logContentDebug('shortcut.navigation', {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        direction: event.shiftKey ? -1 : 1,
        ready: Boolean(appHandle),
        open: appHandle?.isOpen(),
      });

      event.preventDefault();
      event.stopImmediatePropagation();
      userInteracted = true;

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

      logContentDebug('shortcut.search-selection', {
        key: event.key,
        query: selectedText,
      });

      event.preventDefault();
      event.stopImmediatePropagation();
      appHandle.search({ text: selectedText, range: selection.getRangeAt(0).cloneRange() });
    };

    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !appHandle?.isOpen()) return;

      logContentDebug('shortcut.escape', { open: true });

      event.preventDefault();
      event.stopImmediatePropagation();
      if (appHandle.closeTransient()) return;
      appHandle.close();
    };

    window.addEventListener('keydown', onFindShortcut, { capture: true });
    window.addEventListener('keydown', onNavigationShortcut, { capture: true });
    window.addEventListener('keydown', onSearchSelectionShortcut, { capture: true });
    window.addEventListener('keydown', onGlobalKeyDown, { capture: true });

    const toggleFindInPage = (source: 'runtime-message' | 'dom-event') => {
      userInteracted = true;
      logContentDebug('panel.toggle', {
        source,
        ready: Boolean(appHandle),
        open: appHandle?.isOpen(),
      });
      if (appHandle) {
        appHandle.toggle();
        logContentDebug('panel.toggle.result', appHandle.getDebugState());
        ctx.setTimeout(() => {
          if (appHandle) logContentDebug('panel.toggle.settled', appHandle.getDebugState());
        }, 250);
      } else {
        openWhenReady = true;
      }
    };
    const onMessage = (
      message: FindInPageMessage,
      _sender: Browser.runtime.MessageSender,
      sendResponse: (response: FindInPageResponse) => void,
    ): true | undefined => {
      if (message.type !== 'TOGGLE_FIND_IN_PAGE') return;

      toggleFindInPage('runtime-message');
      sendResponse({ ok: true });
      return true;
    };
    const onToolbarToggle = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as ToolbarToggleEventDetail | undefined;
      if (!detail || typeof detail !== 'object') return;
      toggleFindInPage('dom-event');
      detail.handled = true;
    };
    browser.runtime.onMessage.addListener(onMessage);
    document.addEventListener(TOOLBAR_TOGGLE_EVENT, onToolbarToggle);
    logContentDebug('content.listeners.ready');

    ctx.onInvalidated(() => {
      logContentDebug('content.invalidated', {
        uiReady: Boolean(appHandle),
        panelOpen: appHandle?.isOpen(),
      });
      contextInvalidated = true;
      window.removeEventListener('keydown', onFindShortcut, { capture: true });
      window.removeEventListener('keydown', onNavigationShortcut, { capture: true });
      window.removeEventListener('keydown', onSearchSelectionShortcut, { capture: true });
      window.removeEventListener('keydown', onGlobalKeyDown, { capture: true });
      document.removeEventListener(TOOLBAR_TOGGLE_EVENT, onToolbarToggle);
      systemColorScheme.removeEventListener('change', syncColorScheme);
      shadowHostObserver?.disconnect();
      try {
        browser.runtime.onMessage.removeListener(onMessage);
        browser.storage.onChanged.removeListener(onThemeStorageChange);
      } catch {
        // Chrome already discarded extension listeners when the context was invalidated.
      }
    });

    const restoreLoadedSession = () => {
      if (
        contextInvalidated ||
        restoredSession ||
        userInteracted ||
        !sessionLoaded ||
        !appHandle ||
        !savedSession
      ) {
        return;
      }

      restoredSession = true;
      logContentDebug('session.restore', {
        isOpen: savedSession.isOpen,
        hasQuery: savedSession.query.length > 0,
        samePage: savedSession.searchUrl === currentUrl,
      });
      const restoreSamePage = Boolean(
        savedSession.searchUrl && currentUrl === savedSession.searchUrl,
      );
      appHandle.restoreSession(
        savedSession.query,
        savedSession.searchOptions,
        getRestoredActiveResultIndex(savedSession, currentUrl),
        savedSession.isOpen,
        savedSession.activeResultUrl === currentUrl
          ? savedSession.activeResultAnchor
          : undefined,
      );
      if (!savedSession.isOpen || !restoreSamePage || savedSession.query.length === 0) return;
      if (document.readyState === 'loading') {
        const runRestoredSearch = () => appHandle?.runPendingSearch();
        document.addEventListener('DOMContentLoaded', runRestoredSearch, { once: true });
        ctx.onInvalidated(() => {
          document.removeEventListener('DOMContentLoaded', runRestoredSearch);
        });
      } else {
        appHandle.runPendingSearch();
      }
    };

    logContentDebug('session.load.start');
    void loadSearchSession().then((session) => {
      savedSession = session;
      sessionLoaded = true;
      logContentDebug('session.load.complete', {
        found: Boolean(session),
        isOpen: session?.isOpen,
      });
      restoreLoadedSession();
    });

    logContentDebug('ui.create.start');
    const ui = await createShadowRootUi<MountedUi>(ctx, {
      name: 'findinpage-search',
      anchor: 'html',
      append: 'last',
      position: 'modal',
      zIndex: 2_147_483_647,
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        logContentDebug('ui.mount');
        shadowHostElement = shadowHost;
        shadowHostObserver?.disconnect();
        shadowHostObserver = new MutationObserver(() => {
          if (contextInvalidated || shadowHost.isConnected) return;
          document.documentElement.append(shadowHost);
          logContentDebug('ui.host.reattached');
        });
        shadowHostObserver.observe(document.documentElement, { childList: true });
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
              initialKeepHighlightsOnClose={false}
              searchOptionsStore={extensionSearchOptionsStore}
              onDebugEvent={logContentDebug}
              onOpenChange={(isOpen) => {
                logContentDebug('panel.open-change', { isOpen });
                updateSearchSession({ isOpen });
              }}
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
              onActiveResultChange={(activeResultIndex, activeResultAnchor) => updateSearchSession({
                activeResultIndex: activeResultIndex ?? null,
                activeResultUrl: activeResultIndex === undefined
                  ? null
                  : currentUrl,
                activeResultAnchor: activeResultIndex === undefined
                  ? null
                  : activeResultAnchor,
              })}
              onReady={(handle) => {
                appHandle = handle;
                logContentDebug('ui.ready', {
                  openWhenReady,
                  navigateWhenReady,
                  sessionLoaded,
                  userInteracted,
                });
                if (navigateWhenReady) {
                  const direction = navigateWhenReady;
                  navigateWhenReady = undefined;
                  openWhenReady = false;
                  handle.navigate(direction);
                } else if (openWhenReady) {
                  openWhenReady = false;
                  handle.openAndFocus();
                } else restoreLoadedSession();
                ctx.setTimeout(() => {
                  if (appHandle) logContentDebug('ui.ready.settled', appHandle.getDebugState());
                }, 250);
              }}
            />
          </React.StrictMode>,
        );
        return { root };
      },
      onRemove(mounted) {
        logContentDebug('ui.remove', {
          hadHandle: Boolean(appHandle),
          panelOpen: appHandle?.isOpen(),
        });
        appHandle?.destroy();
        appHandle = undefined;
        shadowHostObserver?.disconnect();
        shadowHostObserver = undefined;
        shadowHostElement = undefined;
        mounted?.root.unmount();
      },
    });

    const mountUi = () => {
      if (contextInvalidated) return;
      ui.mount();
      logContentDebug('ui.manual-mount.complete');
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountUi, { once: true });
      ctx.onInvalidated(() => document.removeEventListener('DOMContentLoaded', mountUi));
      logContentDebug('ui.mount.waiting-for-dom');
    } else {
      mountUi();
    }
  },
});
