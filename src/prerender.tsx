// Build-time only: renders each page to the HTML that scripts/prerender.mjs
// writes into dist/. Keys are paths inside dist/.
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { LinkPage } from "./pages/LinkPage";

const PAGES: Record<string, ReactElement> = {
  "index.html": <LinkPage home />,
  "pair.html": <LinkPage />,
  "activate.html": <LinkPage />,
  "open.html": <LinkPage />,
};

export function renderPages(): Record<string, string> {
  return Object.fromEntries(Object.entries(PAGES).map(([path, page]) => [path, renderToString(page)]));
}
