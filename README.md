# Find in Page

Find in Page is a free, open-source browser extension that replaces the ordinary
find-in-page interaction with a compact list of every match and its surrounding
context. It keeps the familiar `Command+F` / `Ctrl+F` shortcut while making it
easier to scan a page and jump directly to the result you need.

- Website: [findin.page](https://findin.page)
- Source: [github.com/findinpage/findinpage-ext](https://github.com/findinpage/findinpage-ext)
- Support: [support@findin.page](mailto:support@findin.page)

The extension UI is built with WXT, React, Tailwind CSS, and locally owned Shadcn components. The page-search panel is mounted in a Shadow DOM so its styles remain isolated from the websites it runs on.

## Features

- **A familiar entry point:** open or close Find in Page with `Command+F` on macOS,
  `Ctrl+F` on Windows/Linux, or the extension toolbar icon. Press `Escape` to
  close the panel.
- **Context-rich results:** see every match in document order, numbered and
  shown with nearby words from its paragraph, heading, list item, table cell,
  blockquote, or code block instead of stepping through matches one at a time.
  The result list is virtualized so large result sets do not mount every row at
  once.
- **Fast navigation:** click a result, use the previous/next buttons, or press
  the Up and Down arrow keys while the panel is focused. Press Enter in the
  search field to run a pending search or move to the next result. Previous and
  next navigation wraps at either end. `Command+G` / `Ctrl+G` moves to the next
  result, and adding Shift moves to the previous result, even when the panel is
  closed. Choosing a result centers its source text in the viewport.
- **Precise matching:** open Search options to match case, require Unicode whole
  words, use a regular expression, or combine all three behaviors. Preferences
  are retained across pages and browser sessions.
- **Clear page highlights:** all matches are highlighted on the page, with the
  active match shown in a distinct style. Highlights disappear when the panel
  closes.
- **Form-field search:** visible text, search, email, telephone, and URL inputs,
  plus textareas, are searched without replacing the original controls. A
  synchronized mirror shows every match inside each control.
- **Responsive large-page search:** results are collected in cancellable batches
  so there is no fixed result limit and large pages remain responsive while the
  result list fills.
- **Live page updates:** while the panel is open, results refresh when page
  content changes or scrolling reveals newly rendered content. Find in Page keeps
  the active result and result-list position when it can still identify them.
- **Per-tab state:** each tab retains its own query, selected result, and result
  list. Closing and reopening the panel restores that state without moving the
  page or rerunning an unchanged search.
- **Theme-aware isolated UI:** the panel follows the page or system light/dark
  preference and runs inside a Shadow DOM so website styles do not leak into
  it.
- **Localized interface:** the panel and settings are available in English,
  Simplified Chinese, Traditional Chinese, Japanese, and Korean, with an
  automatic browser-language mode.
- **Accessible navigation:** the search field and result list expose combobox
  semantics, announce the match count and active result, and support complete
  keyboard navigation without tabbing through every match.
- **Local and private:** searches run entirely in the current tab. Page text and
  queries are never sent over the network.

## Keyboard shortcuts

| macOS | Windows/Linux | Description |
| --- | --- | --- |
| `Command+F` | `Ctrl+F` | Open or close Find in Page. |
| `Command+G` | `Ctrl+G` | Open the panel if needed, run any pending search, and move to the next result. |
| `Command+Shift+G` | `Ctrl+Shift+G` | Open the panel if needed, run any pending search, and move to the previous result. |
| `Command+E` | `Ctrl+E` | While the panel is open, search for text selected on the page and activate that occurrence without scrolling the page. |
| `Enter` | `Enter` | Run a pending search or move to the next result while the search field is focused. |
| `Arrow Up` / `Arrow Down` | `Arrow Up` / `Arrow Down` | Move to the previous or next result while the panel is focused. |
| `Escape` | `Escape` | Close Search options first when open; otherwise close the panel. |

The public website mirrors this reference in every supported locale. Shortcut
behavior and descriptions must remain consistent across the extension, demo,
and website.

> **Using the browser's built-in find:** while Find in Page is enabled, pressing
> `Command+F` or `Ctrl+F` with the page focused opens Find in Page. To use the
> browser's original find box instead, move focus to the address bar before
> pressing the shortcut, or choose **Find** from the browser menu.

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
Visible textarea values and editable `text`, `search`, `email`, `tel`, and `url`
input values are included. Password and non-text controls are intentionally
excluded. Selecting a form result scrolls both the page and the control to the
matching value. Text within one block can match across inline elements, such as
`hello <strong>world</strong>`; matching does not cross blocks or `<br>` elements.
CSS Custom Highlights are used when available. Documents without that API use a
temporary DOM-span compatibility mode that is removed when the search is
replaced or the extension is destroyed.

## Browser support

The core Find in Page experience is available in Chrome, Edge, and Firefox.
Safari support is planned.

| Feature | Chrome | Edge | Firefox | Safari |
| --- | :---: | :---: | :---: | :---: |
| Available today | Yes | Yes | Yes | Planned |
| Open source and free to use | Yes | Yes | Yes | No |
| Light and dark themes | Yes | Yes | Yes | No |
| Context-rich results and page highlights | Yes | Yes | Yes | No |
| Open Shadow DOM search | Yes | Yes | Yes | No |
| Same-origin iframe search | Yes | Yes | Yes | No |
| Live page updates | Yes | Yes | Yes | No |
| `Command+F` / `Ctrl+F` and result-navigation shortcuts | Yes | Yes | Yes | No |
| Regular expressions | Yes | Yes | Yes | No |
| Case-sensitive and Unicode whole-word search | Yes | Yes | Yes | No |

## Development

Requirements:

- Node.js 20 or later
- pnpm
- Google Chrome 105 or later for Chrome development

Install dependencies and start WXT in development mode:

```bash
pnpm install
pnpm dev
```

For Firefox development, run `pnpm dev:firefox`.

WXT opens a development browser with the extension loaded. To load a production build manually:

```bash
pnpm build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `.output/chrome-mv3`.

Useful checks:

```bash
pnpm compile
pnpm build
pnpm build:firefox
pnpm test
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
queries and does not limit the number of results. Search runs in cancellable
batches and reports results incrementally. Matching may span adjacent text nodes
inside one visible block, but does not cross block or explicit line-break
boundaries.

The MVP does not search:

- Chrome internal or other protected pages
- Chrome's native PDF viewer
- cross-origin iframes or closed Shadow DOM
- text rendered only in Canvas, WebGL, images, or video
- virtualized content that has not been inserted into the DOM
- other pages, tabs, or paginated content

Some web applications install their own `Command+F` or `Ctrl+F` behavior. Find in Page registers its listener during page startup and handles the shortcut in the capture phase, but protected browser UI always remains outside an extension's control.
