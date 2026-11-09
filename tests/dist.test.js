// Invariants of the built site. Run after `npm run build`.
//
// These are the properties a dependency bump or a bundler change could break
// without any source file here changing.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const dist = resolve(import.meta.dirname, "../dist");
const PAGES = ["index.html", "pair.html", "activate.html", "open.html"];
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'";

const read = (path) => readFileSync(resolve(dist, path), "utf8");
const attributes = (html, tag, name) =>
  [...html.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${name}="([^"]*)"`, "g"))].map((match) => match[1]);

test("GitHub Pages is told not to run Jekyll", () => {
  assert.ok(existsSync(resolve(dist, ".nojekyll")));
});

for (const page of PAGES) {
  const html = read(page);

  test(`${page} sets the strict Content-Security-Policy`, () => {
    assert.deepEqual(attributes(html, "meta", "content").filter((value) => value.startsWith("default-src")), [CSP]);
  });

  test(`${page} sends no referrer`, () => {
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
  });

  test(`${page} has no inline script, which the CSP would block`, () => {
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      assert.match(attrs, /\ssrc="/, `inline <script> found: ${body.slice(0, 80)}`);
      assert.equal(body.trim(), "");
    }
    assert.doesNotMatch(html, /\son[a-z]+="/, "inline event handler found");
  });

  test(`${page} has no inline style, which the CSP would block`, () => {
    assert.doesNotMatch(html, /<style\b/);
    assert.doesNotMatch(html, /\sstyle="/);
  });

  test(`${page} loads scripts, styles and icons only from this site, by relative path`, () => {
    const urls = [
      ...attributes(html, "script", "src"),
      ...attributes(html, "link", "href"),
    ];
    assert.ok(urls.length > 0);
    for (const url of urls) {
      assert.doesNotMatch(url, /^([a-z][a-z0-9+.-]*:|\/)/i, `${url} is not relative`);
      assert.ok(existsSync(resolve(dist, dirname(page), url)), `${url} does not exist in dist`);
    }
  });

  test(`${page} loads images from this site or embeds the loading artwork`, () => {
    for (const url of attributes(html, "img", "src")) {
      if (url.startsWith("data:")) {
        assert.match(url, /^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
      } else {
        assert.doesNotMatch(url, /^([a-z][a-z0-9+.-]*:|\/)/i, "image URL must be relative");
        assert.ok(existsSync(resolve(dist, dirname(page), url)), `${url} does not exist in dist`);
      }
    }
  });

  test(`${page} is prerendered`, () => {
    assert.doesNotMatch(html, /<!--app-->/);
    assert.match(html, /<div id="root"><main\b/);
    assert.match(html, /<h1\b/);
  });
}

test("no script or stylesheet references another host", () => {
  for (const file of readdirSync(resolve(dist, "assets")).filter((name) => /\.(css)$/.test(name))) {
    const css = readFileSync(resolve(dist, "assets", file), "utf8");
    for (const [, url] of css.matchAll(/url\(([^)]+)\)/g)) {
      assert.doesNotMatch(url.replace(/^["']/, ""), /^(https?:)?\/\//, `${file} loads ${url}`);
    }
    assert.doesNotMatch(css, /@import\s+(url\()?["']?https?:/);
  }
});

test("every route has its own page, served by GitHub Pages at /link/<route>", () => {
  for (const route of ["pair", "activate", "open"]) {
    assert.ok(existsSync(resolve(dist, `${route}.html`)), `${route}.html`);
    assert.ok(!existsSync(resolve(dist, route)), `nothing may shadow /link/${route}`);
  }
});

test("no script reads the query string, sends a request or stores anything", () => {
  // Link data lives only in the fragment; the page reads it and does nothing
  // else with the network or storage. A dependency that started doing so
  // would show up here.
  for (const file of readdirSync(resolve(dist, "assets")).filter((name) => name.endsWith(".js"))) {
    const js = readFileSync(resolve(dist, "assets", file), "utf8");
    assert.doesNotMatch(js, /location\.search/, `${file} reads location.search`);
    assert.doesNotMatch(js, /\b(fetch|sendBeacon|XMLHttpRequest|WebSocket|EventSource)\s*\(/, `${file} makes a request`);
    assert.doesNotMatch(js, /\b(localStorage|sessionStorage|indexedDB)\b/, `${file} uses storage`);
    assert.doesNotMatch(js, /dangerouslySetInnerHTML\s*:\s*\{/, `${file} injects HTML`);
  }
});

test("the only links to other hosts are the store listings and this repository", () => {
  const allowed = /^https:\/\/(apps\.apple\.com|play\.google\.com|github\.com\/Fiestaboard\/link)[/#]/;
  for (const page of PAGES) {
    for (const href of attributes(read(page), "a", "href")) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) assert.match(href, allowed, `${page} links to ${href}`);
    }
  }
});
