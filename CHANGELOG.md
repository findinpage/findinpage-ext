# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.1]: https://github.com/findinpage/findinpage-ext/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/findinpage/findinpage-ext/releases/tag/v1.0.0
