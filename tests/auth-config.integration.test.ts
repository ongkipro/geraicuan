import { describe, expect, it } from "vitest";

import { resolveBetterAuthRuntimeConfig } from "@/lib/auth-config";

const production = {
  BETTER_AUTH_TRUSTED_ORIGINS:
    "https://app.example.com,https://cuan.example.com",
  BETTER_AUTH_TRUSTED_PROXY_CIDRS: "10.0.0.0/8",
  BETTER_AUTH_URL: "https://app.example.com",
  NODE_ENV: "production",
};

describe("Better Auth production origin boundary", () => {
  it("accepts exactly two explicit HTTPS CMS origins", () => {
    expect(resolveBetterAuthRuntimeConfig(production)).toEqual({
      baseURL: "https://app.example.com",
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
  ])("fails closed for %s", (_label, override) => {
    expect(() =>
      resolveBetterAuthRuntimeConfig({ ...production, ...override }),
    ).toThrow();
  });

  it("keeps local runtime configuration optional", () => {
    expect(resolveBetterAuthRuntimeConfig({ NODE_ENV: "development" })).toEqual({
      baseURL: undefined,
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
