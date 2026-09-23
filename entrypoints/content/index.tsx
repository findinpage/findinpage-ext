import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, type PageSiftHandle } from './App';
import '@/assets/tailwind.css';

type MountedUi = {
  root: Root;
};

type PageSiftMessage = {
  type: 'TOGGLE_PAGESIFT';
};

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    let appHandle: PageSiftHandle | undefined;
    let openWhenReady = false;

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

    window.addEventListener('keydown', onFindShortcut, { capture: true });

    const onMessage = (message: PageSiftMessage) => {
      if (message.type !== 'TOGGLE_PAGESIFT') return;

      if (appHandle) {
        appHandle.toggle();
      } else {
        openWhenReady = true;
      }
    };
    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      window.removeEventListener('keydown', onFindShortcut, { capture: true });
      browser.runtime.onMessage.removeListener(onMessage);
    });

    const ui = await createShadowRootUi<MountedUi>(ctx, {
      name: 'pagesift-search',
      position: 'modal',
      zIndex: 2_147_483_647,
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        shadowHost.style.margin = '0';
        shadowHost.style.padding = '0';
        shadowHost.style.border = '0';
        shadowHost.style.background = 'transparent';
        shadowHost.style.pointerEvents = 'none';

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
        mounted?.root.unmount();
      },
    });

    ui.autoMount();
  },
});
