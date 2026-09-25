import { isIP } from "node:net";

type AuthEnvironment = {
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_TRUSTED_PROXY_CIDRS?: string;
  BETTER_AUTH_URL?: string;
  GERAICUAN_PLATFORM_ORIGIN?: string;
  GERAICUAN_PUBLIC_ORIGIN?: string;
  GERAICUAN_TENANT_ORIGIN?: string;
  NODE_ENV?: string;
};

/**
 * The two CMS hosts one deployment serves (D-7, PR-58). `null` means host
 * routing is not configured, which only development and test may be: every
 * surface is then served from whichever single origin the request used.
 */
export type HostRouting = {
  platformOrigin: string;
  /** Where "back to the home page" points; the apex is a separate Astro site. */
  publicOrigin?: string;
  tenantOrigin: string;
};

function splitList(value: string | undefined) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseExactHttpsOrigin(value: string, variable: string) {
  return parseExactOrigin(value, variable, true);
}

function parseExactOrigin(value: string, variable: string, requireHttps: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must contain valid absolute origins.`);
  }

  if (
    (requireHttps ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol))
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
    || value.includes("*")
  ) {
    throw new Error(
      `${variable} must contain exact ${requireHttps ? "HTTPS " : ""}origins without paths or wildcards.`,
    );
  }

  return url.origin;
}

/**
 * Reads and validates the host-routing origins. Production requires all three
 * as exact HTTPS origins on distinct hosts; elsewhere they are optional, but a
 * half-configured pair is refused rather than silently ignored.
 */
export function resolveHostRouting(environment: AuthEnvironment): HostRouting | null {
  const production = environment.NODE_ENV === "production";
  const tenant = environment.GERAICUAN_TENANT_ORIGIN?.trim();
  const platform = environment.GERAICUAN_PLATFORM_ORIGIN?.trim();
  const publicValue = environment.GERAICUAN_PUBLIC_ORIGIN?.trim();

  if (!production && !tenant && !platform) {
    return null;
  }
  for (const [name, value] of [
    ["GERAICUAN_TENANT_ORIGIN", tenant],
    ["GERAICUAN_PLATFORM_ORIGIN", platform],
    ...(production ? [["GERAICUAN_PUBLIC_ORIGIN", publicValue]] : []),
  ] as const) {
    if (!value) {
      throw new Error(
        `${name} is required ${production ? "in production" : "when host routing is configured"}.`,
      );
    }
  }

  const tenantOrigin = parseExactOrigin(tenant!, "GERAICUAN_TENANT_ORIGIN", production);
  const platformOrigin = parseExactOrigin(platform!, "GERAICUAN_PLATFORM_ORIGIN", production);
  const publicOrigin = publicValue
    ? parseExactOrigin(publicValue, "GERAICUAN_PUBLIC_ORIGIN", production)
    : undefined;

  const hosts = [tenantOrigin, platformOrigin, publicOrigin]
    .filter((origin): origin is string => Boolean(origin))
    .map((origin) => new URL(origin).host);
  if (new Set(hosts).size !== hosts.length) {
    throw new Error("The tenant, platform and public origins must be on distinct hosts.");
  }
  if (new URL(tenantOrigin).protocol !== new URL(platformOrigin).protocol) {
    throw new Error("The tenant and platform origins must use the same protocol.");
  }

  return { platformOrigin, publicOrigin, tenantOrigin };
}

function isValidIpOrCidr(value: string) {
  const [address, prefix, ...rest] = value.split("/");
  const version = isIP(address);
  if (version === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;

  const bits = Number(prefix);
  return bits >= 0 && bits <= (version === 4 ? 32 : 128);
}

/**
 * Better Auth resolves each request's base URL from the request's own host,
 * but only when that host is one of the two configured CMS hosts. The protocol
 * is fixed by configuration, and `advanced.trustedProxyHeaders` stays unset, so
 * neither `X-Forwarded-Host` nor `X-Forwarded-Proto` can steer a generated
 * verification or recovery link. Production has no fallback: an unknown host
 * gets no link at all. Development falls back to the configured
 * `BETTER_AUTH_URL`, never to the request, so single-origin mode keeps working.
 */
function dynamicBaseURL(hostRouting: HostRouting, fallback: string | undefined) {
  return {
    allowedHosts: [
      new URL(hostRouting.tenantOrigin).host,
      new URL(hostRouting.platformOrigin).host,
    ],
    protocol: new URL(hostRouting.tenantOrigin).protocol === "https:"
      ? ("https" as const)
      : ("http" as const),
    ...(fallback ? { fallback } : {}),
  };
}

export function resolveBetterAuthRuntimeConfig(environment: AuthEnvironment) {
  const trustedOrigins = splitList(environment.BETTER_AUTH_TRUSTED_ORIGINS);
  const trustedProxies = splitList(environment.BETTER_AUTH_TRUSTED_PROXY_CIDRS);
  const baseURL = environment.BETTER_AUTH_URL?.trim() || undefined;
  const hostRouting = resolveHostRouting(environment);

  if (environment.NODE_ENV === "production") {
    if (!baseURL) {
      throw new Error("BETTER_AUTH_URL is required in production.");
    }
    if (!trustedOrigins?.length) {
      throw new Error("BETTER_AUTH_TRUSTED_ORIGINS is required in production.");
    }
    if (!trustedProxies?.length) {
      throw new Error("BETTER_AUTH_TRUSTED_PROXY_CIDRS is required in production.");
    }
    if (!trustedProxies.every(isValidIpOrCidr)) {
      throw new Error(
        "BETTER_AUTH_TRUSTED_PROXY_CIDRS must contain only valid IP addresses or CIDR ranges.",
      );
    }

    const exactBaseURL = parseExactHttpsOrigin(baseURL, "BETTER_AUTH_URL");
    const exactOrigins = trustedOrigins.map((origin) =>
      parseExactHttpsOrigin(origin, "BETTER_AUTH_TRUSTED_ORIGINS"),
    );
    const uniqueOrigins = [...new Set(exactOrigins)];

    if (uniqueOrigins.length !== 2 || !uniqueOrigins.includes(exactBaseURL)) {
      throw new Error(
        "BETTER_AUTH_TRUSTED_ORIGINS must contain exactly the tenant and platform origins, including BETTER_AUTH_URL.",
      );
    }
    // resolveHostRouting never returns null in production.
    const routing = hostRouting!;
    if (
      !uniqueOrigins.includes(routing.tenantOrigin)
      || !uniqueOrigins.includes(routing.platformOrigin)
    ) {
      throw new Error(
        "BETTER_AUTH_TRUSTED_ORIGINS must equal GERAICUAN_TENANT_ORIGIN and GERAICUAN_PLATFORM_ORIGIN.",
      );
    }

    return {
      baseURL: dynamicBaseURL(routing, undefined),
      hostRouting: routing,
      trustedOrigins: uniqueOrigins,
      trustedProxies,
      // Stated rather than left to the library's inference: production origins
      // are already forced to HTTPS above, so the session cookie must carry
      // Secure regardless of how that inference might change.
      useSecureCookies: true,
    };
  }

  // Outside production, follow the origin rather than forcing false: a staging
  // or preview build served over HTTPS must still get Secure and the
  // __Secure- prefix, which a flat false would take away.
  if (hostRouting && !baseURL) {
    throw new Error("BETTER_AUTH_URL is required when host routing is configured.");
  }

  return {
    baseURL: hostRouting ? dynamicBaseURL(hostRouting, baseURL) : baseURL,
    hostRouting,
    trustedOrigins,
    trustedProxies,
    useSecureCookies: baseURL?.startsWith("https://") ?? false,
  };
}
