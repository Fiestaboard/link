// Link parsing and validation: the security boundary of this site.
//
// A FiestaBoard app link looks like
//
//   https://fiestaboard.app/link/<route>#<key>=<value>&<key>=<value>
//
// and everything it carries (the hub's address, a one-time code, a page id)
// is in the fragment. Browsers never send the fragment over the network, so none of
// it reaches fiestaboard.app or GitHub.
//
// A link can come from anyone, so nothing in it is trusted:
//
//   - the hub must be an http or https address with no username, password,
//     query or fragment, and never a loopback address (the same rule as the
//     hub's own H18 check: a phone that follows "localhost" reaches itself);
//   - codes and page ids must match the exact shape the hub issues;
//   - a key that appears twice makes the whole link unusable, so two parsers
//     can never disagree about which value counts;
//   - the URLs this site builds (the app's fiestaboard:// address and the
//     hub's own page) are assembled from the validated values only, never by
//     copying the raw fragment.
//
// No DOM access in here: everything is a pure function so `node --test` can
// exercise it without a browser.

/** The custom URL scheme the phone apps register. The hub's QR uses it too. */
export const APP_SCHEME = "fiestaboard:";

/** Routes this site understands, and the fields each one needs. */
export const ROUTES = ["pair", "activate", "open"];

// A fragment longer than this is not a link the hub made.
const MAX_FRAGMENT_LENGTH = 2048;
const MAX_HUB_LENGTH = 512;
const MAX_NAME_LENGTH = 64;

// The hub's /activate code: eight characters from this alphabet (no vowels,
// no 0/1, so no words and no look-alikes), shown as XXXX-XXXX.
// Mirrors ALPHABET in the hub's src/auth/device_service.py.
const USER_CODE = /^([BCDFGHJKLMNPQRSTVWXYZ2-9]{4})-?([BCDFGHJKLMNPQRSTVWXYZ2-9]{4})$/;

// A pairing code: URL-safe base64 with the hub's prefix, at most 128
// characters (the hub's PairingClaim limit).
const PAIRING_CODE = /^[A-Za-z0-9_-]{8,128}$/;

// The hub's install id, from /discover. Optional; dropped if odd.
const INSTALL_ID = /^[A-Za-z0-9_-]{1,64}$/;

// A page id: one URL path segment of unreserved characters, as the apps
// accept (DeploymentURL.validSegment).
const PAGE_ID = /^[A-Za-z0-9._~-]{1,128}$/;

// A hub base path: unreserved characters, percent escapes and slashes.
const HUB_PATH = /^(\/[A-Za-z0-9._~%-]*)*$/;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Whether a hostname (as URL.hostname gives it) means "this device" to
 * whoever opens it. Mirrors is_loopback in the hub's src/auth/hub_addresses.py
 * (localhost, *.localhost, loopback and unspecified addresses) and is a little
 * stricter: all of 0.0.0.0/8, and IPv4 loopback written as an IPv6 address.
 */
export function isLoopbackHost(hostname) {
  // Every trailing dot: "localhost.." is still localhost to some resolvers.
  const host = String(hostname).toLowerCase().replace(/\.+$/, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost")) return true;
  const v4 = IPV4.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    return a === 127 || a === 0;
  }
  if (host.startsWith("[") && host.endsWith("]")) {
    const address = host.slice(1, -1);
    if (address === "::1" || address === "::") return true;
    // The URL parser writes ::ffff:127.0.0.1 as ::ffff:7f00:1, and the
    // deprecated ::127.0.0.1 as ::7f00:1.
    const embedded = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
    if (embedded) {
      const high = parseInt(embedded[1], 16);
      const first = high >> 8;
      return first === 127 || first === 0;
    }
  }
  return false;
}

// The checks a hub address passes, in order. Each is a separate layer on
// purpose, and each is exported so tests/link.test.js can prove every one
// refuses its inputs on its own: removing any layer must fail a test even when
// another layer would still refuse the same address.
//
// Each returns null (pass) or a refusal reason.

/** Layer 1, the raw text: type, length, characters, scheme, no ? or #. */
function checkRawText(raw) {
  if (typeof raw !== "string" || raw === "") return "missing";
  if (raw.length > MAX_HUB_LENGTH) return "malformed";
  // No whitespace, control characters or backslashes anywhere: the URL parser
  // would quietly drop or reinterpret them, and the hub never sends them.
  if (/[\s\u0000-\u001f\u007f-\u009f\\]/.test(raw)) return "malformed";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (!scheme) return "malformed";
  const name = scheme[1].toLowerCase();
  if (name !== "http" && name !== "https") return "scheme";
  if (!/^https?:\/\/[^/]/i.test(raw)) return "malformed";
  if (raw.includes("?") || raw.includes("#")) return "malformed";
  return null;
}

/** The authority ("host:port", maybe with userinfo) as written. */
function rawAuthority(raw) {
  return raw.slice(raw.indexOf("//") + 2).split("/")[0];
}

/** The path as written, without one trailing slash. */
function rawPathOf(raw) {
  return raw.slice(raw.indexOf("//") + 2 + rawAuthority(raw).length).replace(/\/$/, "");
}

/** Layer 2, the raw authority: no userinfo, even an empty one ("http://@host"). */
function checkRawAuthority(raw) {
  return rawAuthority(raw).includes("@") ? "credentials" : null;
}

/**
 * Layer 3, the raw path, before the URL parser can resolve "..", "%2e" or
 * escape characters: a plain base path or nothing.
 */
function checkRawPath(raw) {
  const rawPath = rawPathOf(raw);
  if (!HUB_PATH.test(rawPath)) return "malformed";
  const segments = rawPath.split("/").slice(1);
  if (segments.some((segment) => segment === "" || /^(\.|%2e){1,2}$/i.test(segment))) return "malformed";
  return null;
}

/** Layer 4, the parsed URL: protocol, credentials, query, fragment, host, loopback. */
function checkParsed(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return "scheme";
  if (url.username || url.password) return "credentials";
  if (url.search || url.hash || !url.hostname) return "malformed";
  if (isLoopbackHost(url.hostname)) return "loopback";
  return null;
}

/** Layer 5, agreement: the parsed path must be exactly the path as written. */
function checkPathAgrees(url, raw) {
  return url.pathname.replace(/\/$/, "") === rawPathOf(raw) ? null : "malformed";
}

export const HUB_LAYERS = { checkRawText, checkRawAuthority, checkRawPath, checkParsed, checkPathAgrees };

/**
 * Parse a hub address from a link.
 *
 * Returns `{ ok: true, hub }` with `hub.base` (origin plus any base path, no
 * trailing slash) and `hub.display` (host, port and path, for showing as
 * text), or `{ ok: false, reason }` where reason is one of
 * missing | malformed | scheme | credentials | loopback.
 */
export function parseHub(raw) {
  const refused = (reason) => ({ ok: false, reason });
  let reason = checkRawText(raw) ?? checkRawAuthority(raw) ?? checkRawPath(raw);
  if (reason) return refused(reason);
  let url;
  try {
    url = new URL(raw);
  } catch {
    return refused("malformed");
  }
  reason = checkParsed(url) ?? checkPathAgrees(url, raw);
  if (reason) return refused(reason);
  const path = url.pathname.replace(/\/$/, "");
  return {
    ok: true,
    hub: { base: url.origin + path, display: url.host + path, secure: url.protocol === "https:" },
  };
}

/**
 * Split a URL fragment into its fields. Returns null when it is too long,
 * cannot be decoded, or names any key twice.
 */
export function parseFragment(hash) {
  const text = String(hash ?? "").replace(/^#/, "");
  if (text.length > MAX_FRAGMENT_LENGTH) return null;
  const fields = new Map();
  if (text === "") return fields;
  for (const part of text.split("&")) {
    if (part === "") continue;
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawValue = eq === -1 ? "" : part.slice(eq + 1);
    let key;
    let value;
    try {
      // "+" is a space in form encoding; the hub encodes spaces as %20, and a
      // literal "+" is never valid in any field below, so treat it as itself.
      key = decodeURIComponent(rawKey);
      value = decodeURIComponent(rawValue);
    } catch {
      return null;
    }
    if (fields.has(key)) return null;
    fields.set(key, value);
  }
  return fields;
}

/** The hub's display name: plain text, trimmed, short, or nothing. */
export function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name === "" || name.length > MAX_NAME_LENGTH) return null;
  // Control and format characters (bidirectional marks and overrides,
  // zero-width characters, U+061C, U+2060-2064, U+FEFF, U+180E), line and
  // paragraph separators, and the Hangul fillers that render as blank space:
  // anything that makes the text read differently from what it is. Written as
  // escapes so no editor can strip them.
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u115F\u1160\u3164\uFFA0]/u.test(name)) return null;
  return name;
}

/** The route a pathname names: "pair", "activate", "open", "" (the index) or "unknown". */
export function routeFromPath(pathname) {
  const segments = String(pathname ?? "")
    .split("/")
    .filter(Boolean);
  const last = (segments.at(-1) ?? "").replace(/\.html$/, "");
  if (last === "" || last === "link" || last === "index") return "";
  return ROUTES.includes(last) ? last : "unknown";
}

function encodeFields(fields) {
  // encodeURIComponent, not URLSearchParams: a space must be %20, which every
  // URL parser decodes (iOS's URLComponents leaves "+" as "+").
  return Object.entries(fields)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/**
 * Decide what a link means.
 *
 * Returns one of
 *   { kind: "home" }                         no route: the site's own index
 *   { kind: "unknown" }                      a route this site does not know
 *   { kind: "invalid", route, reason }       a known route whose data is unusable
 *   { kind: "link", route, hub, name, code?, page?, appUrl, browserUrl }
 *
 * reason is one of: empty | garbled | version | missing | malformed | scheme |
 * credentials | loopback | code | page.
 */
export function planLink(pathname, hash) {
  const route = routeFromPath(pathname);
  if (route === "") return { kind: "home" };
  if (route === "unknown") return { kind: "unknown" };

  const fields = parseFragment(hash);
  if (fields === null) return { kind: "invalid", route, reason: "garbled" };
  if (fields.size === 0) return { kind: "invalid", route, reason: "empty" };
  if (fields.has("v") && fields.get("v") !== "1") return { kind: "invalid", route, reason: "version" };

  const parsed = parseHub(fields.get("hub"));
  if (!parsed.ok) return { kind: "invalid", route, reason: parsed.reason };
  const { hub } = parsed;
  const name = cleanName(fields.get("name"));
  const id = INSTALL_ID.test(fields.get("id") ?? "") ? fields.get("id") : null;

  if (route === "pair") {
    const code = fields.get("code") ?? "";
    if (!PAIRING_CODE.test(code)) return { kind: "invalid", route, reason: "code" };
    return {
      kind: "link",
      route,
      hub,
      name,
      code,
      appUrl: `${APP_SCHEME}//pair#${encodeFields({ v: "1", hub: hub.base, id, name, code })}`,
      // A pairing code only works in the app. Without it, the person can
      // still open their hub; it shows a fresh QR for when the app is there.
      browserUrl: `${hub.base}/`,
    };
  }

  if (route === "activate") {
    const match = USER_CODE.exec((fields.get("code") ?? "").toUpperCase());
    if (!match) return { kind: "invalid", route, reason: "code" };
    const code = `${match[1]}-${match[2]}`;
    return {
      kind: "link",
      route,
      hub,
      name,
      code,
      appUrl: `${APP_SCHEME}//activate#${encodeFields({ hub: hub.base, id, name, code })}`,
      // The hub's own approval page, with the code filled in. The hub reads it
      // from ?user_code= (its verification_path_complete). This request goes
      // to the hub, never to fiestaboard.app.
      browserUrl: `${hub.base}/activate?user_code=${encodeURIComponent(code)}`,
    };
  }

  // route === "open"
  const page = fields.get("page") ?? "";
  if (!PAGE_ID.test(page) || page === "." || page === "..") return { kind: "invalid", route, reason: "page" };
  return {
    kind: "link",
    route,
    hub,
    name,
    page,
    appUrl: `${APP_SCHEME}//open#${encodeFields({ hub: hub.base, id, name, page })}`,
    browserUrl: `${hub.base}/pages/edit/${encodeURIComponent(page)}`,
  };
}
