import {
  getSearchSessionStorageKey,
  mergeSearchSession,
  normalizeSearchSession,
  type SearchSessionMessage,
  type SearchSessionResponse,
} from '@/lib/search-session';

type FindInPageResponse = {
  ok: true;
};

export default defineBackground(() => {
  const updateQueues = new Map<number, Promise<void>>();

  const toggleFindInPage = async (tabId: number) => {
    const response = await browser.tabs.sendMessage(tabId, {
      type: 'TOGGLE_FIND_IN_PAGE',
    }) as FindInPageResponse | undefined;
    if (!response?.ok) throw new Error('Find in Page content script did not respond.');
  };

  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) return;

    try {
      await toggleFindInPage(tab.id);
    } catch {
      try {
        if (browser.scripting?.executeScript) {
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
      } catch {
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
