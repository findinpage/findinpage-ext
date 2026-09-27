import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, ExternalLink, Globe2, Mail, Settings2 } from 'lucide-react';
import {
  getEffectiveLocale,
  loadLocalePreference,
  localeNames,
  saveLocalePreference,
  supportedLocales,
  translate,
  type LocalePreference,
} from '@/lib/i18n';
import './style.css';

function OptionsApp() {
  const [preference, setPreference] = useState<LocalePreference>('auto');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const locale = getEffectiveLocale(preference);
  const t = useMemo(() => (
    key: Parameters<typeof translate>[1],
    values?: Record<string, string | number>,
  ) => translate(locale, key, values), [locale]);
  const version = browser.runtime?.getManifest?.().version ?? '—';

  useEffect(() => {
    void loadLocalePreference().then((value) => {
      setPreference(value);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('optionsTitle');
  }, [locale, t]);

  const updatePreference = async (value: LocalePreference) => {
    setPreference(value);
    setSaved(false);
    await saveLocalePreference(value);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

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
            {saved ? t('saved') : ''}
          </span>
        </div>
        <p className="help-text">{t('languageHelp')}</p>
      </section>

      <section className="settings-section" aria-labelledby="about-heading">
        <div className="section-heading">
          <Settings2 aria-hidden="true" />
          <h2 id="about-heading">{t('aboutHeading')}</h2>
        </div>
        <dl className="about-list">
          <div><dt>{t('version')}</dt><dd>{version}</dd></div>
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
