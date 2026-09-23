import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, type FindInPageHandle } from './App';
import '@/assets/tailwind.css';

type MountedUi = {
  root: Root;
};

type FindInPageMessage = {
  type: 'TOGGLE_FIND_IN_PAGE';
};

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    let appHandle: FindInPageHandle | undefined;
    let shadowHostElement: HTMLElement | undefined;
    let openWhenReady = false;
    const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');

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

    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !appHandle?.isOpen()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
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
            <App
              onReady={(handle) => {
                appHandle = handle;
                if (openWhenReady) {
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
