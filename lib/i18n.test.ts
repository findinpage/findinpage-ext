import { describe, expect, it } from 'vitest';
import {
  normalizeLocalePreference,
  resolveLocale,
  translate,
} from './i18n';

describe('extension i18n', () => {
  it('resolves exact, region, Chinese script, and fallback locales', () => {
    expect(resolveLocale(['zh-TW'])).toBe('zh-TW');
    expect(resolveLocale(['zh-HK'])).toBe('zh-TW');
    expect(resolveLocale(['zh-CN'])).toBe('zh-CN');
    expect(resolveLocale(['en-GB'])).toBe('en');
    expect(resolveLocale(['ja-JP'])).toBe('ja');
    expect(resolveLocale(['ko-KR'])).toBe('ko');
    expect(resolveLocale(['fr-FR'])).toBe('en');
  });

  it('normalizes stored preferences', () => {
    expect(normalizeLocalePreference('auto')).toBe('auto');
    expect(normalizeLocalePreference('zh-CN')).toBe('zh-CN');
    expect(normalizeLocalePreference('not-a-locale')).toBe('auto');
  });

  it('interpolates localized messages', () => {
    expect(translate('en', 'selectedResult', { current: 3 })).toBe('Result 3 selected.');
    expect(translate('zh-CN', 'matchMany', { count: 4 })).toBe('4 个匹配项');
  });
});
