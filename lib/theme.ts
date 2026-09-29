export const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof themePreferences)[number];
export type ColorScheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'findinpage.theme';

export function normalizeThemePreference(value: unknown): ThemePreference {
  return themePreferences.includes(value as ThemePreference)
    ? value as ThemePreference
    : 'system';
}

export function resolveColorScheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ColorScheme {
  return preference === 'system'
    ? systemPrefersDark ? 'dark' : 'light'
    : preference;
}

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    if (typeof browser === 'undefined' || !browser.storage?.local) return 'system';
    const stored = await browser.storage.local.get(THEME_STORAGE_KEY);
    return normalizeThemePreference(stored[THEME_STORAGE_KEY]);
  } catch {
    return 'system';
  }
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return;
  await browser.storage.local.set({
    [THEME_STORAGE_KEY]: normalizeThemePreference(preference),
  });
}
