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
    const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');

    if (location.origin === 'https://findin.page') {
      document.documentElement.dataset.findinpageExtension = '1';
      document.dispatchEvent(new CustomEvent('findinpage:extension-ready'));
    }

    const resolveColorScheme = (): 'light' | 'dark' => {
      const root = document.documentElement;
      const declaredScheme = root.style.colorScheme;

      if (
        declaredScheme === 'dark' ||
        root.classList.contains('dark') ||
        root.dataset.theme === 'dark'
      ) {
        return 'dark';
      }
      if (
        declaredScheme === 'light' ||
        root.classList.contains('light') ||
        root.dataset.theme === 'light'
      ) {
        return 'light';
      }
      return systemColorScheme.matches ? 'dark' : 'light';
    };

    const syncColorScheme = () => {
      shadowHostElement?.setAttribute('data-findinpage-color-scheme', resolveColorScheme());
    };

    const themeObserver = new MutationObserver(syncColorScheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    systemColorScheme.addEventListener('change', syncColorScheme);

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
      themeObserver.disconnect();
      systemColorScheme.removeEventListener('change', syncColorScheme);
    });

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
              searchOptionsStore={extensionSearchOptionsStore}
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
