import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Where the built site is served. The source pages' CSP says 'self' so the
// dev server works; the build narrows it to this path, because 'self' is all
// of fiestaboard.app, including every script the documentation site serves.
// Override (LINK_CSP_BASE=http://localhost:8787/) to preview a build locally.
const CSP_BASE = process.env.LINK_CSP_BASE ?? "https://fiestaboard.app/link/";

function pathScopedCsp(): Plugin {
  return {
    name: "path-scoped-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (_, open, csp, close) => {
        const scoped = csp.replace(/((?:script|style|img|font)-src) 'self'/g, `$1 ${CSP_BASE}`);
        if (scoped === csp) throw new Error("CSP not found to scope");
        return open + scoped + close;
      });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  // Relative asset URLs: the site is served under /link/ today and must keep
  // working unchanged if it ever moves to its own domain.
  base: "./",
  plugins: [react(), tailwindcss(), pathScopedCsp()],
  // The prerender bundle renders FiestaUI components in Node.
  ssr: { noExternal: ["@fiestaboard/ui"] },
  build: {
    // Every page's CSP is `default-src 'none'` with only 'self' allowed, so
    // nothing may be inlined: no data: URIs, no injected inline polyfill.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    emptyOutDir: true,
    rollupOptions: isSsrBuild
      ? {}
      : {
          // One HTML file per route: GitHub Pages serves pair.html at both
          // /link/pair and /link/pair.html.
          input: {
            index: resolve(import.meta.dirname, "index.html"),
            pair: resolve(import.meta.dirname, "pair.html"),
            activate: resolve(import.meta.dirname, "activate.html"),
            open: resolve(import.meta.dirname, "open.html"),
          },
        },
  },
}));
