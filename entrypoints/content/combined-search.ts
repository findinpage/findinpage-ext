import {
  PageSearch,
  type HighlightMode,
  type RangeSelectionAnchor,
  type SearchOptions,
  type SearchResponse,
  type SearchResultView,
  type SearchTask,
  type SelectionAnchor,
} from './search';
import {
  CLOSED_SHADOW_CHANNEL,
  isClosedShadowEvent,
  type ClosedShadowCommand,
} from './closed-shadow-protocol';

interface FrameTarget {
  id: string;
  window: Window;
}

interface RemoteLocation {
  frame: FrameTarget;
  rawId: string;
  signature: string;
}

type CombinedSelectionAnchor =
  | { kind: 'page'; anchor: SelectionAnchor }
  | { kind: 'closed'; signature: string };

function resultSignature(result: SearchResultView): string {
  return `${result.before}\u0000${result.match}\u0000${result.after}`;
}

function getFrameTargets(): FrameTarget[] {
  const targets: FrameTarget[] = [];
  let nextId = 0;
  const visit = (ownerWindow: Window) => {
    targets.push({ id: String(nextId++), window: ownerWindow });
    let ownerDocument: Document;
    try {
      ownerDocument = ownerWindow.document;
    } catch {
      return;
    }
    for (const frame of ownerDocument.querySelectorAll('iframe')) {
      try {
        if (frame.contentDocument && frame.contentWindow) visit(frame.contentWindow);
      } catch {
        // Cross-origin frames are intentionally excluded.
      }
    }
  };
  visit(window);
  return targets;
}

function scrollFrameIntoView(frameWindow: Window): void {
  let current: Window | null = frameWindow;
  while (current && current !== window) {
    try {
      const frame = current.frameElement;
      if (!frame) break;
      frame.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      current = frame.ownerDocument.defaultView;
    } catch {
      break;
    }
  }
}

export class CombinedPageSearch {
  private readonly page = new PageSearch();
  private readonly clientId = crypto.randomUUID();
  private remoteLocations = new Map<string, RemoteLocation>();
  private frames: FrameTarget[] = [];
  private runId = 0;
  private activeTask?: { id: number; cancelled: boolean };
  private lastQuery = '';
  private lastOptions?: SearchOptions;
  private lastCallback?: (response: SearchResponse) => void;
  private lastPageResponse?: SearchResponse;
  private lastRemoteResponses = new Map<string, SearchResponse>();
  private refreshTimer?: number;
  private responseTimer?: number;

  constructor() {
    window.addEventListener('message', this.handleMessage);
  }

  search(query: string, options: SearchOptions, onUpdate?: (response: SearchResponse) => void): SearchTask {
    this.cancelSearch();
    const state = { id: ++this.runId, cancelled: false };
    this.activeTask = state;
    this.lastQuery = query;
    this.lastOptions = options;
    this.lastCallback = onUpdate;
    this.lastPageResponse = undefined;
    this.lastRemoteResponses.clear();
    this.remoteLocations.clear();
    this.frames = getFrameTargets();

    const pageTask = this.page.search(query, options, (response) => {
      if (state.cancelled || this.activeTask !== state) return;
      this.lastPageResponse = response;
      onUpdate?.(this.mergeResponse());
    });
    for (const frame of this.frames) this.post(frame, {
      channel: CLOSED_SHADOW_CHANNEL,
      direction: 'request',
      clientId: this.clientId,
      frameId: frame.id,
      type: 'search',
      taskId: state.id,
      query,
      options,
    });
    this.responseTimer = window.setTimeout(() => {
      this.responseTimer = undefined;
      if (state.cancelled || this.activeTask !== state) return;
      this.frames = this.frames.filter((frame) => this.lastRemoteResponses.has(frame.id));
      onUpdate?.(this.mergeResponse());
    }, 200);

    const done = pageTask.done.then(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      return this.mergeResponse(true);
    });
    return {
      id: state.id,
      cancel: () => {
        state.cancelled = true;
        pageTask.cancel();
        this.cancelRemote(state.id);
      },
      done,
    };
  }

  cancelSearch(): void {
    if (this.activeTask) {
      this.activeTask.cancelled = true;
      this.cancelRemote(this.activeTask.id);
    }
    this.activeTask = undefined;
    this.page.cancelSearch();
  }

  captureSelection(id: string): CombinedSelectionAnchor | undefined {
    const remote = this.remoteLocations.get(id);
    if (remote) return { kind: 'closed', signature: remote.signature };
    const anchor = this.page.captureSelection(id);
    return anchor ? { kind: 'page', anchor } : undefined;
  }

  resolveSelection(anchor: CombinedSelectionAnchor): string | undefined {
    if (anchor.kind === 'page') return this.page.resolveSelection(anchor.anchor);
    return [...this.remoteLocations].find(([, location]) => location.signature === anchor.signature)?.[0];
  }

  captureRangeSelection(range: Range): RangeSelectionAnchor {
    return this.page.captureRangeSelection(range);
  }

  resolveRangeSelection(anchor: RangeSelectionAnchor): string | undefined {
    return this.page.resolveRangeSelection(anchor);
  }

  select(id: string, options: { scroll?: boolean } = {}): boolean {
    const remote = this.remoteLocations.get(id);
    if (!remote) return this.page.select(id, options);
    if (options.scroll !== false) scrollFrameIntoView(remote.frame.window);
    this.post(remote.frame, {
      channel: CLOSED_SHADOW_CHANNEL,
      direction: 'request',
      clientId: this.clientId,
      frameId: remote.frame.id,
      type: 'select',
      resultId: remote.rawId,
      scroll: options.scroll !== false,
    });
    return true;
  }

  hideHighlights(): void {
    this.page.hideHighlights();
    this.broadcast({ type: 'hide' });
  }

  restoreHighlights(activeId?: string): void {
    this.page.restoreHighlights(activeId);
    const remote = activeId ? this.remoteLocations.get(activeId) : undefined;
    for (const frame of this.frames) this.post(frame, {
      channel: CLOSED_SHADOW_CHANNEL,
      direction: 'request',
      clientId: this.clientId,
      frameId: frame.id,
      type: 'restore',
      resultId: remote?.frame === frame ? remote.rawId : undefined,
    });
  }

  clear(): void {
    this.cancelSearch();
    this.page.clear();
    this.broadcast({ type: 'clear' });
    window.removeEventListener('message', this.handleMessage);
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    if (this.responseTimer !== undefined) window.clearTimeout(this.responseTimer);
  }

  private readonly handleMessage = (event: MessageEvent) => {
    if (!isClosedShadowEvent(event.data) || event.data.clientId !== this.clientId) return;
    const frame = this.frames.find((candidate) => candidate.id === event.data.frameId && candidate.window === event.source);
    if (!frame) return;
    if (event.data.type === 'invalidated') {
      this.scheduleRemoteRefresh();
      return;
    }
    if (event.data.type !== 'search-update' || event.data.taskId !== this.activeTask?.id) return;
    this.lastRemoteResponses.set(frame.id, event.data.response);
    if (this.frames.every((target) => this.lastRemoteResponses.get(target.id)?.complete)) {
      if (this.responseTimer !== undefined) window.clearTimeout(this.responseTimer);
      this.responseTimer = undefined;
    }
    this.lastCallback?.(this.mergeResponse());
  };

  private scheduleRemoteRefresh() {
    if (!this.activeTask || !this.lastQuery || !this.lastOptions) return;
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      const taskId = this.activeTask?.id;
      if (!taskId || !this.lastOptions) return;
      this.lastRemoteResponses.clear();
      for (const frame of this.frames) this.post(frame, {
        channel: CLOSED_SHADOW_CHANNEL,
        direction: 'request',
        clientId: this.clientId,
        frameId: frame.id,
        type: 'search',
        taskId,
        query: this.lastQuery,
        options: this.lastOptions,
      });
    }, 250);
  }

  private mergeResponse(forceComplete = false): SearchResponse {
    const page = this.lastPageResponse ?? {
      results: [], durationMs: 0, complete: false, highlightMode: 'native' as HighlightMode,
    };
    const results = [...page.results];
    this.remoteLocations.clear();
    for (const frame of this.frames) {
      const response = this.lastRemoteResponses.get(frame.id);
      if (!response) continue;
      for (const result of response.results) {
        const id = `closed:${frame.id}:${result.id}`;
        results.push({ ...result, id, order: results.length + 1 });
        this.remoteLocations.set(id, { frame, rawId: result.id, signature: resultSignature(result) });
      }
    }
    const modes = [page, ...this.lastRemoteResponses.values()].map((response) => response.highlightMode);
    const highlightMode: HighlightMode = modes.every((mode) => mode === 'native')
      ? 'native'
      : modes.every((mode) => mode === 'fallback') ? 'fallback' : 'mixed';
    return {
      results,
      durationMs: Math.max(page.durationMs, ...[...this.lastRemoteResponses.values()].map((response) => response.durationMs), 0),
      complete: forceComplete || (page.complete && this.frames.every((frame) => this.lastRemoteResponses.get(frame.id)?.complete)),
      highlightMode,
      error: page.error,
    };
  }

  private cancelRemote(taskId: number) {
    for (const frame of this.frames) this.post(frame, {
      channel: CLOSED_SHADOW_CHANNEL,
      direction: 'request',
      clientId: this.clientId,
      frameId: frame.id,
      type: 'cancel',
      taskId,
    });
  }

  private broadcast(command: { type: 'hide' } | { type: 'clear' }) {
    for (const frame of this.frames) this.post(frame, {
      channel: CLOSED_SHADOW_CHANNEL,
      direction: 'request',
      clientId: this.clientId,
      frameId: frame.id,
      ...command,
    });
  }

  private post(frame: FrameTarget, command: ClosedShadowCommand) {
    frame.window.postMessage(command, '*');
  }
}
