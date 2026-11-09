// The rendered page, in Node: what a person actually sees and where every
// control goes. Run by `npm run test:render`, which first builds
// src/render.tsx into dist-render/.
//
// These catch what the unit tests can't: a component that builds an href from
// the raw fragment, or that puts the link's unverified `name` where the
// destination should be.
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderLink } from "../dist-render/render.js";

const STORE_AND_REPO = new Set([
  "https://play.google.com/store/apps/details?id=com.fiestaboard.android",
  "https://github.com/Fiestaboard/link#readme",
]);
const PAIR_CODE = "fb_pair_Zx9-Qw_3vLm8PpRtYuIoKjHg";
const enc = encodeURIComponent;

const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => decode(m[1]));
const text = (html) => decode(html.replace(/<[^>]+>/g, ""));
const h1 = (html) => text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)[1]);
const continueLink = (html) => {
  const match = /<a\b([^>]*data-testid="continue"[^>]*)>([\s\S]*?)<\/a>/.exec(html);
  return { href: decode(/\shref="([^"]*)"/.exec(match[1])[1]), label: text(match[2]) };
};

// ---------------------------------------------------------------- MF1: name spoofing

test("a name that looks like a hub never stands in for the real destination", () => {
  const html = renderLink(
    "/link/activate",
    `#hub=${enc("https://fiestaboard-hub.example.net")}&name=${enc("fiestapi.local:4420")}&code=BCDF-GHJK`,
  );
  assert.equal(h1(html), "Approve a sign-in on fiestaboard-hub.example.net");
  const go = continueLink(html);
  assert.equal(go.label, "Continue to fiestaboard-hub.example.net");
  assert.equal(go.href, "https://fiestaboard-hub.example.net/activate?user_code=BCDF-GHJK");
  // The name appears once, as labelled secondary text, and nowhere else.
  const nameSpan = /<span[^>]*data-testid="hub-name"[^>]*>([\s\S]*?)<\/span>/.exec(html);
  assert.equal(text(nameSpan[1]), "It calls itself “fiestapi.local:4420”.");
  assert.equal(html.split("fiestapi.local:4420").length - 1, 1, "only in the name span (the app URL encodes it)");
  assert.ok(!text(html.replace(nameSpan[0], "")).includes("fiestapi.local:4420"));
});

for (const route of ["pair", "open"]) {
  test(`${route}: the heading and the Continue button name the validated host`, () => {
    const extra = route === "pair" ? `code=${PAIR_CODE}` : "page=p1";
    const html = renderLink(`/link/${route}`, `#hub=${enc("http://evil.example:8080")}&name=My%20FiestaPi&${extra}`);
    assert.match(h1(html), /evil\.example:8080$/);
    assert.doesNotMatch(h1(html), /My FiestaPi/);
    assert.equal(continueLink(html).label, "Continue to evil.example:8080");
  });
}

// ---------------------------------------------------------------- hrefs

// Raw forms the parser normalizes, so an href copied from the raw fragment
// would differ from the expected one.
const EXPECTED = [
  ["/link/pair", `#hub=${enc("HTTP://FiestaPi.LOCAL:4420/")}&code=${PAIR_CODE}`, "http://fiestapi.local:4420/",
    `fiestaboard://pair#v=1&hub=${enc("http://fiestapi.local:4420")}&code=${PAIR_CODE}`],
  ["/link/activate", `#hub=${enc("https://Board.Example.com:443/base/")}&code=bcdfghjk`,
    "https://board.example.com/base/activate?user_code=BCDF-GHJK",
    `fiestaboard://activate#hub=${enc("https://board.example.com/base")}&code=BCDF-GHJK`],
  ["/link/open", `#hub=${enc("http://192.168.1.50:4420")}&page=morning&evil=${enc("javascript:alert(1)")}`,
    "http://192.168.1.50:4420/pages/edit/morning", `fiestaboard://open#hub=${enc("http://192.168.1.50:4420")}&page=morning`],
];

for (const [path, hash, browserUrl, appUrl] of EXPECTED) {
  test(`${path}: every href is built from validated values`, () => {
    const html = renderLink(path, hash);
    const links = hrefs(html);
    assert.equal(continueLink(html).href, browserUrl);
    assert.ok(links.includes(appUrl), `${appUrl} not in ${links}`);
    for (const href of links) {
      assert.ok(href === browserUrl || href === appUrl || STORE_AND_REPO.has(href), `unexpected href ${href}`);
    }
  });
}

const HOSTILE = [
  `#hub=${enc("javascript:alert(1)")}&code=BCDF-GHJK`,
  `#hub=${enc("http://localhost:4420")}&code=BCDF-GHJK`,
  `#hub=${enc("http://localhost..")}&code=BCDF-GHJK`,
  `#hub=${enc("http://2130706433")}&code=BCDF-GHJK`,
  `#hub=${enc("http://user@192.168.1.50")}&code=BCDF-GHJK`,
  `#hub=${enc("http://192.168.1.50/../x")}&code=BCDF-GHJK`,
  `#hub=${enc("http://192.168.1.50")}&hub=${enc("http://evil.example")}&code=BCDF-GHJK`,
  `#hub=${enc('http://192.168.1.50/"><script>alert(1)</script>')}&code=BCDF-GHJK`,
  `#hub=${enc("http://192.168.1.50")}&code=${enc('"><img src=x onerror=alert(1)>')}`,
  "#%ZZ",
  "",
];

for (const hash of HOSTILE) {
  test(`hostile link offers nothing to follow: ${hash.slice(0, 70)}`, () => {
    const html = renderLink("/link/activate", hash);
    assert.equal(h1(html), "This link can't be used");
    for (const href of hrefs(html)) assert.ok(STORE_AND_REPO.has(href), `unexpected href ${href}`);
    assert.doesNotMatch(html, /<script|<img|onerror=/i);
  });
}

test("a name with markup is shown as text", () => {
  const html = renderLink(
    "/link/pair",
    `#hub=${enc("http://fiestapi.local:4420")}&code=${PAIR_CODE}&name=${enc("<img src=x onerror=alert(1)>")}`,
  );
  assert.doesNotMatch(html, /<img/);
  assert.match(text(html), /It calls itself “<img src=x onerror=alert\(1\)>”\./);
});

test("activate warns against approving a code someone else sent (RFC 8628 §5.4)", () => {
  const html = renderLink("/link/activate", `#hub=${enc("http://fiestapi.local:4420")}&code=BCDF-GHJK`);
  assert.match(text(html), /Only approve a code your own TV is showing/);
  assert.match(text(html), /If someone sent you this link, don't approve it\./);
  const pair = renderLink("/link/pair", `#hub=${enc("http://fiestapi.local:4420")}&code=${PAIR_CODE}`);
  assert.doesNotMatch(pair, /activate-warning/);
});

test("copy follows the canon: no 'server'", () => {
  for (const [path, hash] of EXPECTED) assert.doesNotMatch(text(renderLink(path, hash)), /\bserver\b/i);
});
