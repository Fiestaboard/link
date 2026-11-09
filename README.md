# FiestaBoard app links

A few static pages, served from GitHub Pages at **https://fiestaboard.app/link/**, behind the
links that open the [FiestaBoard](https://github.com/Fiestaboard/FiestaBoard) phone apps.

> **The link addresses must never change.**
> `https://fiestaboard.app/link/pair`, `/link/activate` and `/link/open` are claimed by the iOS
> app (Universal Links) and the Android app (App Links) through the `.well-known` files at the
> root of fiestaboard.app, and hubs print them in QR codes and messages. Renaming this
> repository, moving a page, or changing the domain breaks every link already handed out.

## Why this exists

A FiestaBoard hub is reached at an address like `http://fiestapi.local:4420`. iOS and Android only
open an app from an `https://` link on a domain that proves, with a `.well-known` file, that the
app may handle it. A hub on a home network can't do that, so the links use fiestaboard.app.

- **The app is installed:** the phone opens the app straight from the link. This site is never
  loaded.
- **It isn't, or the link is opened on a computer:** the phone opens this site, which shows the
  fallback page: **Open in the FiestaBoard app** (through the app's `fiestaboard://` address),
  the App Store and Google Play, and **Continue in your browser** on the hub's own page.

Links are optional. In-app Scan QR, typed `/activate` codes and manual hub entry all work without
them.

Only static files run here. Nothing is stored anywhere, not even in the visitor's browser.

## Link format

```
https://fiestaboard.app/link/<route>#<key>=<value>&<key>=<value>
```

All data is in the `#` fragment, percent-encoded (spaces as `%20`). Browsers never send the
fragment over the network, so none of it reaches fiestaboard.app or GitHub. Data in the query string
is ignored.

| Route | Fields | Continue in your browser goes to |
| --- | --- | --- |
| `pair` | `hub`, `code` (the hub's one-time pairing code), optional `v=1`, `id`, `name` | `<hub>/` (a pairing code only works in the app) |
| `activate` | `hub`, `code` (an `/activate` code, `XXXX-XXXX`), optional `id`, `name` | `<hub>/activate?user_code=XXXX-XXXX` |
| `open` | `hub`, `page` (a page id), optional `id`, `name` | `<hub>/pages/edit/<page>` |

The `pair` fields are the same as the hub's QR (`fiestaboard://pair#v=1&hub=…&id=…&name=…&code=…`,
`src/auth/pairing_routes.py`), so a hub can print either form. **Open in the FiestaBoard app**
sends the same fields to `fiestaboard://<route>#…`.

`/activate` is the hub's own page and reads its code from `?user_code=` (the hub's
`verification_path_complete`). That request goes to the hub, not to fiestaboard.app.

## Security model

A link can come from anyone, so nothing in it is trusted. The rules live in
[`src/lib/link.js`](src/lib/link.js), a dependency-free module with no DOM access, and every one
has a test in [`tests/link.test.js`](tests/link.test.js), hostile inputs included.

- **Only `http` and `https` hubs.** `javascript:`, `data:`, `file:` and every other scheme are
  refused, as is an address with no scheme at all.
- **Never a loopback hub.** `localhost`, `*.localhost`, `127.0.0.0/8`, `0.0.0.0/8`, `[::1]`,
  `[::]` and IPv4 loopback written as IPv6 are refused, in every spelling the URL parser
  normalizes (`http://2130706433`, `http://0x7f.1`, `http://127.1` …). A phone that follows
  "localhost" reaches itself, so this is the same rule as the hub's QR (H18) and the apps.
- **A plain address or nothing.** No username or password, query, fragment, whitespace, control
  characters, backslashes, `..` segments or escapes in the base path. The path is checked as
  written, before the URL parser can resolve it.
- **Exact shapes.** Pairing codes, `/activate` codes (the hub's alphabet) and page ids must match
  what the hub issues. A key that appears twice makes the link unusable, so two parsers can
  never disagree about which value counts.
- **Rebuilt, not copied.** The `fiestaboard://` and hub URLs are assembled from the validated
  values only.
- **The real destination is what you read.** The heading names the validated hub address, and
  the browser button says where it goes ("Continue to fiestapi.local:4420"). The link's `name`
  is unverified (a link can say anything there, including another hub's address), so it only
  appears as secondary text: "It calls itself “…”".
- **Text, never HTML.** The hub address and name are React text nodes; nothing is put into the
  page as HTML. Names with control or format characters (bidirectional marks, zero-width
  characters, U+061C, U+2060–2064, U+FEFF), line or paragraph separators, or Hangul fillers are
  dropped. `tests/render.test.js` renders the page in Node and checks every `href` and heading.
- **Device codes.** The `activate` page warns "Only approve a code your own TV is showing": a
  device code can be started by anyone and sent to someone else to approve (RFC 8628 §5.4).
- **No code from other hosts, or from the rest of fiestaboard.app.** No analytics and no
  scripts, styles or fonts loaded from anywhere but this site. Each page sets a
  Content-Security-Policy of `default-src 'none'` whose `script-src`, `style-src`, `img-src` and
  `font-src` are the path `https://fiestaboard.app/link/`, not `'self'`: this site shares its
  origin with the documentation site, and `'self'` would trust every script served there. The
  source pages say `'self'` so `npm run dev` works; the build narrows them
  (`vite.config.ts`). The policy is a `<meta>` tag, since GitHub Pages can't send headers, so
  it can't carry `frame-ancestors`. Each page sends no referrer, and refuses to work inside a
  frame (that check is in script instead). `npm run test:dist` fails the build if a
  page gains an inline script or style, or a script starts reading the query string, making
  requests or using storage.

What this site cannot protect, the app and the hub must:

- **The app always asks.** A link can name any reachable hub. The app shows the hub it points to
  and connects only when the person confirms (Figma 09b, L1).
- **Codes are short-lived.** Pairing codes work once, for five minutes; the hub rate-limits
  claims. A pairing code in a link is as sensitive as the QR it replaces: share it only with your
  own phone.

## Store listings

Store addresses live in one file, [`src/config.ts`](src/config.ts).

- **App Store: placeholder (`REPLACE_ME`).** The iOS app isn't published yet. Until the address
  is filled in, the button reads "App Store: coming soon" and links nowhere. Get the listing
  address from App Store Connect › your app › App Information › "View on App Store".
- **Google Play:** built from the Android `applicationId`, `com.fiestaboard.android`. It works
  once the app is published.

## How it is built

The pages are React components using [FiestaUI](https://github.com/Fiestaboard/FiestaUI)
(`@fiestaboard/ui`), prerendered to static HTML at build time and hydrated in the browser, the
same way as [Fiestaboard/auth](https://github.com/Fiestaboard/auth).

- `index.html`, `pair.html`, `activate.html`, `open.html` are the page templates. GitHub Pages
  serves `pair.html` at both `/link/pair` and `/link/pair.html`.
- `src/pages/LinkPage.tsx` is the page; `src/entries/` the browser entry points.
- `src/prerender.tsx` and `scripts/prerender.mjs` render each page into the built HTML.

## Development

```sh
npm install
npm test          # unit tests for link parsing and validation
npm run test:render # the rendered page: headings, hrefs, warnings
npm run dev       # dev server with hot reload
npm run build     # typecheck, build and prerender into dist/
npm run test:dist # invariants of the built site (CSP, no inline code, no requests)
LINK_CSP_BASE=http://localhost:8787/ npm run build && npm run preview
                  # preview a build locally (the CSP names the address it is served from)
```

Changes to `src/lib/link.js` need a test in `tests/`. For anything that loosens what a link may
carry, explain in the pull request why it can't be abused.

## Deployment

Pushing to `main` runs the tests, builds the site, and deploys `dist/` to GitHub Pages
(`.github/workflows/deploy.yml`). Because the organization's site uses the custom domain
`fiestaboard.app`, this repository is published under `https://fiestaboard.app/link/` with that
site's certificate. This repository must not set a custom domain of its own.

The `.well-known` files that let the apps claim `/link/*` are served by
[Fiestaboard/fiestaboard.github.io](https://github.com/Fiestaboard/fiestaboard.github.io), not by
this repository.

## License

MIT. See [LICENSE](LICENSE).
