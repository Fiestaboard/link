export const APP_SCHEME: "fiestaboard:";
export const ROUTES: readonly ["pair", "activate", "open"];

export type Route = "pair" | "activate" | "open";

export interface Hub {
  /** Origin plus any base path, no trailing slash. */
  base: string;
  /** Host, port and path: for showing as text, never as HTML. */
  display: string;
  secure: boolean;
}

export type HubRefusal = "missing" | "malformed" | "scheme" | "credentials" | "loopback";
export type InvalidReason = HubRefusal | "empty" | "garbled" | "version" | "code" | "page";

export type Plan =
  | { kind: "home" }
  | { kind: "unknown" }
  | { kind: "invalid"; route: Route; reason: InvalidReason }
  | {
      kind: "link";
      route: Route;
      hub: Hub;
      name: string | null;
      code?: string;
      page?: string;
      appUrl: string;
      browserUrl: string;
    };

export function isLoopbackHost(hostname: string): boolean;
export function parseHub(raw: unknown): { ok: true; hub: Hub } | { ok: false; reason: HubRefusal };
export function parseFragment(hash: string | null | undefined): Map<string, string> | null;
export function cleanName(raw: unknown): string | null;
export function routeFromPath(pathname: string): Route | "" | "unknown";
export function planLink(pathname: string, hash: string): Plan;

type Layer = (raw: string) => HubRefusal | null;
export const HUB_LAYERS: {
  checkRawText: (raw: unknown) => HubRefusal | null;
  checkRawAuthority: Layer;
  checkRawPath: Layer;
  checkParsed: (url: URL) => HubRefusal | null;
  checkPathAgrees: (url: URL, raw: string) => HubRefusal | null;
};
