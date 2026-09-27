# Find in Page

Find in Page is a Chrome extension that replaces the ordinary find-in-page interaction with a compact list of every match and its surrounding context.

The extension UI is built with WXT, React, Tailwind CSS, and locally owned Shadcn components. The page-search panel is mounted in a Shadow DOM so its styles remain isolated from the websites it runs on.

## Features

- **A familiar entry point:** open or close Find in Page with `Command+F` on macOS,
  `Ctrl+F` on Windows/Linux, or the extension toolbar icon. Press `Escape` to
  close the panel.
- **Context-rich results:** see every match in document order, numbered and
  shown with the surrounding text instead of stepping through matches one at a
  time. The result list is virtualized so large result sets do not mount every
  row at once.
- **Fast navigation:** click a result, use the previous/next buttons, or press
  the Up and Down arrow keys while the panel is focused. Press Enter in the
  search field to run a pending search or move to the next result. Previous and
  next navigation wraps at either end. Choosing a result centers its source text
  in the viewport.
- **Precise matching:** open Search options to match case, require Unicode whole
  words, use a regular expression, or combine all three behaviors. Preferences
  are retained across pages and browser sessions.
- **Clear page highlights:** all matches are highlighted on the page, with the
  active match shown in a distinct style. Highlights disappear when the panel
  closes.
- **Live page updates:** while the panel is open, results refresh when page
  content changes or scrolling reveals newly rendered content. Find in Page keeps
  the active result and result-list position when it can still identify them.
- **Per-tab state:** each tab retains its own query, selected result, and result
  list. Closing and reopening the panel preserves that state and refreshes the
  search against the current page.
- **Theme-aware isolated UI:** the panel follows the page or system light/dark
  preference and runs inside a Shadow DOM so website styles do not leak into
  it.
- **Accessible navigation:** the search field and result list expose combobox
  semantics, announce the match count and active result, and support complete
  keyboard navigation without tabbing through every match.
- **Local and private:** searches run entirely in the current tab. Page text and
  queries are never sent over the network.

Search is case-insensitive and treats the complete query, including spaces, as
literal text by default. `Match case` requires exact casing. `Match whole word`
treats Unicode letters, Unicode numbers, and underscores as word characters.
`Use regular expression` interprets the input as a raw JavaScript pattern
without `/.../flags` delimiters; Unicode and global matching are automatic, and
the case option controls case sensitivity. The three options can be combined.
Find in Page searches the top-level Light DOM, accessible open
Shadow DOM, and same-origin iframes, and shows every match, including context
drawn from the nearest paragraph, list item, table cell, heading, blockquote, or
preformatted block when available.
Visible textarea values are included and selecting one of those results scrolls
to the control and selects the matching text.

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

Find in Page searches visible text nodes currently present in the top-level DOM,
open Shadow DOM, and same-origin iframes of ordinary HTTP and HTTPS pages. It
supports literal, case-sensitive, Unicode whole-word, and regular-expression
queries and does not limit the number of results. Matching stays within each
individual text node or textarea value and does not join adjacent DOM nodes.

The MVP does not search:

- Chrome internal or other protected pages
- Chrome's native PDF viewer
- cross-origin iframes or closed Shadow DOM
- text rendered only in Canvas, WebGL, images, or video
- virtualized content that has not been inserted into the DOM
- other pages, tabs, or paginated content

Some web applications install their own `Command+F` or `Ctrl+F` behavior. Find in Page registers its listener during page startup and handles the shortcut in the capture phase, but protected browser UI always remains outside an extension's control.
