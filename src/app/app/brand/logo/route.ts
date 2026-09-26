import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantLogo, loadTenantLogoVersion } from "@/db/tenant-settings-repository";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const dynamic = "force-dynamic";

function emptyResponse(status: number) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * T-243: the gerai logo for the signed-in member's own tenant (both roles print it). The
 * tenant comes from the session, never from the URL (`?v=` only busts caches), so another
 * tenant's logo is unreachable. The stored type was sniffed from the bytes at upload.
 * T-247 (L3): `?sha=<64 hex>` serves that kept version instead (an issued invoice's logo),
 * still only from the session's tenant; a malformed or unknown sha is 404. A version never
 * changes, so it may be cached for good.
 */
export async function GET(request: Request) {
  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) return emptyResponse(401);
    throw error;
  }
  if (principal.scope !== "tenant") return emptyResponse(401);

  const version = new URL(request.url).searchParams.get("sha");
  const logo = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => (version === null ? loadTenantLogo(tx, context) : loadTenantLogoVersion(tx, context, version)),
    { allowPendingApproval: true },
  );
  if (!logo) return emptyResponse(404);

  const etag = `"${logo.sha256}"`;
  const headers = {
    "Cache-Control": version === null ? "private, no-cache" : "private, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
  const match = request.headers.get("if-none-match");
  if (match && match.split(",").some((value) => value.trim() === etag || value.trim() === `W/${etag}`)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(logo.bytes), {
    status: 200,
    headers: { ...headers, "Content-Length": String(logo.bytes.length), "Content-Type": logo.mime },
  });
}
