# Find in Page

## 1. Project Overview

- **Description**: A browser extension that replaces the native find-in-page experience. It lists every match on the current page with surrounding context and supports result navigation, page highlighting, per-tab search state, and configurable case-sensitive, Unicode whole-word, and regular-expression matching.
- **Tech stack**: WXT 0.20, React 19, TypeScript 5.9, Tailwind CSS 4, Base UI, locally maintained Shadcn components, and Lucide React.
- **Runtime requirements**: Node.js 20+, pnpm, and Chrome 105+. Firefox development and build scripts are also available.
- **Core scope**: Search covers visible Light DOM, accessible open Shadow DOM, same-origin nested iframes, and visible textarea values. It does not cover cross-origin iframes, closed Shadow DOM, Canvas/WebGL, images, video, or virtualized content that has not been mounted.

## 2. Common Commands

- **Install dependencies**: `pnpm install`
- **Start Chrome development mode**: `pnpm dev`
- **Start Firefox development mode**: `pnpm dev:firefox`
- **Run TypeScript checks**: `pnpm compile`
- **Build the Chrome extension**: `pnpm build`
- **Build the Firefox extension**: `pnpm build:firefox`
- **Package the Chrome extension**: `pnpm zip`
- **Package the Firefox extension**: `pnpm zip:firefox`
- **Tests**: No automated test script is currently configured. Before submitting changes, run at least `pnpm compile` and `pnpm build`, then manually verify any affected extension interactions.

## 3. Code Conventions and Architecture

### Directory Structure

- `entrypoints/background.ts`: Background entrypoint responsible for toolbar icon clicks and content-script messaging.
- `entrypoints/content/index.tsx`: Content-script entrypoint that mounts the Shadow DOM UI and manages keyboard shortcuts, focus, theme synchronization, and runtime messages.
- `entrypoints/content/App.tsx`: React UI, interactions, and state management for the search panel.
- `entrypoints/content/search.ts`: Composed page/frame traversal, result excerpts, selection resolution, precise scrolling, textarea matching, and per-document CSS Highlight API management.
- `entrypoints/content/search-options.ts`: Search-option defaults, validation, and extension storage adapter. Preferences are loaded when a page initializes and saved globally with `browser.storage.local`.
- `components/ui/`: Locally maintained Shadcn/Base UI primitives.
- `assets/tailwind.css`: Tailwind entrypoint, theme tokens, and extension panel styles.
- `lib/`: Shared stateless utility functions.
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
- Keep page search and highlight behavior in `PageSearch`. Changes to matching, selection, or cleanup must not leave highlights or listeners behind after the panel closes or the content script is destroyed.
- The host page may mutate its DOM at any time. When retaining references to page nodes, ranges, or elements, continue checking `isConnected` and handle stale search results safely.
- DOM constructors, ranges, computed styles, highlights, and observers used inside iframes must come from the node's owning `document` or `window`; cross-realm `instanceof` checks and top-level-only registries are not reliable.
- Result navigation must use instant scrolling. Scroll precise text ranges through their overflow ancestors, then scroll each containing iframe from the innermost document to the top-level page.
- Clean up global event listeners, `MutationObserver` instances, media-query listeners, and runtime message listeners when the WXT context is invalidated.
- Search defaults to case-insensitive literal matching. `PageSearch.search` must receive the complete `SearchOptions` object and preserve arbitrary combinations of `caseSensitive`, `wholeWord`, and `useRegularExpression`.
- Literal queries must escape regular-expression metacharacters. Regular-expression queries are raw JavaScript patterns without `/pattern/flags`; global and Unicode matching are always enabled, while `caseSensitive` controls the `i` flag. Invalid expressions must clear stale results and highlights and return the structured search error. Zero-length matches must not produce results.
- Whole-word matching treats Unicode letters, Unicode numbers, and underscores as word characters and applies the boundary rule to the complete literal or regular-expression match. Matching remains scoped to each individual searchable text node or textarea value and must not bridge DOM, iframe, Shadow Root, or control boundaries.
- Only search-option booleans are persisted. Queries remain per-tab and in memory. Other already-open pages do not receive live storage updates; they read the latest options only when initialized or refreshed.
- Keep the compact `Aa` Search options trigger inside the input wrapper. Its popover must portal into the fixed search panel, remain interactive with `pointer-events: auto`, stay open while multiple options are changed, and restore focus to the input without selecting its text when dismissed.
- UI changes must be verified in narrow viewports, light and dark themes, keyboard navigation, focus restoration, and `prefers-reduced-motion` mode.
- Do not interfere with the host page when the extension is inactive. Closing the panel must restore focus and hide highlights, while the extension host remains transparent and only the panel receives pointer events.

## 4. Guidelines for AI Coding Agents

- Read the relevant entrypoints and `README.md` before making changes. Keep implementations aligned with the current MVP scope.
- Do not introduce dependencies that are not declared in `package.json`, especially large dependencies for simple utilities. If a new dependency is necessary, first explain its purpose, bundle-size impact, and maintenance cost.
- When adding a Shadcn component, add only the component required for the current feature with `pnpm dlx shadcn@latest add <component>`, then check that the generated code matches the existing Base UI style.
- When fixing search behavior, prioritize edge cases involving empty queries, multiple matches, dynamic DOM changes, invisible nodes, stale ranges, textarea values, cross-realm nodes, nested iframes, overflow containers, and truncation at 500 results.
- There is currently no test framework. Unless the task explicitly requires test infrastructure, do not assume a test command exists. A minimal test setup may be added for high-risk pure-logic changes, but avoid expanding the task unnecessarily.
- After code changes, run `pnpm compile` and `pnpm build`. For interaction changes, also manually verify `Cmd/Ctrl+F`, `Escape`, arrow-key navigation, navigation buttons, the toolbar icon, and dynamic page updates on a regular HTTP or HTTPS page.
- When the demo bundle changes, run `pnpm build:demo`, copy `dist/demo/findinpage-demo.js` into the website repository at `vendor/findinpage-demo/findinpage-demo.js`, update `demo-artifact.lock.json` with its SHA-256 hash, and run the website's `pnpm prepare:demo` before building it.
- Do not modify files unrelated to the current task, and do not overwrite existing uncommitted user changes.
