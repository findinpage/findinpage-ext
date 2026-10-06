import { describe, expect, it } from 'vitest';
import {
  normalizeThemePreference,
  resolveColorScheme,
  resolveContentColorScheme,
  resolvePageColorScheme,
} from './theme';

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

  it('resolves page theme signals in priority order', () => {
    const root = document.documentElement;
    root.style.colorScheme = 'dark';
    root.dataset.theme = 'light';
    root.classList.add('light');

    expect(resolvePageColorScheme(root, false, () => ({ colorScheme: 'light' }) as CSSStyleDeclaration))
      .toEqual({ colorScheme: 'dark', source: 'inline' });

    root.style.colorScheme = '';
    expect(resolvePageColorScheme(root, true, () => ({ colorScheme: 'dark' }) as CSSStyleDeclaration))
      .toEqual({ colorScheme: 'light', source: 'data-theme' });

    delete root.dataset.theme;
    expect(resolvePageColorScheme(root, true, () => ({ colorScheme: 'dark' }) as CSSStyleDeclaration))
      .toEqual({ colorScheme: 'light', source: 'class' });

    root.className = '';
    expect(resolvePageColorScheme(root, false, () => ({ colorScheme: 'dark' }) as CSSStyleDeclaration))
      .toEqual({ colorScheme: 'dark', source: 'computed' });
  });

  it('falls back to the system when the page has no explicit theme', () => {
    const root = document.documentElement;
    expect(resolvePageColorScheme(root, false, () => ({ colorScheme: 'normal' }) as CSSStyleDeclaration))
      .toEqual({ colorScheme: 'light', source: 'system' });
    expect(resolvePageColorScheme(root, true, () => ({ colorScheme: 'light dark' }) as CSSStyleDeclaration))
      .toEqual({ colorScheme: 'dark', source: 'system' });
  });

  it('lets an explicit extension preference override the page theme', () => {
    const root = document.documentElement;
    root.dataset.theme = 'dark';

    expect(resolveContentColorScheme('light', root, true))
      .toEqual({ colorScheme: 'light', source: 'preference' });
    expect(resolveContentColorScheme('dark', root, false))
      .toEqual({ colorScheme: 'dark', source: 'preference' });
    expect(resolveContentColorScheme('system', root, false))
      .toEqual({ colorScheme: 'dark', source: 'data-theme' });
  });
});
