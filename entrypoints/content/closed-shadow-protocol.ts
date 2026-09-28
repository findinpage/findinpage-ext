import type { SearchOptions, SearchResponse } from './search';

export const CLOSED_SHADOW_CHANNEL = 'findinpage:closed-shadow:v1';

export type ClosedShadowCommand =
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'request'; clientId: string; frameId: string; type: 'search'; taskId: number; query: string; options: SearchOptions }
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'request'; clientId: string; frameId: string; type: 'cancel'; taskId: number }
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'request'; clientId: string; frameId: string; type: 'select'; resultId: string; scroll: boolean }
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'request'; clientId: string; frameId: string; type: 'hide' }
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'request'; clientId: string; frameId: string; type: 'restore'; resultId?: string }
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'request'; clientId: string; frameId: string; type: 'clear' };

export type ClosedShadowEvent =
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'response'; clientId: string; frameId: string; type: 'ready' }
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'response'; clientId: string; frameId: string; type: 'search-update'; taskId: number; response: SearchResponse }
  | { channel: typeof CLOSED_SHADOW_CHANNEL; direction: 'response'; clientId: string; frameId: string; type: 'invalidated' };

export function isClosedShadowCommand(value: unknown): value is ClosedShadowCommand {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ClosedShadowCommand>;
  return candidate.channel === CLOSED_SHADOW_CHANNEL && candidate.direction === 'request' &&
    typeof candidate.clientId === 'string' && typeof candidate.frameId === 'string' &&
    typeof candidate.type === 'string';
}

export function isClosedShadowEvent(value: unknown): value is ClosedShadowEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ClosedShadowEvent>;
  return candidate.channel === CLOSED_SHADOW_CHANNEL && candidate.direction === 'response' &&
    typeof candidate.clientId === 'string' && typeof candidate.frameId === 'string' &&
    typeof candidate.type === 'string';
}
