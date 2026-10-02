export const supportedLocales = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export type LocalePreference = SupportedLocale | 'auto';

export const LOCALE_STORAGE_KEY = 'findinpage.locale';

export const localeNames: Record<SupportedLocale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
};

const en = {
  panelLabel: 'Find in Page page search',
  searchLabel: 'Search this page',
  searchPlaceholder: 'Find in Page',
  searchOptions: 'Search options',
  matchCase: 'Match case',
  matchWholeWord: 'Match whole word',
  useRegularExpression: 'Use regular expression',
  previousResult: 'Previous result',
  nextResult: 'Next result',
  closeFind: 'Close Find in Page',
  close: 'Close',
  resultsLabel: 'Search results',
  emptyHint: 'Matches will appear here with their surrounding context.',
  searchingPage: 'Searching this page...',
  noMatches: 'No matches on this page.',
  enterSearch: 'Enter a search term.',
  invalidRegularExpression: 'Invalid regular expression.',
  compatibilityHighlighting: 'Compatibility highlighting is active on this page.',
  searching: 'Searching.',
  matchOne: '{count} match',
  matchMany: '{count} matches',
  selectedResult: 'Result {current} selected.',
  matchesFoundOne: 'Searching... {count} match found',
  matchesFoundMany: 'Searching... {count} matches found',
  addToBrowser: 'Add to browser',
  optionsTitle: 'Find in Page settings',
  optionsIntro: 'Choose how Find in Page appears in your browser.',
  languageHeading: 'Language',
  languageLabel: 'Display language',
  languageAuto: 'Auto (browser language)',
  languageHelp: 'Changes apply immediately to Find in Page in every open tab.',
  saved: 'Saved',
  themeHeading: 'Theme',
  themeLabel: 'Appearance',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeHelp: 'Choose a theme for Find in Page across every website.',
  behaviorHeading: 'Search behavior',
  keepHighlightsOnClose: 'Keep results highlighted after closing',
  keepHighlightsOnCloseHelp: 'Leave the current matches highlighted when the Find in Page panel is closed.',
  aboutHeading: 'About',
  rateExtension: 'Rate this extension',
  website: 'Official website',
  version: 'Version',
  contact: 'Contact support',
};

export type MessageKey = keyof typeof en;
type Messages = Record<MessageKey, string>;

const catalogs: Record<SupportedLocale, Messages> = {
  en,
  'zh-CN': {
    panelLabel: 'Find in Page 页面搜索', searchLabel: '搜索此页面', searchPlaceholder: '在页面中查找',
    searchOptions: '搜索选项', matchCase: '区分大小写', matchWholeWord: '全字匹配',
    useRegularExpression: '使用正则表达式', previousResult: '上一个结果', nextResult: '下一个结果',
    closeFind: '关闭 Find in Page', close: '关闭', resultsLabel: '搜索结果',
    emptyHint: '匹配结果及其上下文将显示在这里。', searchingPage: '正在搜索此页面...',
    noMatches: '此页面中没有匹配项。', enterSearch: '请输入搜索内容。',
    invalidRegularExpression: '正则表达式无效。', compatibilityHighlighting: '此页面正在使用兼容高亮模式。',
    searching: '正在搜索。', matchOne: '{count} 个匹配项', matchMany: '{count} 个匹配项',
    selectedResult: '已选择第 {current} 个结果。', matchesFoundOne: '正在搜索...已找到 {count} 个匹配项',
    matchesFoundMany: '正在搜索...已找到 {count} 个匹配项', addToBrowser: '添加到浏览器',
    optionsTitle: 'Find in Page 设置', optionsIntro: '选择 Find in Page 在浏览器中的显示方式。',
    languageHeading: '语言', languageLabel: '显示语言', languageAuto: '自动（浏览器语言）',
    languageHelp: '更改会立即应用到所有已打开标签页中的 Find in Page。', saved: '已保存',
    themeHeading: '主题', themeLabel: '外观', themeSystem: '跟随系统', themeLight: '浅色',
    themeDark: '深色', themeHelp: '选择 Find in Page 在所有网站中使用的主题。',
    behaviorHeading: '搜索行为', keepHighlightsOnClose: '关闭后保留搜索结果高亮',
    keepHighlightsOnCloseHelp: '关闭 Find in Page 搜索面板后，继续高亮当前匹配结果。',
    aboutHeading: '关于', rateExtension: '为扩展评分', website: '官方网站', version: '版本', contact: '联系支持',
  },
  'zh-TW': {
    panelLabel: 'Find in Page 頁面搜尋', searchLabel: '搜尋此頁面', searchPlaceholder: '在頁面中尋找',
    searchOptions: '搜尋選項', matchCase: '區分大小寫', matchWholeWord: '全字相符',
    useRegularExpression: '使用正規表示式', previousResult: '上一個結果', nextResult: '下一個結果',
    closeFind: '關閉 Find in Page', close: '關閉', resultsLabel: '搜尋結果',
    emptyHint: '相符結果及其上下文會顯示在這裡。', searchingPage: '正在搜尋此頁面...',
    noMatches: '此頁面中沒有相符項目。', enterSearch: '請輸入搜尋內容。',
    invalidRegularExpression: '正規表示式無效。', compatibilityHighlighting: '此頁面正在使用相容高亮模式。',
    searching: '正在搜尋。', matchOne: '{count} 個相符項目', matchMany: '{count} 個相符項目',
    selectedResult: '已選取第 {current} 個結果。', matchesFoundOne: '正在搜尋...已找到 {count} 個相符項目',
    matchesFoundMany: '正在搜尋...已找到 {count} 個相符項目', addToBrowser: '新增至瀏覽器',
    optionsTitle: 'Find in Page 設定', optionsIntro: '選擇 Find in Page 在瀏覽器中的顯示方式。',
    languageHeading: '語言', languageLabel: '顯示語言', languageAuto: '自動（瀏覽器語言）',
    languageHelp: '變更會立即套用至所有已開啟分頁中的 Find in Page。', saved: '已儲存',
    themeHeading: '主題', themeLabel: '外觀', themeSystem: '跟隨系統', themeLight: '淺色',
    themeDark: '深色', themeHelp: '選擇 Find in Page 在所有網站中使用的主題。',
    behaviorHeading: '搜尋行為', keepHighlightsOnClose: '關閉後保留搜尋結果高亮',
    keepHighlightsOnCloseHelp: '關閉 Find in Page 搜尋面板後，繼續高亮目前的相符結果。',
    aboutHeading: '關於', rateExtension: '為擴充功能評分', website: '官方網站', version: '版本', contact: '聯絡支援',
  },
  ja: {
    panelLabel: 'Find in Page ページ内検索', searchLabel: 'このページを検索', searchPlaceholder: 'ページ内を検索',
    searchOptions: '検索オプション', matchCase: '大文字と小文字を区別', matchWholeWord: '単語単位で一致',
    useRegularExpression: '正規表現を使用', previousResult: '前の結果', nextResult: '次の結果',
    closeFind: 'Find in Page を閉じる', close: '閉じる', resultsLabel: '検索結果',
    emptyHint: '一致した結果が周辺の文脈とともにここに表示されます。', searchingPage: 'このページを検索しています...',
    noMatches: 'このページに一致する項目はありません。', enterSearch: '検索語を入力してください。',
    invalidRegularExpression: '正規表現が無効です。', compatibilityHighlighting: 'このページでは互換ハイライトを使用しています。',
    searching: '検索中です。', matchOne: '{count} 件の一致', matchMany: '{count} 件の一致',
    selectedResult: '{current} 件目の結果を選択しました。', matchesFoundOne: '検索中... {count} 件見つかりました',
    matchesFoundMany: '検索中... {count} 件見つかりました', addToBrowser: 'ブラウザーに追加',
    optionsTitle: 'Find in Page 設定', optionsIntro: 'ブラウザーでの Find in Page の表示方法を選択します。',
    languageHeading: '言語', languageLabel: '表示言語', languageAuto: '自動（ブラウザーの言語）',
    languageHelp: '変更は開いているすべてのタブの Find in Page にすぐ反映されます。', saved: '保存しました',
    themeHeading: 'テーマ', themeLabel: '外観', themeSystem: 'システム', themeLight: 'ライト',
    themeDark: 'ダーク', themeHelp: 'すべてのウェブサイトで使用する Find in Page のテーマを選択します。',
    behaviorHeading: '検索動作', keepHighlightsOnClose: '閉じた後も検索結果をハイライトする',
    keepHighlightsOnCloseHelp: 'Find in Page パネルを閉じても、現在の一致箇所をハイライトしたままにします。',
    aboutHeading: '情報', rateExtension: '拡張機能を評価', website: '公式ウェブサイト', version: 'バージョン', contact: 'サポートに連絡',
  },
  ko: {
    panelLabel: 'Find in Page 페이지 검색', searchLabel: '이 페이지 검색', searchPlaceholder: '페이지에서 찾기',
    searchOptions: '검색 옵션', matchCase: '대/소문자 구분', matchWholeWord: '단어 단위로 일치',
    useRegularExpression: '정규식 사용', previousResult: '이전 결과', nextResult: '다음 결과',
    closeFind: 'Find in Page 닫기', close: '닫기', resultsLabel: '검색 결과',
    emptyHint: '일치 결과가 주변 문맥과 함께 여기에 표시됩니다.', searchingPage: '이 페이지를 검색하는 중...',
    noMatches: '이 페이지에 일치하는 항목이 없습니다.', enterSearch: '검색어를 입력하세요.',
    invalidRegularExpression: '정규식이 올바르지 않습니다.', compatibilityHighlighting: '이 페이지에서 호환 강조 표시를 사용하고 있습니다.',
    searching: '검색 중입니다.', matchOne: '일치 항목 {count}개', matchMany: '일치 항목 {count}개',
    selectedResult: '{current}번째 결과를 선택했습니다.', matchesFoundOne: '검색 중... {count}개 찾음',
    matchesFoundMany: '검색 중... {count}개 찾음', addToBrowser: '브라우저에 추가',
    optionsTitle: 'Find in Page 설정', optionsIntro: '브라우저에서 Find in Page가 표시되는 방식을 선택하세요.',
    languageHeading: '언어', languageLabel: '표시 언어', languageAuto: '자동(브라우저 언어)',
    languageHelp: '변경 사항은 열려 있는 모든 탭의 Find in Page에 즉시 적용됩니다.', saved: '저장됨',
    themeHeading: '테마', themeLabel: '모양', themeSystem: '시스템', themeLight: '라이트',
    themeDark: '다크', themeHelp: '모든 웹사이트에서 사용할 Find in Page 테마를 선택하세요.',
    behaviorHeading: '검색 동작', keepHighlightsOnClose: '닫은 후에도 검색 결과 강조 표시 유지',
    keepHighlightsOnCloseHelp: 'Find in Page 패널을 닫아도 현재 일치 항목의 강조 표시를 유지합니다.',
    aboutHeading: '정보', rateExtension: '확장 프로그램 평가', website: '공식 웹사이트', version: '버전', contact: '지원팀에 문의',
  },
};

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return value === 'auto' || supportedLocales.includes(value as SupportedLocale)
    ? value as LocalePreference
    : 'auto';
}

export function resolveLocale(locales: readonly string[]): SupportedLocale {
  for (const locale of locales) {
    const normalized = locale.replace('_', '-').toLowerCase();
    const exact = supportedLocales.find((candidate) => candidate.toLowerCase() === normalized);
    if (exact) return exact;
    const base = normalized.split('-')[0];
    const baseMatch = supportedLocales.find((candidate) => candidate.toLowerCase() === base);
    if (baseMatch) return baseMatch;
    if (base === 'zh') return normalized.includes('tw') || normalized.includes('hk') ? 'zh-TW' : 'zh-CN';
  }
  return 'en';
}

export function getBrowserLocale(): SupportedLocale {
  let browserLocale = '';
  try {
    browserLocale =
      typeof browser !== 'undefined' && browser.i18n?.getUILanguage
        ? browser.i18n.getUILanguage()
        : '';
  } catch {
    // Extension reloads can leave the old content script alive without an API context.
  }
  const locales = [
    ...(typeof navigator !== 'undefined' ? navigator.languages : []),
    browserLocale,
  ];
  return resolveLocale(locales);
}

export function getEffectiveLocale(preference: LocalePreference): SupportedLocale {
  return preference === 'auto' ? getBrowserLocale() : preference;
}

export function translate(locale: SupportedLocale, key: MessageKey, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    catalogs[locale][key] ?? en[key],
  );
}

export async function loadLocalePreference(): Promise<LocalePreference> {
  try {
    if (typeof browser === 'undefined' || !browser.storage?.local) return 'auto';
    const stored = await browser.storage.local.get(LOCALE_STORAGE_KEY);
    return normalizeLocalePreference(stored[LOCALE_STORAGE_KEY]);
  } catch {
    return 'auto';
  }
}

export async function saveLocalePreference(preference: LocalePreference): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return;
  await browser.storage.local.set({ [LOCALE_STORAGE_KEY]: normalizeLocalePreference(preference) });
}
