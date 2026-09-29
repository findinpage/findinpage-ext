import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ChevronDown,
  ExternalLink,
  Globe2,
  Mail,
  Monitor,
  Moon,
  Palette,
  Settings2,
  Star,
  Sun,
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
import './style.css';

const CHROME_REVIEW_URL = 'https://chromewebstore.google.com/detail/find-in-page/ghgneafbinoihjfpmcdglhmoieekmnji/reviews';

function OptionsApp() {
  const [preference, setPreference] = useState<LocalePreference>('auto');
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);
  const [savedSetting, setSavedSetting] = useState<'language' | 'theme' | null>(null);
  const locale = getEffectiveLocale(preference);
  const t = useMemo(() => (
    key: Parameters<typeof translate>[1],
    values?: Record<string, string | number>,
  ) => translate(locale, key, values), [locale]);
  const version = browser.runtime?.getManifest?.().version ?? '—';

  useEffect(() => {
    void Promise.all([loadLocalePreference(), loadThemePreference()]).then(([localeValue, themeValue]) => {
      setPreference(localeValue);
      setThemePreference(themeValue);
      setLoaded(true);
    });
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
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><OptionsApp /></React.StrictMode>,
);
