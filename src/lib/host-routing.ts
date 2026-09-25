import type { HostRouting } from "@/lib/auth-config";

/**
 * Host-based surfaces (D-7, PR-58). One deployment serves the tenant host and
 * the platform host; this module decides, from the `Host` header alone, which
 * surface a request belongs to and whether its path may be served there.
 *
 * `X-Forwarded-Host` is never read: behind the reverse proxy the public host
 * arrives as `Host`, and a forwarded header is client-controllable.
 *
 * Routing is an additional boundary. Server-side scope checks
 * (`requireCmsScope`, `resolvePlatformAccess`, the session-create hook) stay
 * the authority and consult `hostAllowsScope` themselves.
 */
export type CmsSurface = "platform" | "tenant";

export type HostRouteDecision =
  | { kind: "next" }
  | { kind: "not-found" }
  | { kind: "redirect"; location: string; status: 307 | 308 }
  | { kind: "rewrite"; pathname: string };

// "/couriers": static courier logos (public/couriers/*.svg) used on both hosts.
const SHARED_PREFIXES = ["/api/auth", "/couriers"] as const;
const SHARED_FILES = ["/favicon.ico", "/icon.svg"] as const;

/**
 * Paths each host owns besides `/` and `/login`. T-181 builds `/daftar`,
 * email verification and password recovery; their prefixes are reserved here
 * so those pages land on the tenant host without another routing change.
 */
const SURFACE_PREFIXES: Record<CmsSurface, readonly string[]> = {
  platform: ["/platform"],
  tenant: [
    "/app",
    "/daftar",
    "/verifikasi-email",
    "/lupa-password",
    "/atur-ulang-password",
    "/api/webhooks",
  ],
};

const LOGIN_PAGE: Record<CmsSurface, string> = {
  platform: "/login/super-admin",
  tenant: "/login/tenant",
};

const HOME: Record<CmsSurface, string> = {
  platform: "/platform",
  tenant: "/app",
};

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function originFor(routing: HostRouting, surface: CmsSurface) {
  return surface === "tenant" ? routing.tenantOrigin : routing.platformOrigin;
}

/** The surface whose configured host equals the request's `Host` header. */
export function surfaceForHost(
  routing: HostRouting | null,
  host: string | null | undefined,
): CmsSurface | null {
  if (!routing || !host) return null;
  const normalized = host.trim().toLowerCase();
  if (normalized === new URL(routing.tenantOrigin).host) return "tenant";
  if (normalized === new URL(routing.platformOrigin).host) return "platform";
  return null;
}

/**
 * Whether a principal of `scope` may act on a request that arrived on `host`.
 * Without host routing, or on an unmatched host outside production
 * (single-origin development mode), every scope keeps today's behaviour.
 */
export function hostAllowsScope(
  routing: HostRouting | null,
  host: string | null | undefined,
  scope: CmsSurface,
  production: boolean,
) {
  if (!routing) return !production;
  const surface = surfaceForHost(routing, host);
  return surface ? surface === scope : !production;
}

export function routeByHost(input: {
  hasSessionCookie: boolean;
  host: string | null;
  pathname: string;
  production: boolean;
  routing: HostRouting | null;
  search: string;
}): HostRouteDecision {
  const { pathname, routing, search } = input;
  const surface = surfaceForHost(routing, input.host);

  if (!routing || !surface) {
    // Single-origin development mode: nothing changes. Production has host
    // routing by construction, so an unmatched host there is refused.
    return input.production ? { kind: "not-found" } : { kind: "next" };
  }

  if (
    SHARED_FILES.includes(pathname as (typeof SHARED_FILES)[number])
    || SHARED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
  ) {
    return { kind: "next" };
  }

  if (pathname === "/") {
    return {
      kind: "redirect",
      location: `${originFor(routing, surface)}${input.hasSessionCookie ? HOME[surface] : "/login"}`,
      status: 307,
    };
  }

  if (pathname === "/login") {
    return { kind: "rewrite", pathname: LOGIN_PAGE[surface] };
  }

  for (const owner of ["tenant", "platform"] as const) {
    if (pathname === LOGIN_PAGE[owner]) {
      return {
        kind: "redirect",
        location: `${originFor(routing, owner)}/login${search}`,
        status: 308,
      };
    }
  }

  if (SURFACE_PREFIXES[surface].some((prefix) => matchesPrefix(pathname, prefix))) {
    return { kind: "next" };
  }

  return { kind: "not-found" };
}
