# PageSift

PageSift is a Chrome extension that replaces the ordinary find-in-page interaction with a compact list of every match and its surrounding context.

The extension UI is built with WXT, React, Tailwind CSS, and locally owned Shadcn components. The page-search panel is mounted in a Shadow DOM so its styles remain isolated from the websites it runs on.

## Features

- **A familiar entry point:** open or close PageSift with `Command+F` on macOS,
  `Ctrl+F` on Windows/Linux, or the extension toolbar icon. Press `Escape` to
  close the panel.
- **Context-rich results:** see every match in document order, numbered and
  shown with the surrounding text instead of stepping through matches one at a
  time.
- **Fast navigation:** click a result, use the previous/next buttons, or press
  the Up and Down arrow keys while the panel is focused. Choosing a result
  centers its source text in the viewport.
- **Clear page highlights:** all matches are highlighted on the page, with the
  active match shown in a distinct style. Highlights disappear when the panel
  closes.
- **Live page updates:** while the panel is open, results refresh when page
  content changes or scrolling reveals newly rendered content. PageSift keeps
  the active result and result-list position when it can still identify them.
- **Per-tab state:** each tab retains its own query, selected result, and result
  list. Closing and reopening the panel preserves that state and refreshes the
  search against the current page.
- **Theme-aware isolated UI:** the panel follows the page or system light/dark
  preference and runs inside a Shadow DOM so website styles do not leak into
  it.
- **Local and private:** searches run entirely in the current tab. Page text and
  queries are never sent over the network.

Search is case-insensitive and treats the query as literal text. PageSift shows
up to 500 matches, including context drawn from the nearest paragraph, list
item, table cell, heading, blockquote, or preformatted block when available.

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
