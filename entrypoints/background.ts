import {
  getSearchSessionStorageKey,
  mergeSearchSession,
  normalizeSearchSession,
  type SearchSessionMessage,
  type SearchSessionResponse,
} from '@/lib/search-session';

export default defineBackground(() => {
  const updateQueues = new Map<number, Promise<void>>();

  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_FIND_IN_PAGE' });
    } catch {
      // Protected browser pages do not allow content-script messaging.
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
