"use server";

import { revalidatePath } from "next/cache";

import { markAnnouncementsRead } from "@/db/announcement-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

/**
 * T-244: /app/info marks the announcements it showed as read for the signed-in member, both
 * roles, a gerai awaiting approval included. Idempotent; ids are re-validated here and the
 * repository and RLS accept only published announcements and the caller's own receipts.
 * When something new was read the tenant layout is revalidated, so the sidebar badge clears.
 */
export async function markAnnouncementsReadAction(ids: unknown): Promise<{ marked: number }> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) return { marked: 0 };
  const valid = [...new Set(ids.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  if (valid.length === 0) return { marked: 0 };

  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) return { marked: 0 };
    throw error;
  }
  if (principal.scope !== "tenant") return { marked: 0 };

  const marked = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => markAnnouncementsRead(tx, context.userId, valid),
    { allowPendingApproval: true },
  );
  if (marked > 0) revalidatePath("/app", "layout");
  return { marked };
}
