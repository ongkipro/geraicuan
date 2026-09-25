import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HostRouting } from "@/lib/auth-config";
import { hostAllowsScope, routeByHost, surfaceForHost } from "@/lib/host-routing";

const routing: HostRouting = {
  platformOrigin: "https://bos.geraicuan.com",
  publicOrigin: "https://geraicuan.com",
  tenantOrigin: "https://app.geraicuan.com",
};

const TENANT = "app.geraicuan.com";
const PLATFORM = "bos.geraicuan.com";
const LAN = "100.127.67.86:3127";

function route(
  host: string | null,
  path: string,
  options: { cookie?: boolean; production?: boolean; routing?: HostRouting | null } = {},
) {
  const url = new URL(path, "http://internal");
  return routeByHost({
    hasSessionCookie: options.cookie ?? false,
    host,
    pathname: url.pathname,
    production: options.production ?? true,
    routing: options.routing === undefined ? routing : options.routing,
    search: url.search,
  });
}

describe("host routing decisions (PR-58)", () => {
  it.each([
    [TENANT, "/app"],
    [TENANT, "/app/pengiriman/baru"],
    [TENANT, "/app/laporan/pengiriman/export.csv"],
    [TENANT, "/daftar"],
    [TENANT, "/verifikasi-email"],
    [TENANT, "/lupa-password"],
    [TENANT, "/atur-ulang-password"],
    [TENANT, "/api/auth/sign-in/email"],
    [PLATFORM, "/platform"],
    [PLATFORM, "/platform/tenant/abc"],
    [PLATFORM, "/api/auth/sign-in/email"],
    [PLATFORM, "/icon.svg"],
    [TENANT, "/couriers/jne.svg"],
    [PLATFORM, "/couriers/jne.svg"],
  ])("serves the owning surface: %s %s", (host, path) => {
    expect(route(host, path)).toEqual({ kind: "next" });
  });

  it.each([
    [TENANT, "/platform"],
    [TENANT, "/platform/audit"],
    [PLATFORM, "/app"],
    [PLATFORM, "/app/pengiriman/rts"],
    [PLATFORM, "/daftar"],
    [PLATFORM, "/lupa-password"],
    [PLATFORM, "/api/webhooks/mengantar"],
    [TENANT, "/applications"],
    [TENANT, "/unknown"],
  ])("refuses a route the host does not own: %s %s", (host, path) => {
    expect(route(host, path)).toEqual({ kind: "not-found" });
  });

  it("serves each host's login at /login without exposing the file path", () => {
    expect(route(TENANT, "/login")).toEqual({ kind: "rewrite", pathname: "/login/tenant" });
    expect(route(PLATFORM, "/login")).toEqual({ kind: "rewrite", pathname: "/login/super-admin" });
  });

  it("redirects old login paths to the owning host's login, keeping the notice", () => {
    for (const host of [TENANT, PLATFORM]) {
      expect(route(host, "/login/tenant?notice=session-required")).toEqual({
        kind: "redirect",
        location: "https://app.geraicuan.com/login?notice=session-required",
        status: 308,
      });
      expect(route(host, "/login/super-admin")).toEqual({
        kind: "redirect",
        location: "https://bos.geraicuan.com/login",
        status: 308,
      });
    }
  });

  it("sends / to the host's login, or its home when a session cookie is present", () => {
    expect(route(TENANT, "/")).toMatchObject({ location: "https://app.geraicuan.com/login" });
    expect(route(TENANT, "/", { cookie: true })).toMatchObject({ location: "https://app.geraicuan.com/app" });
    expect(route(PLATFORM, "/")).toMatchObject({ location: "https://bos.geraicuan.com/login" });
    expect(route(PLATFORM, "/", { cookie: true })).toMatchObject({ location: "https://bos.geraicuan.com/platform" });
  });

  it("builds redirects from configured origins, never from the request host", () => {
    // A mixed-case Host still matches, but the Location comes from configuration.
    expect(route("APP.GERAICUAN.COM", "/")).toMatchObject({ location: "https://app.geraicuan.com/login" });
  });

  it("refuses an unknown host in production, the apex included", () => {
    for (const host of ["geraicuan.com", "evil.example", LAN, null]) {
      expect(route(host, "/app")).toEqual({ kind: "not-found" });
      expect(route(host, "/")).toEqual({ kind: "not-found" });
    }
  });
});

describe("single-origin development mode (PR-58)", () => {
  it.each(["/", "/app", "/platform", "/login/tenant", "/login/super-admin", "/api/auth/get-session", "/login"])(
    "passes %s through unchanged on the LAN origin, with or without host routing configured",
    (path) => {
      expect(route(LAN, path, { production: false, routing: null })).toEqual({ kind: "next" });
      expect(route(LAN, path, { production: false })).toEqual({ kind: "next" });
      expect(route("localhost:3127", path, { production: false })).toEqual({ kind: "next" });
    },
  );

  it("keeps every scope usable on an unmatched development host", () => {
    expect(hostAllowsScope(null, LAN, "tenant", false)).toBe(true);
    expect(hostAllowsScope(null, LAN, "platform", false)).toBe(true);
    expect(hostAllowsScope(routing, LAN, "platform", false)).toBe(true);
  });
});

describe("host binding of CMS scopes", () => {
  it("binds each scope to its own host and refuses the other", () => {
    expect(surfaceForHost(routing, TENANT)).toBe("tenant");
    expect(surfaceForHost(routing, PLATFORM)).toBe("platform");
    expect(hostAllowsScope(routing, TENANT, "tenant", true)).toBe(true);
    expect(hostAllowsScope(routing, PLATFORM, "platform", true)).toBe(true);
    expect(hostAllowsScope(routing, PLATFORM, "tenant", true)).toBe(false);
    expect(hostAllowsScope(routing, TENANT, "platform", true)).toBe(false);
    expect(hostAllowsScope(routing, "evil.example", "tenant", true)).toBe(false);
    expect(hostAllowsScope(null, TENANT, "tenant", true)).toBe(false);
  });
});

describe("src/proxy.ts wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadProxy(environment: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
    return import("@/proxy");
  }

  const productionEnvironment = {
    GERAICUAN_PLATFORM_ORIGIN: routing.platformOrigin,
    GERAICUAN_PUBLIC_ORIGIN: routing.publicOrigin,
    GERAICUAN_TENANT_ORIGIN: routing.tenantOrigin,
    NODE_ENV: "production",
  };

  function request(path: string, headers: Record<string, string>) {
    // The URL's own host is internal, as it is behind `next start`; only the
    // Host header carries the public host.
    return new NextRequest(`http://localhost:3000${path}`, { headers });
  }

  it("refuses the other host's routes and ignores X-Forwarded-Host", async () => {
    const { proxy } = await loadProxy(productionEnvironment);

    expect(proxy(request("/app", { host: PLATFORM })).status).toBe(404);
    expect(proxy(request("/platform", { host: TENANT })).status).toBe(404);
    // Forwarded host claims the tenant host; the Host header decides.
    expect(
      proxy(request("/app", { host: PLATFORM, "x-forwarded-host": TENANT })).status,
    ).toBe(404);
    expect(
      proxy(request("/platform", { host: "evil.example", "x-forwarded-host": PLATFORM })).status,
    ).toBe(404);
    expect(proxy(request("/app", { host: TENANT })).headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects, rewrites and routes / through NextResponse", async () => {
    const { proxy } = await loadProxy(productionEnvironment);

    const old = proxy(request("/login/super-admin?notice=access-unavailable", { host: TENANT }));
    expect(old.status).toBe(308);
    expect(getRedirectUrl(old)).toBe("https://bos.geraicuan.com/login?notice=access-unavailable");

    expect(getRewrittenUrl(proxy(request("/login", { host: PLATFORM })))).toBe(
      "http://localhost:3000/login/super-admin",
    );

    expect(getRedirectUrl(proxy(request("/", { host: TENANT })))).toBe("https://app.geraicuan.com/login");
    expect(
      getRedirectUrl(
        proxy(request("/", { cookie: "__Secure-better-auth.session_token=x", host: TENANT })),
      ),
    ).toBe("https://app.geraicuan.com/app");
  });

  it("changes nothing in single-origin development mode", async () => {
    const { proxy } = await loadProxy({ NODE_ENV: "development" });

    for (const path of ["/", "/app", "/platform", "/login/tenant", "/login/super-admin"]) {
      const response = proxy(request(path, { host: LAN }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("runs for pages, Server Function POSTs and auth, but not static build output", async () => {
    const { config } = await loadProxy({ NODE_ENV: "development" });

    for (const url of ["/", "/app", "/platform/audit", "/login/tenant", "/api/auth/get-session", "/icon.svg"]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    }
    expect(unstable_doesMiddlewareMatch({ config, url: "/_next/static/chunks/main.js" })).toBe(false);
  });
});

describe("startup validation in src/instrumentation.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const valid = {
    // T-198: placeholders, never connected to or signed with.
    APP_DATABASE_URL: "postgresql://startup_runtime@db.invalid/geraicuan",
    BETTER_AUTH_SECRET: "startup-placeholder-secret-not-real-0123456789",
    BETTER_AUTH_TRUSTED_ORIGINS: `${routing.tenantOrigin},${routing.platformOrigin}`,
    BETTER_AUTH_TRUSTED_PROXY_CIDRS: "10.0.0.0/8",
    BETTER_AUTH_URL: routing.tenantOrigin,
    DATABASE_URL: "postgresql://startup_migrator@db.invalid/geraicuan",
    GERAICUAN_PLATFORM_ORIGIN: routing.platformOrigin,
    GERAICUAN_PUBLIC_ORIGIN: routing.publicOrigin,
    GERAICUAN_TENANT_ORIGIN: routing.tenantOrigin,
    NEXT_RUNTIME: "nodejs",
    NODE_ENV: "production",
    // D-10 (T-181): production mail. A placeholder: nothing is sent here.
    RESEND_API_KEY: "re_startup_placeholder_not_real",
    RESEND_FROM_EMAIL: "GeraiCUAN <no-reply@geraicuan.test>",
  };

  async function register(environment: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
    const { register } = await import("@/instrumentation");
    return register();
  }

  it("starts a correctly configured production server", async () => {
    await expect(register(valid)).resolves.toBeUndefined();
  });

  it.each([
    ["a missing platform origin", { GERAICUAN_PLATFORM_ORIGIN: undefined }, "GERAICUAN_PLATFORM_ORIGIN is required in production."],
    ["a malformed tenant origin", { GERAICUAN_TENANT_ORIGIN: "app.geraicuan.com" }, "GERAICUAN_TENANT_ORIGIN must contain valid absolute origins."],
    ["no Resend API key", { RESEND_API_KEY: undefined }, "RESEND_API_KEY is required in production."],
    ["a Resend key without a sender", { RESEND_FROM_EMAIL: undefined }, "RESEND_FROM_EMAIL is required when RESEND_API_KEY is set."],
    ["a malformed sender", { RESEND_FROM_EMAIL: "GeraiCUAN no-reply" }, "RESEND_FROM_EMAIL must be an email address or \"Name <email>\"."],
    ["no auth secret", { BETTER_AUTH_SECRET: undefined }, "BETTER_AUTH_SECRET is required in production."],
    ["a short auth secret", { BETTER_AUTH_SECRET: "x".repeat(31) }, "BETTER_AUTH_SECRET must be at least 32 characters."],
    ["no runtime database login", { APP_DATABASE_URL: undefined }, "APP_DATABASE_URL is required in production."],
    ["the migration login as the runtime login", { APP_DATABASE_URL: "postgresql://startup_migrator@db.invalid/geraicuan" }, "APP_DATABASE_URL must not use the migration role."],
  ])("refuses to start a production server with %s", async (_label, override, message) => {
    // `next start` keeps listening when `register` merely throws, so the
    // process must exit.
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(register({ ...valid, ...override })).rejects.toThrow("process.exit(1)");
      expect(exit).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledWith(`Refusing to start: ${message}`);
    } finally {
      exit.mockRestore();
      log.mockRestore();
    }
  });

  it("throws without exiting in development, so the dev server stays up to show the error", async () => {
    const exit = vi.spyOn(process, "exit");
    try {
      await expect(
        register({ GERAICUAN_TENANT_ORIGIN: "http://app.localhost:3130", NEXT_RUNTIME: "nodejs", NODE_ENV: "development" }),
      ).rejects.toThrow("GERAICUAN_PLATFORM_ORIGIN is required when host routing is configured.");
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
    }
  });

  it("starts the single-origin development server without host origins", async () => {
    await expect(
      register({ BETTER_AUTH_URL: "http://100.127.67.86:3127", NEXT_RUNTIME: "nodejs", NODE_ENV: "development" }),
    ).resolves.toBeUndefined();
  });
});
