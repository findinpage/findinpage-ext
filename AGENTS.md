# Find in Page

## 1. Project Overview

- **Description**: A browser extension that replaces the native find-in-page experience. It lists every match on the current page with surrounding context and supports result navigation, page highlighting, and per-tab search state.
- **Tech stack**: WXT 0.20, React 19, TypeScript 5.9, Tailwind CSS 4, Base UI, locally maintained Shadcn components, and Lucide React.
- **Runtime requirements**: Node.js 20+, pnpm, and Chrome 105+. Firefox development and build scripts are also available.
- **Core scope**: Search only covers the current page's top-level Light DOM. It does not cover iframes, host-page Shadow DOM, Canvas/WebGL, images, video, or virtualized content that has not been mounted.

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
- `entrypoints/content/search.ts`: Page text traversal, result excerpts, selection resolution, and CSS Highlight API management.
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
- Clean up global event listeners, `MutationObserver` instances, media-query listeners, and runtime message listeners when the WXT context is invalidated.
- Search must remain case-insensitive, use literal text matching, and respect the `MAX_RESULTS` limit. Update the README when intentionally changing these product behaviors.
- UI changes must be verified in narrow viewports, light and dark themes, keyboard navigation, focus restoration, and `prefers-reduced-motion` mode.
- Do not interfere with the host page when the extension is inactive. Closing the panel must restore focus and hide highlights, while the extension host remains transparent and only the panel receives pointer events.

## 4. Guidelines for AI Coding Agents

- Read the relevant entrypoints and `README.md` before making changes. Keep implementations aligned with the current MVP scope.
- Do not introduce dependencies that are not declared in `package.json`, especially large dependencies for simple utilities. If a new dependency is necessary, first explain its purpose, bundle-size impact, and maintenance cost.
- When adding a Shadcn component, add only the component required for the current feature with `pnpm dlx shadcn@latest add <component>`, then check that the generated code matches the existing Base UI style.
- When fixing search behavior, prioritize edge cases involving empty queries, multiple matches, dynamic DOM changes, invisible nodes, stale ranges, and truncation at 500 results.
- There is currently no test framework. Unless the task explicitly requires test infrastructure, do not assume a test command exists. A minimal test setup may be added for high-risk pure-logic changes, but avoid expanding the task unnecessarily.
- After code changes, run `pnpm compile` and `pnpm build`. For interaction changes, also manually verify `Cmd/Ctrl+F`, `Escape`, arrow-key navigation, navigation buttons, the toolbar icon, and dynamic page updates on a regular HTTP or HTTPS page.
- Do not modify files unrelated to the current task, and do not overwrite existing uncommitted user changes.
