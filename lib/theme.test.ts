import { describe, expect, it } from 'vitest';
import { normalizeThemePreference, resolveColorScheme } from './theme';

describe('extension theme preferences', () => {
  it('normalizes stored preferences', () => {
    expect(normalizeThemePreference('system')).toBe('system');
    expect(normalizeThemePreference('light')).toBe('light');
    expect(normalizeThemePreference('dark')).toBe('dark');
    expect(normalizeThemePreference('unknown')).toBe('system');
    expect(normalizeThemePreference(undefined)).toBe('system');
  });

  it('resolves explicit and system color schemes', () => {
    expect(resolveColorScheme('system', false)).toBe('light');
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('light', true)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
  });
});
