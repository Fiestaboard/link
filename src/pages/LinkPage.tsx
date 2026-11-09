/**
 * What a person sees at fiestaboard.app/link/<route>.
 *
 * With the app installed, iOS and Android open the app for these addresses
 * and this page never loads. It is the fallback (Figma 09b, L7): open the app
 * by its fiestaboard:// address, get the app from a store, or continue on the
 * hub's own page in this browser.
 *
 * Everything the link carries is read from the # fragment in the browser by
 * src/lib/link.js and shown as text only. The prerendered HTML is the
 * "reading" view, so the first client render must be that too; the real view
 * is chosen in an effect.
 */
import { CircleHelp, Frame, Link2Off, ShieldAlert, ShieldX } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";

import { isPublished, STORES } from "../config";
import { isFramed } from "../lib/frame";
import { type InvalidReason, type Plan, planLink } from "../lib/link.js";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  CardContent,
  Code,
  Spinner,
  Stack,
  Text,
} from "../ui";
import { PageHeading, Shell } from "./Shell";

export type View = { kind: "reading" } | { kind: "framed" } | Plan;

const REASONS: Record<InvalidReason, string> = {
  loopback:
    "It points to localhost, which on this device means the device itself, not your hub. On your computer, open FiestaBoard at its network address (like http://fiestapi.local:4420) and make a new link there.",
  scheme: "The hub address in it isn't a web address.",
  credentials: "The hub address in it includes a username or password, which FiestaBoard links never do.",
  missing: "It doesn't say which hub it's for.",
  malformed: "The hub address in it isn't one FiestaBoard makes.",
  empty: "It's missing the part after the #, which holds your hub's address. Copy the whole link and try again.",
  garbled: "It's damaged. Copy the whole link again, or make a new one on your hub.",
  version: "It was made by a newer version of FiestaBoard than this page understands. Update the app and try again.",
  code: "The code in it isn't one FiestaBoard makes. Make a new link on your hub.",
  page: "The page in it isn't one FiestaBoard makes.",
};


function title(view: View): string {
  switch (view.kind) {
    case "reading":
      return "Reading this link…";
    case "framed":
      return "This page can't be used inside another page";
    case "home":
      return "Open FiestaBoard on your phone";
    case "unknown":
      return "This isn't a link this page knows";
    case "invalid":
      return "This link can't be used";
    case "link":
      // The validated address, never the link's `name`: a name can say
      // anything, including another hub's address.
      if (view.route === "pair") return `Connect to ${view.hub.display}`;
      if (view.route === "activate") return `Approve a sign-in on ${view.hub.display}`;
      return `Open a page on ${view.hub.display}`;
  }
}

const ICONS: Partial<Record<View["kind"], ReactNode>> = {
  reading: <Spinner size="lg" label={null} />,
  framed: <Frame />,
  unknown: <CircleHelp />,
  invalid: <ShieldX className="text-destructive" />,
};

function StoreButtons() {
  return (
    <Stack gap="3">
      {isPublished(STORES.appStore) ? (
        <Button asChild variant="outline" size="lg" className="w-full">
          <a href={STORES.appStore} rel="noreferrer">
            Download on the App Store
          </a>
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="w-full" disabled>
          App Store: coming soon
        </Button>
      )}
      {isPublished(STORES.googlePlay) ? (
        <Button asChild variant="outline" size="lg" className="w-full">
          <a href={STORES.googlePlay} rel="noreferrer">
            Get it on Google Play
          </a>
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="w-full" disabled>
          Google Play: coming soon
        </Button>
      )}
    </Stack>
  );
}

function LinkDescription({ plan }: { plan: Extract<Plan, { kind: "link" }> }) {
  // Everything here is a text node: React escapes it, and nothing from the
  // link is ever put into the page as HTML. The hub's own name is secondary,
  // and labelled as what the hub calls itself, because the link can say
  // anything there.
  const named = plan.name && (
    <span className="mt-1 block" data-testid="hub-name">
      It calls itself “{plan.name}”.
    </span>
  );
  if (plan.route === "pair") {
    return <>This link opens the FiestaBoard app and connects it to this hub.{named}</>;
  }
  if (plan.route === "activate") {
    return (
      <>
        This link opens the FiestaBoard app to approve the code <Code>{plan.code}</Code> on this hub.{named}
      </>
    );
  }
  return <>This link opens a page in the FiestaBoard app on this hub.{named}</>;
}

const BROWSER_HINTS: Record<"pair" | "activate" | "open", string> = {
  pair: "No app? You can open your hub in this browser now and connect this phone later.",
  activate: "No app? You can still finish in this browser on your hub's own page.",
  open: "No app? You can still open the page in this browser, on your hub.",
};

const PRIVACY_NOTES: Record<"pair" | "activate" | "open", string> = {
  pair: "The hub address and code stay in this page's link after the # and are never sent to fiestaboard.app.",
  activate: "The hub address and code stay in this page's link after the # and are never sent to fiestaboard.app.",
  open: "The hub address and page stay in this page's link after the # and are never sent to fiestaboard.app.",
};

export function LinkPage({ home = false }: { home?: boolean }) {
  const [view, setView] = useState<View>(home ? { kind: "home" } : { kind: "reading" });
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Framed, the buttons below could be clicked by trickery. GitHub Pages
    // cannot send frame-ancestors, so the check is made here.
    const next: View = isFramed()
      ? { kind: "framed" }
      : // Only the fragment is read. The query string is never looked at.
        planLink(window.location.pathname, window.location.hash);
    setView(next);
    document.title = `${title(next)} · FiestaBoard`;
    if (next.kind !== "link" && next.kind !== "home") heading.current?.focus();
  }, []);

  return <LinkView view={view} headingRef={heading} />;
}

/**
 * The page for one view, with no access to the browser: every URL on it comes
 * from `view`, which only planLink() builds. tests/render.test.js renders it
 * in Node to prove that.
 */
export function LinkView({ view, headingRef }: { view: View; headingRef?: Ref<HTMLHeadingElement> }) {
  const description = view.kind === "link" ? <LinkDescription plan={view} /> : undefined;

  return (
    <Shell showBrandIcon={view.kind !== "reading"}>
      <PageHeading ref={headingRef} icon={ICONS[view.kind]} description={description}>
        {title(view)}
      </PageHeading>

      <CardContent>
        {view.kind === "reading" && (
          <Text tone="muted">
            If nothing happens, this page needs JavaScript turned on to read the link.
          </Text>
        )}

        {view.kind === "link" && (
          <Stack gap="5">
            {view.route === "activate" && (
              // RFC 8628 §5.4: a device code can be started by anyone and sent
              // to someone else to approve.
              <Alert variant="warning" data-testid="activate-warning">
                <ShieldAlert aria-hidden="true" />
                <AlertTitle>Only approve a code your own TV is showing</AlertTitle>
                <AlertDescription>If someone sent you this link, don't approve it.</AlertDescription>
              </Alert>
            )}
            <Stack gap="3">
              <Button asChild variant="brand" size="lg" className="w-full">
                <a href={view.appUrl}>Open in the FiestaBoard app</a>
              </Button>
              <StoreButtons />
            </Stack>
            <Stack gap="3">
              <Text size="sm" tone="muted">
                {BROWSER_HINTS[view.route]}
              </Text>
              <Button asChild variant="secondary" size="lg" className="h-auto min-h-10 w-full whitespace-normal py-2 text-center">
                {/* The destination is on the control that goes there. */}
                <a href={view.browserUrl} rel="noreferrer" data-testid="continue" className="[overflow-wrap:anywhere]">
                  Continue to {view.hub.display}
                </a>
              </Button>
            </Stack>
            <Text size="xs" tone="muted">
              {PRIVACY_NOTES[view.route]}
            </Text>
          </Stack>
        )}

        {view.kind === "invalid" && (
          <Alert variant="destructive">
            <Link2Off aria-hidden="true" />
            <AlertTitle>Nothing was opened</AlertTitle>
            <AlertDescription>{REASONS[view.reason]}</AlertDescription>
          </Alert>
        )}

        {view.kind === "unknown" && (
          <Text>
            It may have been made by a newer version of FiestaBoard. Update the FiestaBoard app, or open the link
            again from your hub.
          </Text>
        )}

        {view.kind === "home" && (
          <Stack gap="5">
            <Text>
              Links to fiestaboard.app/link/ open the FiestaBoard app on your phone, to connect it to your hub,
              approve a sign-in or open a page. Your hub makes them; this site only passes them to the app.
            </Text>
            <StoreButtons />
          </Stack>
        )}

        {view.kind === "framed" && <Text>Open it in its own tab and try again.</Text>}
      </CardContent>
    </Shell>
  );
}
