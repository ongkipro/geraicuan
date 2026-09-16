import {
  AnalyticsExportLimitError,
  AnalyticsFilterDeniedError,
  loadAnalyticsFilterOptions,
} from "@/db/analytics-repository";
import { db } from "@/db/client";
import { loadShipmentReportExport } from "@/db/shipment-report-repository";
import { withTenantContext } from "@/db/tenant-context";
import { serializeShipmentReportCsv } from "@/lib/analytics-export";
import { parseTenantAnalyticsQuery } from "@/lib/analytics-filters";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const dynamic = "force-dynamic";

/**
 * PR-55 Laporan pengiriman export — the analytics export contract reused, not
 * re-invented: the same Tenant Admin gate, the same filter parser, the same
 * refusal above the row ceiling with the count stated, and the same headers.
 */
function searchParamsRecord(searchParams: URLSearchParams) {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const existing = result[key];
    result[key] = existing === undefined
      ? value
      : Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
  }
  return result;
}

function textResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      return textResponse("Authentication is required.", 401);
    }
    throw error;
  }

  if (principal.scope !== "tenant" || principal.role !== "TENANT_ADMIN") {
    return textResponse("Tenant Admin access is required.", 403);
  }

  try {
    const options = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      loadAnalyticsFilterOptions,
    );
    const parsed = parseTenantAnalyticsQuery(
      searchParamsRecord(new URL(request.url).searchParams),
      {
        knownCouriers: options.couriers,
        knownOutletIds: options.outlets.map((outlet) => outlet.id),
        now: new Date(),
      },
    );
    if (parsed.filterRejected || parsed.issues.length > 0) {
      return textResponse("Shipment report export filters are invalid.", 400);
    }

    const exported = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => loadShipmentReportExport(tx, context, {
        filters: parsed.query.filters,
        range: parsed.query.range,
      }),
    );

    return new Response(serializeShipmentReportCsv(exported.rows), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="geraicuan-laporan-pengiriman.csv"',
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AnalyticsFilterDeniedError) {
      return textResponse("Shipment report filter scope is not permitted.", 403);
    }
    if (error instanceof AnalyticsExportLimitError) {
      return textResponse(
        `Filtered export contains ${error.totalCount} rows; narrow the filters below ${error.maxRows + 1} rows.`,
        413,
      );
    }
    throw error;
  }
}
