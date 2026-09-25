import { describe, expect, it } from "vitest";

import {
  resolveBetterAuthRuntimeConfig,
  resolveHostRouting,
} from "@/lib/auth-config";

const production = {
  BETTER_AUTH_TRUSTED_ORIGINS:
    "https://app.example.com,https://cuan.example.com",
  BETTER_AUTH_TRUSTED_PROXY_CIDRS: "10.0.0.0/8",
  BETTER_AUTH_URL: "https://app.example.com",
  GERAICUAN_PLATFORM_ORIGIN: "https://cuan.example.com",
  GERAICUAN_PUBLIC_ORIGIN: "https://example.com",
  GERAICUAN_TENANT_ORIGIN: "https://app.example.com",
  NODE_ENV: "production",
};

describe("Better Auth production origin boundary", () => {
  it("accepts exactly two explicit HTTPS CMS origins", () => {
    expect(resolveBetterAuthRuntimeConfig(production)).toEqual({
      // The base URL follows the request's own host, but only one of the two
      // CMS hosts, over a fixed protocol and with no fallback (PR-58).
      baseURL: {
        allowedHosts: ["app.example.com", "cuan.example.com"],
        protocol: "https",
      },
      hostRouting: {
        platformOrigin: "https://cuan.example.com",
        publicOrigin: "https://example.com",
        tenantOrigin: "https://app.example.com",
      },
      trustedOrigins: [
        "https://app.example.com",
        "https://cuan.example.com",
      ],
      trustedProxies: ["10.0.0.0/8"],
      useSecureCookies: true,
    });
  });

  it.each([
    ["missing base URL", { BETTER_AUTH_URL: undefined }],
    ["missing trusted origins", { BETTER_AUTH_TRUSTED_ORIGINS: undefined }],
    ["missing trusted proxies", { BETTER_AUTH_TRUSTED_PROXY_CIDRS: undefined }],
    ["invalid trusted proxy", { BETTER_AUTH_TRUSTED_PROXY_CIDRS: "not-a-cidr" }],
    ["invalid IPv4 prefix", { BETTER_AUTH_TRUSTED_PROXY_CIDRS: "127.0.0.1/33" }],
    ["invalid IPv6 prefix", { BETTER_AUTH_TRUSTED_PROXY_CIDRS: "::1/129" }],
    ["HTTP origin", { BETTER_AUTH_URL: "http://app.example.com" }],
    ["wildcard origin", { BETTER_AUTH_TRUSTED_ORIGINS: "https://*.example.com,https://cuan.example.com" }],
    ["origin path", { BETTER_AUTH_TRUSTED_ORIGINS: "https://app.example.com/auth,https://cuan.example.com" }],
    ["one origin", { BETTER_AUTH_TRUSTED_ORIGINS: "https://app.example.com" }],
    ["extra origin", { BETTER_AUTH_TRUSTED_ORIGINS: "https://app.example.com,https://cuan.example.com,https://public.example.com" }],
    ["base outside allowlist", { BETTER_AUTH_URL: "https://auth.example.com" }],
    ["missing tenant origin", { GERAICUAN_TENANT_ORIGIN: undefined }],
    ["missing platform origin", { GERAICUAN_PLATFORM_ORIGIN: undefined }],
    ["missing public origin", { GERAICUAN_PUBLIC_ORIGIN: undefined }],
    ["HTTP tenant origin", { GERAICUAN_TENANT_ORIGIN: "http://app.example.com" }],
    ["platform origin with a path", { GERAICUAN_PLATFORM_ORIGIN: "https://cuan.example.com/platform" }],
    ["wildcard public origin", { GERAICUAN_PUBLIC_ORIGIN: "https://*.example.com" }],
    ["malformed tenant origin", { GERAICUAN_TENANT_ORIGIN: "app.example.com" }],
    ["tenant and platform on one host", { GERAICUAN_PLATFORM_ORIGIN: "https://app.example.com" }],
    ["public origin on a CMS host", { GERAICUAN_PUBLIC_ORIGIN: "https://cuan.example.com" }],
    ["trusted origins other than the two hosts", {
      BETTER_AUTH_TRUSTED_ORIGINS: "https://app.example.com,https://other.example.com",
    }],
  ])("fails closed for %s", (_label, override) => {
    expect(() =>
      resolveBetterAuthRuntimeConfig({ ...production, ...override }),
    ).toThrow();
  });

  it("keeps local runtime configuration optional", () => {
    expect(resolveBetterAuthRuntimeConfig({ NODE_ENV: "development" })).toEqual({
      baseURL: undefined,
      hostRouting: null,
      trustedOrigins: undefined,
      trustedProxies: undefined,
      useSecureCookies: false,
    });
  });

  it("states the secure-cookie flag rather than leaving it to library inference", () => {
    // Production origins are already forced to HTTPS, so the flag is true there
    // and does not depend on how the auth library reads the base URL.
    expect(resolveBetterAuthRuntimeConfig(production).useSecureCookies).toBe(true);

    // Outside production the flag follows the origin. Forcing it false would
    // strip Secure and the __Secure- prefix from a staging or preview build
    // served over HTTPS, which would be a downgrade rather than hardening.
    expect(
      resolveBetterAuthRuntimeConfig({ ...production, NODE_ENV: "development" })
        .useSecureCookies,
    ).toBe(true);
    expect(
      resolveBetterAuthRuntimeConfig({
        BETTER_AUTH_URL: "http://localhost:3000",
        NODE_ENV: "development",
      }).useSecureCookies,
    ).toBe(false);
  });
});

describe("host routing configuration outside production", () => {
  it("stays off without origins, which is single-origin development mode", () => {
    expect(resolveHostRouting({ NODE_ENV: "development" })).toBeNull();
    expect(resolveHostRouting({ NODE_ENV: "test", BETTER_AUTH_URL: "http://100.127.67.86:3127" })).toBeNull();
  });

  it("accepts local HTTP origins and falls back to BETTER_AUTH_URL, never to the request", () => {
    const local = {
      BETTER_AUTH_URL: "http://100.127.67.86:3130",
      GERAICUAN_PLATFORM_ORIGIN: "http://bos.geraicuan.localhost:3130",
      GERAICUAN_TENANT_ORIGIN: "http://app.geraicuan.localhost:3130",
      NODE_ENV: "development",
    };
    expect(resolveBetterAuthRuntimeConfig(local).baseURL).toEqual({
      allowedHosts: ["app.geraicuan.localhost:3130", "bos.geraicuan.localhost:3130"],
      fallback: "http://100.127.67.86:3130",
      protocol: "http",
    });
  });

  it.each([
    ["only the tenant origin", { GERAICUAN_TENANT_ORIGIN: "http://app.localhost:3130" }],
    ["only the platform origin", { GERAICUAN_PLATFORM_ORIGIN: "http://bos.localhost:3130" }],
    ["mixed protocols", {
      GERAICUAN_PLATFORM_ORIGIN: "https://bos.localhost:3130",
      GERAICUAN_TENANT_ORIGIN: "http://app.localhost:3130",
    }],
  ])("refuses a half or inconsistent configuration: %s", (_label, override) => {
    expect(() =>
      resolveHostRouting({ NODE_ENV: "development", ...override }),
    ).toThrow();
  });

  it("requires BETTER_AUTH_URL once host routing is configured", () => {
    expect(() =>
      resolveBetterAuthRuntimeConfig({
        GERAICUAN_PLATFORM_ORIGIN: "http://bos.localhost:3130",
        GERAICUAN_TENANT_ORIGIN: "http://app.localhost:3130",
        NODE_ENV: "development",
      }),
    ).toThrow("BETTER_AUTH_URL is required when host routing is configured.");
  });
});
