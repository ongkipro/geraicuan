import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-182 (PR-60, D-8): every shipment path refuses a signed-in store that awaits
 * approval — server-side, with the real session, principal and scope check —
 * and lets the same store through once it is approved. The refusal is the
 * redirect to the dashboard that states why; nothing reaches a provider.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Shipment path approval tests require geraicuan_test.");
}

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => requestHeaders,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const admin = new Pool({ connectionString: databaseUrl });
const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3110";
const tenantId = "18210000-0000-4000-8000-000000000001";
const outletId = "18210000-0000-4000-8000-000000000011";
const userId = "t182-path-admin";
const email = "t182-path-admin@example.test";
const password = "t182-path-password-only";
const someId = "18210000-0000-4000-8000-0000000000aa";
const APPROVAL_REDIRECT = "NEXT_REDIRECT:/app?persetujuan=diperlukan";

const fetchSpy = vi.fn(async () => {
  throw new Error("No provider call is allowed in this test.");
});

async function cleanup() {
  await admin.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await admin.query("DELETE FROM accounts WHERE user_id = $1", [userId]);
  await admin.query("DELETE FROM audit_events WHERE tenant_id = $1 OR actor_id = $2", [tenantId, userId]);
  await admin.query("DELETE FROM shipment_rate_limits WHERE tenant_id = $1", [tenantId]);
  await admin.query("DELETE FROM outlets WHERE tenant_id = $1", [tenantId]);
  await admin.query("DELETE FROM memberships WHERE tenant_id = $1", [tenantId]);
  await admin.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  await admin.query("DELETE FROM users WHERE id = $1", [userId]);
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function signIn() {
  const { auth } = await import("@/lib/auth");
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
    body: JSON.stringify({ email, password }),
    headers: {
      "content-type": "application/json",
      host: new URL(origin).host,
      origin,
      "x-geraicuan-login-scope": "tenant",
    },
    method: "POST",
  }));
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") ?? "").match(/((?:__Secure-)?better-auth\.session_token=[^;]+)/)?.[1];
  if (!cookie) throw new Error("No session cookie.");
  requestHeaders = new Headers({ cookie, host: new URL(origin).host });
}

type Path = { name: string; run: () => Promise<unknown> };

const paths: Path[] = [
  {
    name: "draft creation",
    run: async () => (await import("@/app/app/actions")).saveShipmentDraft({}, form({})),
  },
  {
    name: "draft destination verification",
    run: async () =>
      (await import("@/app/app/actions")).verifyShipmentDraftDestinationArea({}, form({ shipmentId: someId })),
  },
  {
    name: "estimate",
    run: async () => (await import("@/app/app/estimate-actions")).loadShipmentEstimate({}, form({ shipmentId: someId })),
  },
  {
    name: "COD totals, confirmation and issuance",
    run: async () =>
      (await import("@/app/app/pengiriman/[shipmentId]/actions")).confirmShipmentIssuance({}, form({
        confirmation: "confirmed",
        estimateServiceId: someId,
        estimateSnapshotId: someId,
        shipmentId: someId,
      })),
  },
  {
    name: "unpaid recovery",
    run: async () =>
      (await import("@/app/app/pengiriman/[shipmentId]/unpaid-recovery-actions")).recoverShipmentUnpaidPayment(
        {},
        form({ confirmation: "confirmed", shipmentId: someId }),
      ),
  },
  {
    name: "unknown-submission reconciliation",
    run: async () =>
      (await import("@/app/app/pengiriman/[shipmentId]/reconciliation-actions")).reconcileShipmentUnknownSubmission(
        {},
        form({ confirmation: "confirmed", shipmentId: someId }),
      ),
  },
  {
    name: "bulk import preview",
    run: async () => (await import("@/app/app/impor/actions")).uploadBulkIntake({}, form({})),
  },
  {
    name: "bulk import draft creation",
    run: async () => (await import("@/app/app/impor/actions")).createSelectedDrafts({}, form({})),
  },
  {
    name: "quick rate",
    run: async () => (await import("@/app/app/cek-tarif/actions")).checkShippingRates({}, form({ outletId })),
  },
  {
    name: "destination area search",
    run: async () => (await import("@/app/app/location-actions")).searchMengantarDestinationAreas(outletId, "Bandung"),
  },
  {
    name: "Mengantar settlement pull",
    run: async () => (await import("@/app/app/keuangan/actions")).pullMengantarSettlement({}, form({ outletId })),
  },
  {
    name: "label print",
    run: async () => (await import("@/app/app/label/[shipmentId]/actions")).recordLabelPrint({}, form({ shipmentId: someId })),
  },
];

async function outcome(path: Path) {
  try {
    await path.run();
    return "resolved";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, process.env.APP_DATABASE_URL);
  await cleanup();
  await admin.query(
    "INSERT INTO users (id, name, email, email_verified, status) VALUES ($1, 'Path Admin', $2, true, 'ACTIVE')",
    [userId, email],
  );
  await admin.query(
    `INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password)
     VALUES ($1, $2, 'credential', 'local:credential', $2, $3)`,
    [`account-${userId}`, userId, await hashPassword(password)],
  );
  await admin.query(
    "INSERT INTO tenants (id, name, status, mengantar_credential_policy) VALUES ($1, 'T182 Path Store', 'PROVISIONING', 'PRIVATE_ONLY')",
    [tenantId],
  );
  await admin.query(
    "INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'TENANT_ADMIN', 'ACTIVE')",
    [tenantId, userId],
  );
  await admin.query(
    "INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES ($1, $2, 'Path Outlet', 'path-pickup', 'path-origin')",
    [outletId, tenantId],
  );
  vi.stubGlobal("fetch", fetchSpy);
});

beforeEach(async () => {
  await admin.query("DELETE FROM rate_limits");
  await admin.query("UPDATE tenants SET status = 'PROVISIONING' WHERE id = $1", [tenantId]);
  fetchSpy.mockClear();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await admin.query("UPDATE tenants SET status = 'PROVISIONING' WHERE id = $1", [tenantId]);
  await cleanup();
  await admin.end();
});

describe("a store awaiting approval is refused on every shipment path (PR-60)", () => {
  it("signs in while awaiting approval", async () => {
    await signIn();
    const { requireCmsScope } = await import("@/lib/cms-auth");
    await expect(requireCmsScope("tenant", { allowPendingApproval: true }))
      .resolves.toMatchObject({ tenantId, tenantStatus: "PROVISIONING" });
  });

  it.each(paths.map((path) => [path.name, path] as const))(
    "refuses %s while awaiting approval and accepts it after approval",
    async (_name, path) => {
      await signIn();
      const shipmentsBefore = await admin.query("SELECT count(*)::int AS n FROM shipments WHERE tenant_id = $1", [tenantId]);

      expect(await outcome(path)).toBe(APPROVAL_REDIRECT);
      expect(fetchSpy).not.toHaveBeenCalled();

      await admin.query("UPDATE tenants SET status = 'ACTIVE' WHERE id = $1", [tenantId]);
      // Past the gate: each path returns its own validation or refusal state.
      expect(await outcome(path)).toBe("resolved");

      const shipmentsAfter = await admin.query("SELECT count(*)::int AS n FROM shipments WHERE tenant_id = $1", [tenantId]);
      expect(shipmentsAfter.rows[0].n).toBe(shipmentsBefore.rows[0].n);
    },
  );
});
