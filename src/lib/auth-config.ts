import { isIP } from "node:net";

type AuthEnvironment = {
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_TRUSTED_PROXY_CIDRS?: string;
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
};

function splitList(value: string | undefined) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseExactHttpsOrigin(value: string, variable: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must contain valid absolute origins.`);
  }

  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
    || value.includes("*")
  ) {
    throw new Error(`${variable} must contain exact HTTPS origins without paths or wildcards.`);
  }

  return url.origin;
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

export function resolveBetterAuthRuntimeConfig(environment: AuthEnvironment) {
  const trustedOrigins = splitList(environment.BETTER_AUTH_TRUSTED_ORIGINS);
  const trustedProxies = splitList(environment.BETTER_AUTH_TRUSTED_PROXY_CIDRS);
  const baseURL = environment.BETTER_AUTH_URL?.trim() || undefined;

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

    return {
      baseURL: exactBaseURL,
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
  return {
    baseURL,
    trustedOrigins,
    trustedProxies,
    useSecureCookies: baseURL?.startsWith("https://") ?? false,
  };
}
