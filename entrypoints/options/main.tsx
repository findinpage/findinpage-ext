import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bug,
  ChevronDown,
  Clipboard,
  ExternalLink,
  Globe2,
  Highlighter,
  Mail,
  Monitor,
  Moon,
  Palette,
  Settings2,
  Star,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  getEffectiveLocale,
  loadLocalePreference,
  localeNames,
  saveLocalePreference,
  supportedLocales,
  translate,
  type LocalePreference,
} from '@/lib/i18n';
import {
  loadThemePreference,
  resolveColorScheme,
  saveThemePreference,
  type ThemePreference,
} from '@/lib/theme';
import {
  loadKeepHighlightsOnClose,
  saveKeepHighlightsOnClose,
} from '@/lib/highlight-preference';
import {
  clearDebugEntries,
  DEBUG_LOG_STORAGE_KEY,
  formatDebugEntries,
  loadDebugEnabled,
  loadDebugEntries,
  saveDebugEnabled,
  type DebugEntry,
} from '@/lib/debug-log';
import './style.css';

const CHROME_REVIEW_URL = 'https://chromewebstore.google.com/detail/find-in-page/ghgneafbinoihjfpmcdglhmoieekmnji/reviews';

function OptionsApp() {
  const [preference, setPreference] = useState<LocalePreference>('auto');
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [keepHighlightsOnClose, setKeepHighlightsOnClose] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [debugStatus, setDebugStatus] = useState('');
  const [savedSetting, setSavedSetting] = useState<'language' | 'theme' | 'behavior' | null>(null);
  const locale = getEffectiveLocale(preference);
  const t = useMemo(() => (
    key: Parameters<typeof translate>[1],
    values?: Record<string, string | number>,
  ) => translate(locale, key, values), [locale]);
  const version = browser.runtime?.getManifest?.().version ?? '—';

  useEffect(() => {
    void Promise.all([
      loadLocalePreference(),
      loadThemePreference(),
      loadKeepHighlightsOnClose(),
      loadDebugEnabled(),
      loadDebugEntries(),
    ]).then(([localeValue, themeValue, keepHighlights, debug, entries]) => {
      setPreference(localeValue);
      setThemePreference(themeValue);
      setKeepHighlightsOnClose(keepHighlights);
      setDebugEnabled(debug);
      setDebugEntries(entries);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const onStorageChange = (changes: Record<string, Browser.storage.StorageChange>) => {
      if (!changes[DEBUG_LOG_STORAGE_KEY]) return;
      void loadDebugEntries().then(setDebugEntries);
    };
    browser.storage.onChanged.addListener(onStorageChange);
    return () => browser.storage.onChanged.removeListener(onStorageChange);
  }, []);

  useEffect(() => {
    const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const colorScheme = resolveColorScheme(themePreference, systemColorScheme.matches);
      document.documentElement.dataset.theme = colorScheme;
      document.documentElement.style.colorScheme = colorScheme;
    };
    applyTheme();
    systemColorScheme.addEventListener('change', applyTheme);
    return () => systemColorScheme.removeEventListener('change', applyTheme);
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('optionsTitle');
  }, [locale, t]);

  const updatePreference = async (value: LocalePreference) => {
    setPreference(value);
    setSavedSetting(null);
    await saveLocalePreference(value);
    setSavedSetting('language');
    window.setTimeout(() => setSavedSetting(null), 1600);
  };

  const updateThemePreference = async (value: ThemePreference) => {
    setThemePreference(value);
    setSavedSetting(null);
    await saveThemePreference(value);
    setSavedSetting('theme');
    window.setTimeout(() => setSavedSetting(null), 1600);
  };

  const updateKeepHighlightsOnClose = async (value: boolean) => {
    setKeepHighlightsOnClose(value);
    setSavedSetting(null);
    await saveKeepHighlightsOnClose(value);
    setSavedSetting('behavior');
    window.setTimeout(() => setSavedSetting(null), 1600);
  };

  const updateDebugEnabled = async (value: boolean) => {
    if (value) await clearDebugEntries();
    await saveDebugEnabled(value);
    setDebugEnabled(value);
    setDebugEntries([]);
    setDebugStatus(value ? 'Recording started' : 'Recording stopped');
  };

  const copyDebugLog = async () => {
    await navigator.clipboard.writeText(formatDebugEntries(debugEntries));
    setDebugStatus('Copied');
  };

  const clearDebugLog = async () => {
    await clearDebugEntries();
    setDebugEntries([]);
    setDebugStatus('Cleared');
  };

  const themeOptions = [
    { value: 'system' as const, label: t('themeSystem'), icon: Monitor },
    { value: 'light' as const, label: t('themeLight'), icon: Sun },
    { value: 'dark' as const, label: t('themeDark'), icon: Moon },
  ];

  return (
    <main className="options-shell">
      <header className="options-header">
        <img src="/icon/96.png" alt="" width="56" height="56" />
        <div>
          <h1>{t('optionsTitle')}</h1>
          <p>{t('optionsIntro')}</p>
        </div>
      </header>

      <section className="settings-section" aria-labelledby="language-heading">
        <div className="section-heading">
          <Globe2 aria-hidden="true" />
          <h2 id="language-heading">{t('languageHeading')}</h2>
        </div>
        <label htmlFor="language">{t('languageLabel')}</label>
        <div className="select-row">
          <div className="language-select">
            <select
              id="language"
              value={preference}
              disabled={!loaded}
              onChange={(event) => void updatePreference(event.target.value as LocalePreference)}
            >
              <option value="auto">{t('languageAuto')}</option>
              {supportedLocales.map((item) => (
                <option key={item} value={item}>{localeNames[item]}</option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </div>
          <span className="saved-status" role="status" aria-live="polite">
            {savedSetting === 'language' ? t('saved') : ''}
          </span>
        </div>
        <p className="help-text">{t('languageHelp')}</p>
      </section>

      <section className="settings-section" aria-labelledby="theme-heading">
        <div className="section-heading">
          <Palette aria-hidden="true" />
          <h2 id="theme-heading">{t('themeHeading')}</h2>
        </div>
        <fieldset className="theme-fieldset" disabled={!loaded}>
          <legend>{t('themeLabel')}</legend>
          <div className="theme-options">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <label key={value} className="theme-option">
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={themePreference === value}
                  onChange={() => void updateThemePreference(value)}
                />
                <span><Icon aria-hidden="true" />{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <span className="saved-status theme-saved-status" role="status" aria-live="polite">
          {savedSetting === 'theme' ? t('saved') : ''}
        </span>
        <p className="help-text">{t('themeHelp')}</p>
      </section>

      <section className="settings-section" aria-labelledby="behavior-heading">
        <div className="section-heading">
          <Highlighter aria-hidden="true" />
          <h2 id="behavior-heading">{t('behaviorHeading')}</h2>
        </div>
        <label className="switch-setting">
          <span>
            <strong>{t('keepHighlightsOnClose')}</strong>
            <small>{t('keepHighlightsOnCloseHelp')}</small>
          </span>
          <input
            type="checkbox"
            checked={keepHighlightsOnClose}
            disabled={!loaded}
            onChange={(event) => void updateKeepHighlightsOnClose(event.target.checked)}
          />
          <span className="switch-control" aria-hidden="true" />
        </label>
        <span className="saved-status behavior-saved-status" role="status" aria-live="polite">
          {savedSetting === 'behavior' ? t('saved') : ''}
        </span>
      </section>

      <section className="settings-section" aria-labelledby="about-heading">
        <div className="section-heading">
          <Settings2 aria-hidden="true" />
          <h2 id="about-heading">{t('aboutHeading')}</h2>
        </div>
        <dl className="about-list">
          <div><dt>{t('version')}</dt><dd>{version}</dd></div>
          {import.meta.env.CHROME && (
            <div>
              <dt>{t('rateExtension')}</dt>
              <dd>
                <a href={CHROME_REVIEW_URL} target="_blank" rel="noreferrer">
                  <Star aria-hidden="true" />{t('rateExtension')}<ExternalLink aria-hidden="true" />
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt>{t('website')}</dt>
            <dd><a href="https://findin.page" target="_blank" rel="noreferrer">https://findin.page <ExternalLink aria-hidden="true" /></a></dd>
          </div>
          <div>
            <dt>{t('contact')}</dt>
            <dd><a href="mailto:support@findin.page">support@findin.page <Mail aria-hidden="true" /></a></dd>
          </div>
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="debug-heading">
        <div className="section-heading">
          <Bug aria-hidden="true" />
          <h2 id="debug-heading">Debug log</h2>
        </div>
        <label className="switch-setting">
          <span>
            <strong>Record diagnostic events</strong>
            <small>Stored locally. URLs exclude query strings and fragments. Up to 300 events are retained.</small>
          </span>
          <input
            type="checkbox"
            checked={debugEnabled}
            disabled={!loaded}
            onChange={(event) => void updateDebugEnabled(event.target.checked)}
          />
          <span className="switch-control" aria-hidden="true" />
        </label>
        <div className="debug-toolbar">
          <button type="button" onClick={() => void copyDebugLog()} disabled={debugEntries.length === 0}>
            <Clipboard aria-hidden="true" />Copy log
          </button>
          <button type="button" onClick={() => void clearDebugLog()} disabled={debugEntries.length === 0}>
            <Trash2 aria-hidden="true" />Clear
          </button>
          <span className="saved-status" role="status">{debugStatus}</span>
        </div>
        <pre className="debug-log" aria-label="Diagnostic log">
          {debugEntries.length > 0 ? formatDebugEntries(debugEntries) : 'No diagnostic events recorded.'}
        </pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><OptionsApp /></React.StrictMode>,
);
