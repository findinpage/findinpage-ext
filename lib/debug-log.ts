export const DEBUG_ENABLED_STORAGE_KEY = 'findinpage.debug-enabled';
export const DEBUG_LOG_STORAGE_KEY = 'findinpage.debug-log';
export const DEBUG_LOG_LIMIT = 300;

export type DebugSource = 'background' | 'content';

export interface DebugEntry {
  timestamp: string;
  source: DebugSource;
  event: string;
  details?: Record<string, unknown>;
  tabId?: number;
  url?: string;
}

export type DebugLogMessage = {
  type: 'DEBUG_LOG';
  entry: Omit<DebugEntry, 'timestamp' | 'tabId'>;
};

export function normalizeDebugEntries(value: unknown): DebugEntry[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is DebugEntry => Boolean(
        entry &&
        typeof entry === 'object' &&
        typeof (entry as DebugEntry).timestamp === 'string' &&
        typeof (entry as DebugEntry).source === 'string' &&
        typeof (entry as DebugEntry).event === 'string',
      )).slice(-DEBUG_LOG_LIMIT)
    : [];
}

export async function loadDebugEnabled(): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(DEBUG_ENABLED_STORAGE_KEY);
    return stored[DEBUG_ENABLED_STORAGE_KEY] === true;
  } catch {
    return false;
  }
}

export async function saveDebugEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [DEBUG_ENABLED_STORAGE_KEY]: enabled });
}

export async function loadDebugEntries(): Promise<DebugEntry[]> {
  const stored = await browser.storage.local.get(DEBUG_LOG_STORAGE_KEY);
  return normalizeDebugEntries(stored[DEBUG_LOG_STORAGE_KEY]);
}

export async function clearDebugEntries(): Promise<void> {
  await browser.storage.local.remove(DEBUG_LOG_STORAGE_KEY);
}

export function formatDebugEntries(entries: DebugEntry[]): string {
  return entries.map((entry) => {
    const context = [
      entry.source,
      entry.tabId === undefined ? undefined : `tab=${entry.tabId}`,
      entry.url,
    ].filter(Boolean).join(' ');
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
    return `${entry.timestamp} [${context}] ${entry.event}${details}`;
  }).join('\n');
}

export function logContentDebug(
  event: string,
  details?: Record<string, unknown>,
): void {
  console.debug(
    '[Find in Page]',
    event,
    details ? JSON.stringify(details) : '',
  );
  void (async () => {
    try {
      await browser.runtime.sendMessage<DebugLogMessage>({
        type: 'DEBUG_LOG',
        entry: {
          source: 'content',
          event,
          details,
          url: `${location.origin}${location.pathname}`,
        },
      });
    } catch {
      // Logging must never affect extension behavior after context invalidation.
    }
  })();
}
