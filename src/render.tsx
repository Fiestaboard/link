// Test-only: renders LinkView for a pathname and fragment, in Node, through
// the same planLink() the browser uses. Built by `npm run test:render`.
import { renderToStaticMarkup } from "react-dom/server";

import { planLink } from "./lib/link.js";
import { LinkView } from "./pages/LinkPage";

export function renderLink(pathname: string, hash: string): string {
  return renderToStaticMarkup(<LinkView view={planLink(pathname, hash)} />);
}
