import assert from "node:assert/strict";
import { test } from "node:test";

import { HUB_LAYERS, cleanName, isLoopbackHost, parseFragment, parseHub, planLink, routeFromPath } from "../src/lib/link.js";

const PAIR_CODE = "fb_pair_Zx9-Qw_3vLm8PpRtYuIoKjHg";

// ---------------------------------------------------------------- hub address

const acceptedHubs = [
  ["http://192.168.1.50:4420", "http://192.168.1.50:4420", "192.168.1.50:4420"],
  ["http://192.168.1.50:4420/", "http://192.168.1.50:4420", "192.168.1.50:4420"],
  ["http://fiestapi.local:4420", "http://fiestapi.local:4420", "fiestapi.local:4420"],
  ["HTTP://FiestaPi.LOCAL:4420", "http://fiestapi.local:4420", "fiestapi.local:4420"],
  ["https://board.example.com", "https://board.example.com", "board.example.com"],
  ["https://board.example.com:443/", "https://board.example.com", "board.example.com"],
  ["http://10.0.0.7", "http://10.0.0.7", "10.0.0.7"],
  ["http://[fd12::1]:4420", "http://[fd12::1]:4420", "[fd12::1]:4420"],
  ["http://homeassistant.local:8123/board/kitchen", "http://homeassistant.local:8123/board/kitchen", "homeassistant.local:8123/board/kitchen"],
  ["http://raspberrypi:4420", "http://raspberrypi:4420", "raspberrypi:4420"],
];

for (const [raw, base, display] of acceptedHubs) {
  test(`hub accepted: ${raw}`, () => {
    const result = parseHub(raw);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.hub.base, base);
    assert.equal(result.hub.display, display);
  });
}

const refusedHubs = [
  // Loopback, in every spelling the URL parser normalizes (H18).
  ["http://localhost:4420", "loopback"],
  ["http://LOCALHOST", "loopback"],
  ["http://localhost.:4420", "loopback"],
  ["http://localhost..", "loopback"],
  ["http://localhost...:4420", "loopback"],
  ["http://board.localhost..", "loopback"],
  ["http://board.localhost", "loopback"],
  ["http://127.0.0.1:4420", "loopback"],
  ["http://127.8.9.10", "loopback"],
  ["http://0.0.0.0:4420", "loopback"],
  ["http://0:4420", "loopback"],
  ["http://2130706433", "loopback"], // 127.0.0.1 as one number
  ["http://0x7f.1", "loopback"], // 127.0.0.1 in hex
  ["http://0177.0.0.1", "loopback"], // 127.0.0.1 in octal
  ["http://127.1", "loopback"],
  ["http://[::1]:4420", "loopback"],
  ["http://[::]", "loopback"],
  ["http://[0:0:0:0:0:0:0:1]", "loopback"],
  ["http://[::ffff:127.0.0.1]", "loopback"],
  ["http://[::ffff:7f00:1]", "loopback"],
  ["http://[::127.0.0.1]", "loopback"],
  // Not a web address.
  ["javascript:alert(1)", "scheme"],
  ["JaVaScRiPt:alert(1)", "scheme"],
  ["data:text/html,<script>alert(1)</script>", "scheme"],
  ["file:///etc/passwd", "scheme"],
  ["ftp://192.168.1.50", "scheme"],
  ["fiestaboard://pair", "scheme"],
  ["vbscript:msgbox", "scheme"],
  // Credentials.
  ["http://user:pass@192.168.1.50", "credentials"],
  ["http://user@192.168.1.50", "credentials"],
  ["http://@192.168.1.50", "credentials"],
  ["http://192.168.1.50@evil.example", "credentials"],
  // Malformed or ambiguous.
  ["192.168.1.50:4420", "malformed"], // no scheme: never guess
  ["//evil.example", "malformed"],
  ["http:evil.example", "malformed"],
  ["http:/evil.example", "malformed"],
  ["http:///evil.example", "malformed"],
  ["http://", "malformed"],
  ["http://192.168.1.50/?next=x", "malformed"],
  ["http://192.168.1.50/#x", "malformed"],
  [" http://192.168.1.50", "malformed"],
  ["http://192.168.1.50 ", "malformed"],
  ["http://192.168.1.50\n", "malformed"],
  ["http://192.168.1.50\t/x", "malformed"],
  ["http:\\\\evil.example", "malformed"],
  ["http://evil.example\\@192.168.1.50", "malformed"],
  ["http://192.168.1.50/../admin", "malformed"],
  ["http://192.168.1.50/a/%2e%2e/b", "malformed"],
  ["http://192.168.1.50//double", "malformed"],
  ["http://192.168.1.50/<script>", "malformed"],
  ['http://192.168.1.50/"onmouseover=x', "malformed"],
  ["http://192.168.1.50/'x", "malformed"],
  ["http://exa mple.com", "malformed"],
  ["http://[::1", "malformed"],
  ["http://999.999.999.999", "malformed"],
  [`http://${"a".repeat(600)}.example`, "malformed"],
  ["", "missing"],
  [undefined, "missing"],
  [null, "missing"],
  [42, "missing"],
  [["http://192.168.1.50"], "missing"],
];

for (const [raw, reason] of refusedHubs) {
  test(`hub refused (${reason}): ${JSON.stringify(raw)?.slice(0, 60)}`, () => {
    assert.deepEqual(parseHub(raw), { ok: false, reason });
  });
}

test("loopback check mirrors the hub's is_loopback", () => {
  for (const host of ["localhost", "a.b.localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]", "[::ffff:7f00:1]"]) {
    assert.equal(isLoopbackHost(host), true, host);
  }
  for (const host of ["192.168.1.50", "fiestapi.local", "localhost.example.com", "my-localhost", "[fd12::1]", "[::ffff:c0a8:132]"]) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

// ---------------------------------------------------------------- each layer alone

// parseHub runs several layers, and some inputs are refused by more than one.
// Each layer is tested on its own here, so removing any one of them fails a
// test even when another layer would still catch the same input.
const { checkRawText, checkRawAuthority, checkRawPath, checkParsed, checkPathAgrees } = HUB_LAYERS;
const GOOD = "http://fiestapi.local:4420/base";

test("layer: raw text", () => {
  assert.equal(checkRawText(GOOD), null);
  assert.equal(checkRawText(undefined), "missing");
  assert.equal(checkRawText("javascript:alert(1)"), "scheme");
  assert.equal(checkRawText("192.168.1.50"), "malformed");
  assert.equal(checkRawText(" http://h"), "malformed");
  assert.equal(checkRawText("http://h\\x"), "malformed");
  assert.equal(checkRawText("http://h/?"), "malformed"); // url.search is "" for a bare "?"
  assert.equal(checkRawText("http://h/#"), "malformed"); // url.hash is "" for a bare "#"
  assert.equal(checkRawText("http:/h"), "malformed");
});

test("layer: raw authority", () => {
  assert.equal(checkRawAuthority(GOOD), null);
  assert.equal(checkRawAuthority("http://@h"), "credentials"); // username parses as ""
  assert.equal(checkRawAuthority("http://u@h"), "credentials");
});

test("layer: raw path", () => {
  assert.equal(checkRawPath(GOOD), null);
  assert.equal(checkRawPath("http://h"), null);
  assert.equal(checkRawPath("http://h/a/./b"), "malformed");
  assert.equal(checkRawPath("http://h/a/../b"), "malformed");
  assert.equal(checkRawPath("http://h/%2E%2E"), "malformed");
  assert.equal(checkRawPath("http://h/a/%2e/b"), "malformed");
  assert.equal(checkRawPath("http://h//a"), "malformed");
  assert.equal(checkRawPath("http://h/<b>"), "malformed");
});

test("layer: parsed URL", () => {
  assert.equal(checkParsed(new URL(GOOD)), null);
  assert.equal(checkParsed(new URL("ftp://h")), "scheme");
  assert.equal(checkParsed(new URL("http://u:p@h")), "credentials");
  assert.equal(checkParsed(new URL("http://h/?q=1")), "malformed");
  assert.equal(checkParsed(new URL("http://h/#x")), "malformed");
  assert.equal(checkParsed(new URL("http://0x7f.1")), "loopback");
  assert.equal(checkParsed(new URL("http://[::1]")), "loopback");
});

test("layer: parsed path agrees with the path as written", () => {
  assert.equal(checkPathAgrees(new URL(GOOD), GOOD), null);
  assert.equal(checkPathAgrees(new URL(`${GOOD}/`), `${GOOD}/`), null);
  for (const raw of ["http://h/a/./b", "http://h/a/%2e/b", "http://h/a/../b", "http://h/%2E%2E"]) {
    assert.equal(checkPathAgrees(new URL(raw), raw), "malformed", raw);
  }
});

// ---------------------------------------------------------------- fragment

test("fragment: decodes fields", () => {
  const fields = parseFragment("#v=1&hub=http%3A%2F%2Ffiestapi.local%3A4420&name=Maya%E2%80%99s%20FiestaPi");
  assert.equal(fields.get("v"), "1");
  assert.equal(fields.get("hub"), "http://fiestapi.local:4420");
  assert.equal(fields.get("name"), "Maya’s FiestaPi");
});

test("fragment: empty is empty", () => {
  assert.equal(parseFragment("").size, 0);
  assert.equal(parseFragment("#").size, 0);
  assert.equal(parseFragment(undefined).size, 0);
});

test("fragment: a repeated key is refused, so no two parsers can disagree", () => {
  assert.equal(parseFragment("hub=http://a.local&hub=http://b.local"), null);
  assert.equal(parseFragment("hub=x&h%75b=y"), null);
});

test("fragment: bad percent-encoding is refused", () => {
  assert.equal(parseFragment("hub=%E0%A4%A"), null);
  assert.equal(parseFragment("hub=%"), null);
});

test("fragment: oversized is refused", () => {
  assert.equal(parseFragment("a=" + "x".repeat(5000)), null);
});

test("fragment: prototype keys are plain data", () => {
  const fields = parseFragment("__proto__=x&constructor=y");
  assert.equal(fields.get("__proto__"), "x");
  assert.equal({}.x, undefined);
});

// ---------------------------------------------------------------- name

test("name: plain text kept, odd text dropped", () => {
  assert.equal(cleanName("  Maya’s FiestaPi "), "Maya’s FiestaPi");
  assert.equal(cleanName("<img src=x onerror=alert(1)>"), "<img src=x onerror=alert(1)>"); // shown as text, never HTML
  assert.equal(cleanName(""), null);
  assert.equal(cleanName("   "), null);
  assert.equal(cleanName("x".repeat(65)), null);
  assert.equal(cleanName("Kitchen‮gnp.exe"), null); // right-to-left override
  assert.equal(cleanName("Kit​chen"), null); // zero-width space
  assert.equal(cleanName("Kitchen\nBoard"), null);
  assert.equal(cleanName(undefined), null);
  // Written as escapes so the test can't silently lose them either.
  for (const invisible of ["\u2028", "\u2029", "\u061C", "\u2060", "\u2061", "\u2064", "\u180E", "\u115F", "\u1160",
    "\u3164", "\uFFA0", "\u200B", "\u200D", "\u200E", "\u202A", "\u202E", "\u2066", "\u2069", "\uFEFF", "\u00AD"]) {
    assert.equal(cleanName(`Kitchen${invisible}Board`), null, `U+${invisible.codePointAt(0).toString(16)}`);
  }
  assert.equal(cleanName("Küche Ünö 台所 🎉"), "Küche Ünö 台所 🎉");
});

// ---------------------------------------------------------------- routes

test("routes come from the last path segment", () => {
  assert.equal(routeFromPath("/link/pair"), "pair");
  assert.equal(routeFromPath("/link/pair.html"), "pair");
  assert.equal(routeFromPath("/link/activate"), "activate");
  assert.equal(routeFromPath("/link/open"), "open");
  assert.equal(routeFromPath("/link/"), "");
  assert.equal(routeFromPath("/link"), "");
  assert.equal(routeFromPath("/link/index.html"), "");
  assert.equal(routeFromPath("/link/admin"), "unknown");
  assert.equal(routeFromPath("/link/__proto__"), "unknown");
  assert.equal(routeFromPath("/link/constructor"), "unknown");
});

// ---------------------------------------------------------------- planLink

const hubParam = encodeURIComponent("http://fiestapi.local:4420");

test("pair: a link from the hub's QR fragment", () => {
  const plan = planLink(
    "/link/pair",
    `#v=1&hub=${hubParam}&id=inst_123&name=Maya%E2%80%99s%20FiestaPi&code=${PAIR_CODE}`,
  );
  assert.equal(plan.kind, "link");
  assert.equal(plan.route, "pair");
  assert.equal(plan.hub.display, "fiestapi.local:4420");
  assert.equal(plan.name, "Maya’s FiestaPi");
  assert.equal(
    plan.appUrl,
    `fiestaboard://pair#v=1&hub=${hubParam}&id=inst_123&name=Maya%E2%80%99s%20FiestaPi&code=${PAIR_CODE}`,
  );
  assert.equal(plan.browserUrl, "http://fiestapi.local:4420/");
  assert.doesNotMatch(plan.browserUrl, /fb_pair_/, "the pairing code never goes to the browser page");
});

test("pair: the app URL is rebuilt from validated fields, not copied", () => {
  const plan = planLink("/link/pair", `#hub=${hubParam}&code=${PAIR_CODE}&evil=1&id=%3Cx%3E&name=%0A`);
  assert.equal(plan.kind, "link");
  assert.equal(plan.appUrl, `fiestaboard://pair#v=1&hub=${hubParam}&code=${PAIR_CODE}`);
});

test("pair: bad or missing codes are refused", () => {
  for (const code of ["", "short", "has space", "a+b".repeat(4), "x".repeat(129), "<script>alert(1)</script>"]) {
    const plan = planLink("/link/pair", `#hub=${hubParam}&code=${encodeURIComponent(code)}`);
    assert.deepEqual(plan, { kind: "invalid", route: "pair", reason: "code" }, code);
  }
});

test("pair: a loopback hub is refused, as the app refuses it (H18)", () => {
  const plan = planLink("/link/pair", `#hub=${encodeURIComponent("http://localhost:4420")}&code=${PAIR_CODE}`);
  assert.deepEqual(plan, { kind: "invalid", route: "pair", reason: "loopback" });
});

test("pair: an unknown link version is refused", () => {
  const plan = planLink("/link/pair", `#v=2&hub=${hubParam}&code=${PAIR_CODE}`);
  assert.deepEqual(plan, { kind: "invalid", route: "pair", reason: "version" });
});

test("activate: code is normalized and sent to the hub's own /activate", () => {
  const plan = planLink("/link/activate", `#hub=${hubParam}&code=bcdf-ghjk`);
  assert.equal(plan.kind, "link");
  assert.equal(plan.code, "BCDF-GHJK");
  assert.equal(plan.browserUrl, "http://fiestapi.local:4420/activate?user_code=BCDF-GHJK");
  assert.equal(plan.appUrl, `fiestaboard://activate#hub=${hubParam}&code=BCDF-GHJK`);
  assert.equal(planLink("/link/activate", `#hub=${hubParam}&code=BCDFGHJK`).code, "BCDF-GHJK");
});

test("activate: codes outside the hub's alphabet are refused", () => {
  for (const code of ["ABCD-EFGH", "BCDF-GHJ0", "BCDF-GHJ1", "BCDF-GHJ", "BCDF--GHJK", "BCDF-GHJK-L", "BCDF GHJK", ""]) {
    const plan = planLink("/link/activate", `#hub=${hubParam}&code=${encodeURIComponent(code)}`);
    assert.deepEqual(plan, { kind: "invalid", route: "activate", reason: "code" }, code);
  }
});

test("activate: a hub with a base path keeps it", () => {
  const hub = encodeURIComponent("http://homeassistant.local:8123/board/kitchen/");
  const plan = planLink("/link/activate", `#hub=${hub}&code=BCDF-GHJK`);
  assert.equal(plan.browserUrl, "http://homeassistant.local:8123/board/kitchen/activate?user_code=BCDF-GHJK");
});

test("open: page ids are one safe path segment", () => {
  const plan = planLink("/link/open", `#hub=${hubParam}&page=morning-news_2`);
  assert.equal(plan.kind, "link");
  assert.equal(plan.browserUrl, "http://fiestapi.local:4420/pages/edit/morning-news_2");
  assert.equal(plan.appUrl, `fiestaboard://open#hub=${hubParam}&page=morning-news_2`);
  for (const page of ["", ".", "..", "../settings", "a/b", "a?b", "a#b", "%2e%2e", "x".repeat(129), "<b>"]) {
    const bad = planLink("/link/open", `#hub=${hubParam}&page=${encodeURIComponent(page)}`);
    assert.deepEqual(bad, { kind: "invalid", route: "open", reason: "page" }, page);
  }
});

test("hostile hubs never produce a link", () => {
  for (const [raw] of refusedHubs) {
    if (typeof raw !== "string") continue;
    const plan = planLink("/link/activate", `#hub=${encodeURIComponent(raw)}&code=BCDF-GHJK`);
    assert.equal(plan.kind, "invalid", raw);
  }
});

test("every URL a link produces is fiestaboard:// or the hub's own http(s) address", () => {
  const plans = [
    planLink("/link/pair", `#hub=${hubParam}&code=${PAIR_CODE}`),
    planLink("/link/activate", `#hub=${hubParam}&code=BCDF-GHJK`),
    planLink("/link/open", `#hub=${hubParam}&page=p1`),
  ];
  for (const plan of plans) {
    assert.match(plan.appUrl, /^fiestaboard:\/\/(pair|activate|open)#/);
    assert.ok(plan.browserUrl.startsWith("http://fiestapi.local:4420/"), plan.browserUrl);
  }
});

test("data in the query string is ignored: only the fragment counts", () => {
  // planLink is never given location.search at all; a link that puts data
  // there has nothing in the fragment.
  assert.deepEqual(planLink("/link/pair", ""), { kind: "invalid", route: "pair", reason: "empty" });
});

test("missing, garbled and duplicated data", () => {
  assert.deepEqual(planLink("/link/pair", `#code=${PAIR_CODE}`), { kind: "invalid", route: "pair", reason: "missing" });
  assert.deepEqual(planLink("/link/pair", "#hub=%ZZ"), { kind: "invalid", route: "pair", reason: "garbled" });
  assert.deepEqual(
    planLink("/link/pair", `#hub=${hubParam}&hub=${encodeURIComponent("http://evil.example")}&code=${PAIR_CODE}`),
    { kind: "invalid", route: "pair", reason: "garbled" },
  );
});

test("the index and unknown routes", () => {
  assert.deepEqual(planLink("/link/", `#hub=${hubParam}`), { kind: "home" });
  assert.deepEqual(planLink("/link/delete", `#hub=${hubParam}`), { kind: "unknown" });
});
