# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2026-10-07

### Fixed

- Fixed automatic appearance so the search panel follows each website's light
  or dark theme, including runtime theme changes, and falls back to the system
  preference only when the website does not declare one.

## [1.0.5] - 2026-10-06

### Fixed

- Added a stable Firefox add-on ID and the required no-data-collection
  declaration so Firefox packages pass Mozilla Add-ons validation.

## [1.0.3] - 2026-10-06

### Fixed

- Fixed `Command+F` and `Ctrl+F` so pressing the shortcut while the search
  panel is open but unfocused returns focus to the search field instead of
  closing the panel.
- Fixed searching and highlighting inline text placed directly inside Shadow
  DOM roots.

## [1.0.2] - 2026-10-02

### Added

- Added local debug mode with logs covering toolbar, keyboard, UI, search,
  selection, restoration, refresh, focus, and runtime-message events.

### Fixed

- Fixed toolbar and keyboard activation after refresh or extension-context
  replacement, including pages that remove the injected panel host.
- Restored the selected result using surrounding content anchors so dynamic
  pages return to the intended match instead of relying only on its index.
- Prevented session restoration from stealing focus or changing the page's
  scroll position, and kept page content selectable while the panel is open.
- Serialized dynamic result refreshes and removed redundant load and scroll
  searches that could leave the panel searching or repeatedly flash highlights.

## [1.0.1] - 2026-10-01

### Added

- Added a global setting that keeps page results highlighted after the search
  panel closes. The setting is disabled by default and applies immediately to
  every open tab.

### Fixed

- Fixed toolbar toggling so repeated clicks can both open and close the panel,
  while restoring missing or stale content scripts without breaking the
  keyboard shortcut.

## [1.0.0] - 2026-09-30

### Added

- Added a context-rich find-in-page panel with unlimited batched matching,
  result navigation, page highlighting, and keyboard shortcuts.
- Added case-sensitive, Unicode whole-word, and regular-expression search
  options.
- Added search support for visible Light DOM, open and closed Shadow DOM,
  same-origin nested iframes, and supported text inputs and textareas.
- Added localized settings, light and dark themes, and per-tab search-session
  restoration across page refreshes.

[1.0.6]: https://github.com/findinpage/findinpage-ext/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/findinpage/findinpage-ext/compare/v1.0.3...v1.0.5
[1.0.3]: https://github.com/findinpage/findinpage-ext/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/findinpage/findinpage-ext/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/findinpage/findinpage-ext/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/findinpage/findinpage-ext/releases/tag/v1.0.0
