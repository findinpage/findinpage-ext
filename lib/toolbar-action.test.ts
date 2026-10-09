import { describe, expect, it } from 'vitest';
import { resolveToolbarAction } from './toolbar-action';

describe('toolbar action compatibility', () => {
  it('prefers the Manifest V3 action API', () => {
    const action = { api: 'action' };
    const browserAction = { api: 'browserAction' };

    expect(resolveToolbarAction(action, browserAction)).toBe(action);
  });

  it('falls back to the Manifest V2 browserAction API', () => {
    const browserAction = { api: 'browserAction' };

    expect(resolveToolbarAction(undefined, browserAction)).toBe(browserAction);
  });

  it('fails clearly when no toolbar action API is available', () => {
    expect(() => resolveToolbarAction(undefined, undefined)).toThrow(
      'Find in Page could not initialize: no toolbar action API is available.',
    );
  });
});
