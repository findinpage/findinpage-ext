# Find in Page

## 1. Project Overview

- **Description**: A browser extension that replaces the native find-in-page experience. It lists every match on the current page with surrounding context and supports result navigation, page highlighting, per-tab search state, and configurable case-sensitive, Unicode whole-word, and regular-expression matching.
- **Tech stack**: WXT 0.20, React 19, TypeScript 5.9, Tailwind CSS 4, Base UI, locally maintained Shadcn components, and Lucide React.
- **Runtime requirements**: Node.js 20+, pnpm, and Chrome 105+. Firefox development and build scripts are also available.
- **Core scope**: Search covers visible Light DOM, Shadow DOM regardless of open/closed state, same-origin nested iframes, visible textarea values, and visible `text`, `search`, `email`, `tel`, and `url` input values. It does not cover passwords, non-text controls, cross-origin iframes, Canvas/WebGL, images, video, or virtualized content that has not been mounted.

## 2. Common Commands

- **Install dependencies**: `pnpm install`
- **Start Chrome development mode**: `pnpm dev`
- **Start Firefox development mode**: `pnpm dev:firefox`
- **Run TypeScript checks**: `pnpm compile`
- **Build the Chrome extension**: `pnpm build`
- **Build the Firefox extension**: `pnpm build:firefox`
- **Package the Chrome extension**: `pnpm zip`
- **Package the Firefox extension**: `pnpm zip:firefox`
- **Tests**: Run `pnpm test` for the Vitest/jsdom search and highlighting suite. Before submitting changes, also run `pnpm compile` and `pnpm build`, then manually verify any affected extension interactions.

## 3. Keyboard Shortcuts

| macOS | Windows/Linux | Description |
| --- | --- | --- |
| `Command+F` | `Ctrl+F` | Open Find in Page or focus its search field; press again while focused to close it. |
| `Command+G` | `Ctrl+G` | Open the panel if needed, run any pending search, and move to the next result. |
| `Command+Shift+G` | `Ctrl+Shift+G` | Open the panel if needed, run any pending search, and move to the previous result. |
| `Command+E` | `Ctrl+E` | While the panel is open, search for text selected on the page and activate that occurrence without scrolling the page. |
| `Enter` | `Enter` | Run a pending search or move to the next result while the search field is focused. |
| `Arrow Up` / `Arrow Down` | `Arrow Up` / `Arrow Down` | Move to the previous or next result while the panel is focused. |
| `Escape` | `Escape` | Close Search options first when open; otherwise close the panel. |

## 4. Code Conventions and Architecture

### Directory Structure

- `entrypoints/background.ts`: Background entrypoint responsible for toolbar icon clicks and content-script messaging.
- `entrypoints/content/index.tsx`: Content-script entrypoint that mounts the Shadow DOM UI and manages keyboard shortcuts, focus, theme synchronization, and runtime messages.
- `entrypoints/content/App.tsx`: React UI, interactions, and state management for the search panel.
- `entrypoints/content/search.ts`: Cancellable batched traversal, block text-flow construction, result excerpts, selection resolution, precise scrolling, text-control mirrors, and per-document native/fallback highlighting.
- `entrypoints/content/search-options.ts`: Search-option defaults, validation, and extension storage adapter. Preferences are loaded when a page initializes and saved globally with `browser.storage.local`.
- `entrypoints/options/`: Localized extension settings page. It owns language, theme, close-highlight behavior, and about information while sharing preference persistence with the content UI.
- `components/ui/`: Locally maintained Shadcn/Base UI primitives.
- `assets/tailwind.css`: Tailwind entrypoint, theme tokens, and extension panel styles.
- `lib/i18n.ts`: Shared English, Simplified Chinese, Traditional Chinese, Japanese, and Korean message catalogs plus locale detection, interpolation, and persistence helpers.
- `lib/`: Other shared stateless utility functions.
- `public/`: Extension icons and other static assets.

### Coding Conventions

- Use TypeScript and React function components. Use `PascalCase` for components and types, `camelCase` for functions, variables, and hooks, and `UPPER_SNAKE_CASE` for constants.
- Use the `@/` alias for modules rooted at the project directory. Relative imports are acceptable for closely related modules in the same directory.
- Follow the existing formatting style: single quotes, semicolons, and trailing commas. Prefer TypeScript inference for local types and avoid unnecessary `any` usage.
- Prefer semantic tokens and existing component variants from `assets/tailwind.css`. Use `cn()` when composing class names.
- Prefer `lucide-react` for icons and reuse primitives from `components/ui/` before adding new UI abstractions.
- Do not directly edit WXT-generated `.wxt/`, build output in `.output/`, or dependencies in `node_modules/`.

### Important Architecture Rules

- The content UI must remain mounted with WXT's `createShadowRootUi` and use `cssInjectionMode: 'ui'`. Do not inject the Tailwind stylesheet into the host page.
- The automatic appearance setting is stored as `system` for backward compatibility, but its user-visible meaning is **Follow website**. In content pages, resolve explicit website theme signals before falling back to `prefers-color-scheme`; explicit extension light/dark preferences always win. Observe runtime website theme changes and disconnect all theme observers and media-query listeners on invalidation. Do not remove website-theme detection because the internal storage value is named `system`. Any theme change must check settings copy, the content panel, the standalone demo, and theme tests together.
- Keep page search and highlight behavior in `PageSearch`. Changes to matching, selection, or cleanup must not leave highlights or listeners behind after the panel closes or the content script is destroyed.
- The host page may mutate its DOM at any time. When retaining references to page nodes, ranges, or elements, continue checking `isConnected` and handle stale search results safely.
- DOM constructors, ranges, computed styles, highlights, and observers used inside iframes must come from the node's owning `document` or `window`; cross-realm `instanceof` checks and top-level-only registries are not reliable.
- Result navigation must use instant scrolling. Scroll precise text ranges through their overflow ancestors, then scroll each containing iframe from the innermost document to the top-level page.
- Selection search must activate the result corresponding to the captured page range and scroll only the extension's result list. It must not scroll the host page, iframe, or page-owned overflow containers; if the range cannot be resolved, activate the first result without page scrolling.
- Clean up global event listeners, `MutationObserver` instances, media-query listeners, and runtime message listeners when the WXT context is invalidated.
- Search defaults to case-insensitive literal matching. `PageSearch.search` must receive the complete `SearchOptions` object and preserve arbitrary combinations of `caseSensitive`, `wholeWord`, and `useRegularExpression`.
- Literal queries must escape regular-expression metacharacters. Regular-expression queries are raw JavaScript patterns without `/pattern/flags`; global and Unicode matching are always enabled, while `caseSensitive` controls the `i` flag. Invalid expressions must clear stale results and highlights and return the structured search error. Zero-length matches must not produce results.
- Whole-word matching treats Unicode letters, Unicode numbers, and underscores as word characters and applies the boundary rule to the complete literal or regular-expression match. Matching may bridge adjacent text nodes in one visible block, but must not bridge blocks, explicit line breaks, iframe documents, Shadow Roots, or controls.
- Only search-option booleans are persisted. Queries remain per-tab and in memory. Other already-open pages do not receive live storage updates; they read the latest options only when initialized or refreshed.
- Locale preference is stored separately under `findinpage.locale`. Keep panel and settings-page copy in the shared catalogs, preserve the `auto` browser-language mode, and propagate storage changes to already-open content UIs without rerunning the current search.
- The keep-highlights preference is stored separately under `findinpage.keep-highlights-on-close`, defaults to `false`, and propagates immediately to open content UIs. Invalid or unavailable storage must fall back to hiding highlights on close.
- Keep the compact `Aa` Search options trigger inside the input wrapper. Its popover must portal into the fixed search panel, remain interactive with `pointer-events: auto`, stay open while multiple options are changed, and restore focus to the input without selecting its text when dismissed.
- Clicking a search result must restore focus to the search input without selecting or changing the query, including when the host page had focus before the click. Use focus restoration that prevents scrolling so result selection and page positioning remain unchanged.
- UI changes must be verified in narrow viewports, light and dark themes, keyboard navigation, focus restoration, and `prefers-reduced-motion` mode.
- On narrow mobile viewports, keep focusable text inputs at a computed font size of at least `16px` to prevent browser focus zoom. Verify that opening, closing, and reopening the panel does not change the host page width or introduce horizontal scrolling.
- Do not interfere with the host page when the extension is inactive. Closing the panel must restore focus and hide highlights unless the user enabled the global keep-highlights preference; the extension host remains transparent and only the panel receives pointer events.
- Closing the panel must retain the in-memory query, current results, active result, result-list scroll position, and last search signature. Reopening with the same query and options must only restore highlights with scrolling disabled: it must not rerun or resume the search, select a different result, or change the host page's current scroll position. A new search should run only after the query or search options change.
- Persist refresh-restoration state per tab in extension session storage. Bind both the query state and any active-result index to normalized top-level URLs (ignore fragments, preserve query strings). On the same normalized URL, restore the panel, query, options, and selection state, then rebuild results without scrolling. On a different URL, retain the open panel and query but do not automatically search or reuse the prior page's active-result index.
- Treat `0/x` as an explicit selection state, not as missing restoration data. If a same-page search had results but no active result before refresh, rebuild the results and keep `0/x`; do not automatically select `1/x`. Restore an index only when its owning normalized URL matches the current page, and clamp an out-of-range same-page index to the final result.

### Search And Batching

- Search has no fixed result limit. `PageSearch.search()` returns a cancellable asynchronous `SearchTask` and publishes immutable `SearchResponse` snapshots through its update callback. Each response includes `complete` and `highlightMode`; React must ignore updates whose task ID is no longer current.
- Process sources in bounded batches and yield between batches. A query or option change, dynamic refresh, panel close, or content-script teardown must cancel the prior task so stale work cannot replace newer results.
- The results list may update while `complete` is false. Keep the live count and searching state accurate, preserve the active selection during refresh when its anchor can be resolved, and do not impose a hidden match cap.
- Build one searchable text flow from adjacent visible text nodes in the same block container. Preserve an offset-to-node mapping so a match can become a cross-node `Range`. End a flow at block boundaries, `<br>`, controls, iframe documents, and Shadow Root boundaries.
- Search visible controls by their current `.value`. Supported inputs are missing/`text`, `search`, `email`, `tel`, and `url`, plus `textarea`; never include `password`, `number`, hidden, button, submit, reset, or other non-text types.
- Captured `input` and `change` events from supported controls must schedule a refresh. Dynamic refreshes must not repeatedly cancel an in-flight search and leave the UI on an incomplete batch; serialize refresh searches and immediately drain one pending refresh after the active search completes. MutationObserver callbacks must ignore the extension UI, fallback highlighter, and control mirrors to prevent self-triggered search loops.
- Listen for document completion on the owning `window`, not with a capture-phase `load` listener on `document`; document capture listeners also receive image, script, stylesheet, and iframe resource loads and can cause repeated full searches and highlight flicker.

### Highlighting And Text Controls

- Ordinary page text uses the CSS Custom Highlight API whenever the owning document provides both `CSS.highlights` and `Highlight`. Maintain separate all-match and active-match registrations per document and inject highlight styles into accessible iframe documents.
- Feature-detect highlighting separately in every document. For ordinary DOM text only, when native highlights are unavailable, use temporary `span[data-findinpage-fallback]` fragments, apply them from the end of the document toward the start, and fully unwrap/normalize them before a new search or teardown. Closing the panel may hide these fragments without destroying the ranges needed when reopening.
- Text controls cannot use DOM `Range` or CSS Custom Highlight because their `.value` is not represented by child text nodes. The retained-control mirror is therefore the primary and unconditional highlighting path for supported inputs and textareas, not a fallback after native highlighting fails. CSS Custom Highlight and the DOM-span fallback apply only to ordinary DOM text.
- Keep the real input/textarea in place and functional, and render matches in a non-interactive mirror. Do not hide, replace, reparent, or make the control text transparent; ordinary text must continue to be painted by the real control while the mirror paints only match backgrounds and matched glyphs.
- A control mirror must copy the complete computed style needed for identical glyph metrics and wrapping. Its non-match text and `-webkit-text-fill-color` stay transparent; match spans explicitly set both normal and WebKit text fill colors. For textarea wrapping, constrain content to the control's actual `clientWidth` minus inline padding so the native scrollbar gutter is accounted for.
- Mount control mirrors under the owning document's `documentElement`, use `position: absolute`, and derive document coordinates from `getBoundingClientRect() + scrollX/scrollY`. Do not position through `body` or `offsetParent`: body margins and special absolute-position containing-block behavior cause visible drift. Resynchronize position on document scroll/resize and translate mirror content by the control's `scrollLeft`/`scrollTop`.
- Selecting a control result must update the real control selection when supported, scroll the control into the page viewport, scroll its internal content to reveal the match, and update the active mirror mark. Mirror cleanup must remove every listener and node without changing the control's value, inline styles, focus, or form behavior.
- Do not copy Findr's strategy of hiding the real control and replacing it with a contenteditable div unless the product explicitly accepts broken control identity, framework bindings, validation, events, focus, selection, and edit synchronization. The retained-control mirror is the required default architecture.

## 5. Guidelines for AI Coding Agents

### Product Documentation Consistency

- When this repository is used inside the sibling workspace, read
  `../product-facts.json` before changing browser availability, release status,
  features, shortcuts, locales, download links, privacy claims, or runtime
  requirements.
- Distinguish implemented, buildable, publicly published, and planned. A build
  target is not publicly available unless it has an active installation link.
- Search the sibling `findinpage-web` repository for affected product copy and
  update it in the same task when it is available and the task permits it.
- Run `node ../scripts/check-product-docs.mjs` after product-fact or
  documentation changes when working in the sibling workspace.

### Interaction Observability

- Every UI interaction, keyboard shortcut, runtime message, toolbar action, focus transition, and extension-owned event path must emit a local debug event through the existing debug logging hook. This requirement applies to all future features and controls, not only the current search panel.
- Keep a root-level capture hook for generic UI events so newly added controls have baseline coverage. Add semantic events at the state-transition or command boundary as well; generic click or keydown records do not replace events such as search started/completed, navigation requested/resolved, selection changed, panel opened/closed, session restored, or refresh queued/drained.
- Logs must include the operation source and enough state to reconstruct the decision, such as key modifiers, query and search options, result count/index, pending/running state, and relevant target role or accessible label. Never include unrelated page content, credentials, form values, URL query strings/fragments, or transmit logs off-device.
- Logging is diagnostic and must never change behavior. All logging calls must tolerate disabled storage, extension-context invalidation, teardown, and write failures without blocking UI or event handling.
- When adding or changing an interaction, add or update tests for both behavior and the important semantic logging hook. Manual verification must use the WXT-launched browser and inspect the options-page debug log for the affected UI, keyboard, toolbar, focus, message, and event paths.

- Read the relevant entrypoints and `README.md` before making changes. Keep implementations aligned with the current MVP scope.
- Do not introduce dependencies that are not declared in `package.json`, especially large dependencies for simple utilities. If a new dependency is necessary, first explain its purpose, bundle-size impact, and maintenance cost.
- When adding a Shadcn component, add only the component required for the current feature with `pnpm dlx shadcn@latest add <component>`, then check that the generated code matches the existing Base UI style.
- When fixing search behavior, prioritize edge cases involving empty queries, multiple matches, cancellation, dynamic DOM changes, invisible nodes, stale ranges, text-control values, cross-realm nodes, nested iframes, and overflow containers.
- Run `pnpm test` for search and highlight changes in addition to the compile and build checks.
- After code changes, run `pnpm compile` and `pnpm build`. For interaction changes, also manually verify `Cmd/Ctrl+F`, `Cmd/Ctrl+G`, `Cmd/Ctrl+Shift+G`, `Cmd/Ctrl+E`, `Escape`, arrow-key navigation, navigation buttons, the toolbar icon, and dynamic page updates on a regular HTTP or HTTPS page.
- Every implementation update to `findinpage-ext` must also update the website demo, even when the change is not expected to affect the demo bundle. Run `pnpm build:demo`, copy `dist/demo/findinpage-demo.js` into the sibling `findinpage-web` repository at `vendor/findinpage-demo/findinpage-demo.js`, update `findinpage-web/demo-artifact.lock.json` with the artifact's SHA-256 hash, then run `pnpm prepare:demo` and `pnpm build` in `findinpage-web`. Documentation-only and repository-metadata-only changes are exempt.
- Do not modify files unrelated to the current task, and do not overwrite existing uncommitted user changes.
