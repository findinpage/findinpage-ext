import {
  CLOSED_ACTIVE_HIGHLIGHT_NAME,
  CLOSED_ALL_HIGHLIGHTS_NAME,
  PageSearch,
} from './content/search';
import {
  CLOSED_SHADOW_CHANNEL,
  isClosedShadowCommand,
  type ClosedShadowEvent,
} from './content/closed-shadow-protocol';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  allFrames: true,
  world: 'MAIN',

  main() {
    const capturedRoots = new Set<ShadowRoot>();
    const rootsByHost = new WeakMap<Element, ShadowRoot>();
    const observers = new Map<ShadowRoot, MutationObserver>();
    const clients = new Map<string, { frameId: string; taskId?: number }>();
    const originalAttachShadow = Element.prototype.attachShadow;

    const post = (event: ClosedShadowEvent) => {
      window.top?.postMessage(event, '*');
    };
    const invalidate = () => {
      for (const [clientId, client] of clients) {
        post({
          channel: CLOSED_SHADOW_CHANNEL,
          direction: 'response',
          clientId,
          frameId: client.frameId,
          type: 'invalidated',
        });
      }
    };
    const observe = (root: ShadowRoot) => {
      const observer = new MutationObserver((records) => {
        if (records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].every((node) =>
            !(node instanceof Element) ||
            (!node.hasAttribute('data-findinpage-fallback') &&
              !node.hasAttribute('data-findinpage-control-mirror'))))) {
          invalidate();
        }
      });
      observer.observe(root, { childList: true, characterData: true, subtree: true });
      observers.set(root, observer);
    };

    const patchedAttachShadow = function attachShadow(this: Element, init: ShadowRootInit): ShadowRoot {
      const root = originalAttachShadow.call(this, init);
      if (init.mode === 'closed') {
        capturedRoots.add(root);
        rootsByHost.set(this, root);
        observe(root);
        invalidate();
      }
      return root;
    };
    Element.prototype.attachShadow = patchedAttachShadow;

    const getTopLevelRoots = () => [...capturedRoots].filter((root) => {
      if (!root.host.isConnected) return false;
      const parentRoot = root.host.getRootNode();
      return !(parentRoot instanceof ShadowRoot && capturedRoots.has(parentRoot));
    });
    const search = new PageSearch({
      getRoots: getTopLevelRoots,
      getShadowRoot: (element) => element.shadowRoot ?? rootsByHost.get(element),
      activeHighlightName: CLOSED_ACTIVE_HIGHLIGHT_NAME,
      allHighlightsName: CLOSED_ALL_HIGHLIGHTS_NAME,
    });

    const onControlChange = (event: Event) => {
      const path = event.composedPath();
      if (path.some((node) => node instanceof Element && rootsByHost.has(node))) invalidate();
      const targetRoot = event.target instanceof Node ? event.target.getRootNode() : undefined;
      if (targetRoot instanceof ShadowRoot && capturedRoots.has(targetRoot)) invalidate();
    };
    document.addEventListener('input', onControlChange, true);
    document.addEventListener('change', onControlChange, true);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.top || !isClosedShadowCommand(event.data)) return;
      const command = event.data;
      const client = clients.get(command.clientId);
      if (client && client.frameId !== command.frameId) return;
      clients.set(command.clientId, { frameId: command.frameId, taskId: command.type === 'search' ? command.taskId : client?.taskId });

      if (command.type === 'search') {
        const task = search.search(command.query, command.options, (response) => {
          post({
            channel: CLOSED_SHADOW_CHANNEL,
            direction: 'response',
            clientId: command.clientId,
            frameId: command.frameId,
            type: 'search-update',
            taskId: command.taskId,
            response,
          });
        });
        clients.set(command.clientId, { frameId: command.frameId, taskId: task.id });
      } else if (command.type === 'cancel') {
        search.cancelSearch();
      } else if (command.type === 'select') {
        search.select(command.resultId, { scroll: command.scroll });
      } else if (command.type === 'hide') {
        search.hideHighlights();
      } else if (command.type === 'restore') {
        search.restoreHighlights(command.resultId);
      } else if (command.type === 'clear') {
        search.clear();
        clients.delete(command.clientId);
      }
    };
    window.addEventListener('message', onMessage);

    window.addEventListener('pagehide', () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('input', onControlChange, true);
      document.removeEventListener('change', onControlChange, true);
      if (Element.prototype.attachShadow === patchedAttachShadow) {
        Element.prototype.attachShadow = originalAttachShadow;
      }
      for (const observer of observers.values()) observer.disconnect();
      search.clear();
    }, { once: true });
  },
});
