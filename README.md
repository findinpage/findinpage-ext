# PageSift

PageSift is a Chrome extension that replaces the ordinary find-in-page interaction with a compact list of every match and its surrounding context.

The extension UI is built with WXT, React, Tailwind CSS, and locally owned Shadcn components. The page-search panel is mounted in a Shadow DOM so its styles remain isolated from the websites it runs on.

## MVP behavior

- Press `Command+F` on macOS or `Ctrl+F` on Windows/Linux.
- Press the shortcut again to close PageSift.
- Click the PageSift toolbar icon to show or hide search in the current tab.
- Type one plain-text query in the PageSift overlay.
- Review matches in document order with surrounding context.
- Select a result to center it in the viewport and highlight the exact match.
- Every match is highlighted automatically; use the up/down controls to move the active match.
- Use the keyboard's Up and Down arrow keys while PageSift is focused to move between results.
- Press `Escape` to close PageSift and remove the highlight.

Closing PageSift preserves the current query and selection. Reopening it refreshes the results against the current page.

Search runs locally in the current tab. Page text and queries are never sent over the network.
Each tab keeps its own open state, query, and results when switching between tabs.

## Development

Requirements:

- Node.js 20 or later
- pnpm
- Google Chrome 105 or later

Install dependencies and start WXT in development mode:

```bash
pnpm install
pnpm dev
```

WXT opens a development browser with the extension loaded. To load a production build manually:

```bash
pnpm build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `.output/chrome-mv3`.

Useful checks:

```bash
pnpm compile
pnpm build
```

### UI components

Shadcn components are added as source code under `components/ui`. Add only the component needed for the current feature:

```bash
pnpm dlx shadcn@latest add <component>
```

The configuration is stored in `components.json`, and shared theme tokens live in `assets/tailwind.css`. Content UI styles must continue to be imported by the Shadow DOM entrypoint with WXT's `cssInjectionMode: 'ui'`; do not inject the Tailwind stylesheet into the host document.

## MVP support

PageSift searches visible text nodes currently present in the top-level DOM of ordinary HTTP and HTTPS pages. It supports one case-insensitive literal query and displays up to 500 results.

The MVP does not search:

- Chrome internal or other protected pages
- Chrome's native PDF viewer
- iframes or host-page Shadow DOM
- text rendered only in Canvas, WebGL, images, or video
- virtualized content that has not been inserted into the DOM
- other pages, tabs, or paginated content

Some web applications install their own `Command+F` or `Ctrl+F` behavior. PageSift registers its listener during page startup and handles the shortcut in the capture phase, but protected browser UI always remains outside an extension's control.
