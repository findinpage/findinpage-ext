import {
  getSearchSessionStorageKey,
  mergeSearchSession,
  normalizeSearchSession,
  type SearchSessionMessage,
  type SearchSessionResponse,
} from '@/lib/search-session';
import {
  DEBUG_ENABLED_STORAGE_KEY,
  DEBUG_LOG_LIMIT,
  DEBUG_LOG_STORAGE_KEY,
  loadDebugEnabled,
  normalizeDebugEntries,
  type DebugEntry,
  type DebugLogMessage,
} from '@/lib/debug-log';

type FindInPageResponse = {
  ok: true;
};

const TOOLBAR_TOGGLE_EVENT = 'findinpage:toolbar-toggle';

export default defineBackground(() => {
  const updateQueues = new Map<number, Promise<void>>();
  let debugEnabled = false;
  let debugWriteQueue = Promise.resolve();

  void loadDebugEnabled().then((enabled) => {
    debugEnabled = enabled;
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[DEBUG_ENABLED_STORAGE_KEY]) {
      debugEnabled = changes[DEBUG_ENABLED_STORAGE_KEY].newValue === true;
    }
  });

  const appendDebugEntry = (entry: DebugEntry) => {
    if (!debugEnabled) return;
    debugWriteQueue = debugWriteQueue
      .catch(() => undefined)
      .then(async () => {
        const stored = await browser.storage.local.get(DEBUG_LOG_STORAGE_KEY);
        const entries = normalizeDebugEntries(stored[DEBUG_LOG_STORAGE_KEY]);
        entries.push(entry);
        await browser.storage.local.set({
          [DEBUG_LOG_STORAGE_KEY]: entries.slice(-DEBUG_LOG_LIMIT),
        });
      });
  };

  const logBackground = (event: string, details?: Record<string, unknown>, tabId?: number) => {
    appendDebugEntry({
      timestamp: new Date().toISOString(),
      source: 'background',
      event,
      details,
      tabId,
    });
  };

  browser.runtime.onMessage.addListener((message: DebugLogMessage, sender) => {
    if (message.type !== 'DEBUG_LOG') return undefined;
    appendDebugEntry({
      ...message.entry,
      timestamp: new Date().toISOString(),
      tabId: sender.tab?.id,
    });
    return undefined;
  });

  const toggleFindInPage = async (tabId: number) => {
    const response = await browser.tabs.sendMessage(tabId, {
      type: 'TOGGLE_FIND_IN_PAGE',
    }) as FindInPageResponse | undefined;
    if (!response?.ok) throw new Error('Find in Page content script did not respond.');
  };

  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) return;
    logBackground('toolbar.clicked', undefined, tab.id);

    try {
      await toggleFindInPage(tab.id);
      logBackground('toolbar.runtime-message.handled', undefined, tab.id);
    } catch (error) {
      logBackground('toolbar.runtime-message.failed', {
        error: error instanceof Error ? error.message : String(error),
      }, tab.id);
      try {
        if (browser.scripting?.executeScript) {
          const [{ result: handled }] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: (eventName) => {
              const detail = { handled: false };
              document.dispatchEvent(new CustomEvent(eventName, { detail }));
              return detail.handled;
            },
            args: [TOOLBAR_TOGGLE_EVENT],
          });
          if (handled) {
            logBackground('toolbar.dom-event.handled', undefined, tab.id);
            return;
          }

          logBackground('toolbar.inject.start', undefined, tab.id);
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['/content-scripts/content.js'],
          });
        } else {
          await browser.tabs.executeScript(tab.id, {
            file: '/content-scripts/content.js',
          });
        }
        await toggleFindInPage(tab.id);
        logBackground('toolbar.inject.handled', undefined, tab.id);
      } catch (fallbackError) {
        logBackground('toolbar.fallback.failed', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        }, tab.id);
        // Protected browser pages do not allow content-script injection or messaging.
      }
    }
  });

  browser.runtime.onMessage.addListener(
    (message: SearchSessionMessage, sender): Promise<SearchSessionResponse> | undefined => {
      if (
        (message.type !== 'GET_SEARCH_SESSION' && message.type !== 'UPDATE_SEARCH_SESSION') ||
        sender.tab?.id === undefined
      ) {
        return undefined;
      }

      const tabId = sender.tab.id;
      const storageKey = getSearchSessionStorageKey(tabId);
      if (message.type === 'GET_SEARCH_SESSION') {
        logBackground('session.get', undefined, tabId);
        const pendingUpdate = updateQueues.get(tabId) ?? Promise.resolve();
        return pendingUpdate
          .catch(() => undefined)
          .then(() => browser.storage.session.get(storageKey))
          .then((stored) => ({
            ok: true as const,
            session: normalizeSearchSession(stored[storageKey]),
          }))
          .catch(() => ({ ok: false as const }));
      }

      const previousUpdate = updateQueues.get(tabId) ?? Promise.resolve();
      logBackground('session.update.queued', { patch: message.patch }, tabId);
      const update = previousUpdate
        .catch(() => undefined)
        .then(async () => {
          const stored = await browser.storage.session.get(storageKey);
          const current = normalizeSearchSession(stored[storageKey]);
          const next = normalizeSearchSession(mergeSearchSession(current, message.patch));
          if (!next) throw new Error('Invalid search session patch.');
          await browser.storage.session.set({
            [storageKey]: next,
          });
          logBackground('session.update.saved', { isOpen: next.isOpen }, tabId);
        });
      updateQueues.set(tabId, update);
      const cleanUpQueue = () => {
        if (updateQueues.get(tabId) === update) updateQueues.delete(tabId);
      };
      void update.then(cleanUpQueue, cleanUpQueue);
      return update
        .then(() => ({ ok: true as const }))
        .catch(() => ({ ok: false as const }));
    },
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    const pendingUpdate = updateQueues.get(tabId) ?? Promise.resolve();
    updateQueues.delete(tabId);
    void pendingUpdate
      .catch(() => undefined)
      .then(() => browser.storage.session.remove(getSearchSessionStorageKey(tabId)))
      .catch(() => undefined);
  });
});
