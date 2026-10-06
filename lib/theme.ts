export const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof themePreferences)[number];
export type ColorScheme = Exclude<ThemePreference, 'system'>;
export type ColorSchemeSource =
  | 'preference'
  | 'inline'
  | 'data-theme'
  | 'class'
  | 'computed'
  | 'system';

export type ResolvedColorScheme = {
  colorScheme: ColorScheme;
  source: ColorSchemeSource;
};

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

function normalizeColorScheme(value: string | undefined): ColorScheme | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'light' || normalized === 'dark' ? normalized : undefined;
}

export function resolvePageColorScheme(
  root: HTMLElement,
  systemPrefersDark: boolean,
  getComputedStyleForRoot: (element: Element) => CSSStyleDeclaration = getComputedStyle,
): ResolvedColorScheme {
  const inlineScheme = normalizeColorScheme(root.style.colorScheme);
  if (inlineScheme) return { colorScheme: inlineScheme, source: 'inline' };

  const dataThemeScheme = normalizeColorScheme(root.dataset.theme);
  if (dataThemeScheme) return { colorScheme: dataThemeScheme, source: 'data-theme' };

  if (root.classList.contains('dark')) return { colorScheme: 'dark', source: 'class' };
  if (root.classList.contains('light')) return { colorScheme: 'light', source: 'class' };

  try {
    const computedScheme = normalizeColorScheme(getComputedStyleForRoot(root).colorScheme);
    if (computedScheme) return { colorScheme: computedScheme, source: 'computed' };
  } catch {
    // Wrapped or detached documents can reject computed-style access.
  }

  return {
    colorScheme: systemPrefersDark ? 'dark' : 'light',
    source: 'system',
  };
}

export function resolveContentColorScheme(
  preference: ThemePreference,
  root: HTMLElement,
  systemPrefersDark: boolean,
  getComputedStyleForRoot?: (element: Element) => CSSStyleDeclaration,
): ResolvedColorScheme {
  return preference === 'system'
    ? resolvePageColorScheme(root, systemPrefersDark, getComputedStyleForRoot)
    : { colorScheme: preference, source: 'preference' };
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
