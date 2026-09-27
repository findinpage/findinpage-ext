import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, type FindInPageHandle } from '@/entrypoints/content/App';
import {
  normalizeSearchOptions,
  SEARCH_OPTIONS_STORAGE_KEY,
  serializeSearchOptions,
  type SearchOptionsStore,
} from '@/entrypoints/content/search-options';
import panelStyles from '@/assets/tailwind.css?inline';

export interface FindInPageDemoOptions {
  installUrl: string;
  installLabel?: string;
  initialQuery?: string;
}

export interface FindInPageDemoHandle {
  open(): void;
  close(): void;
  focus(): void;
  isOpen(): boolean;
  destroy(): void;
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

  const themeObserver = new MutationObserver(syncColorScheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  colorScheme.addEventListener('change', syncColorScheme);

  let appHandle: FindInPageHandle | undefined;
  let openWhenReady = false;
  let destroyed = false;
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
          if (openWhenReady) {
            openWhenReady = false;
            handle.openAndFocus();
          }
        }}
      />
    </React.StrictMode>,
  );

  const handle: FindInPageDemoHandle = {
    open() {
      if (destroyed) return;
      if (appHandle) appHandle.openAndFocus();
      else openWhenReady = true;
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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('keydown', onEscape, { capture: true });
      themeObserver.disconnect();
      colorScheme.removeEventListener('change', syncColorScheme);
      appHandle?.destroy();
      root.unmount();
      host.remove();
    },
  };

  return handle;
}

window.FindInPageDemo = { mount };
