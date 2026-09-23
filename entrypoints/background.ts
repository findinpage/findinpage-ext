export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_PAGESIFT' });
    } catch {
      // Protected browser pages do not allow content-script messaging.
    }
  });
});
