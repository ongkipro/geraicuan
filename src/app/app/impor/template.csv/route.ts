import { redirect } from "next/navigation";

import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export async function GET() {
  try {
    const principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") redirect("/login/tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }

  return new Response(`\uFEFF${BULK_TEMPLATE_HEADERS.join(",")}\r\n`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="template-kiriman-geraicuan.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
