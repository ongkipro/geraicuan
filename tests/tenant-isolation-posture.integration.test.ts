import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;

if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });

afterAll(async () => {
  await adminPool.end();
});

/**
 * Tenant-scoped tables, derived from the live catalogue rather than a list.
 *
 * "Carries a tenant_id" is the common case, but `tenants` itself and
 * `platform_roles` gate cross-tenant visibility without one, so they are named
 * explicitly. A new table keyed by something other than `tenant_id` would still
 * escape this derivation — if one is added, name it here.
 */
const EXPLICIT_TENANT_SCOPED = ["tenants", "platform_roles"];

/**
 * Tables that carry `tenant_id` but that the application role must not reach at
 * all: only an owner-run SECURITY DEFINER function uses them. No privilege is a
 * stronger boundary than row-level security, and the last test asserts it.
 */
// T-241 / 0064: tenant_contact_counters is the contact-number allocator, revoked from the
// runtime role exactly like tenant_shipment_counters (0040).
const INTERNAL_NO_RUNTIME_ACCESS = ["tenant_shipment_counters", "tenant_contact_counters"];

async function tenantScopedTables() {
  const { rows } = await adminPool.query<{
    relname: string;
    rls: boolean;
    forced: boolean;
    policies: number;
  }>(
    `SELECT c.relname,
            c.relrowsecurity AS rls,
            c.relforcerowsecurity AS forced,
            (SELECT count(*)::int
               FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
        AND (
          c.relname = ANY($1::text[])
          OR (NOT c.relname = ANY($2::text[]) AND EXISTS (
            SELECT 1 FROM information_schema.columns col
             WHERE col.table_schema = 'public'
               AND col.table_name = c.relname
               AND col.column_name = 'tenant_id'
          ))
        )
      ORDER BY c.relname`,
    [EXPLICIT_TENANT_SCOPED, INTERNAL_NO_RUNTIME_ACCESS],
  );
  return rows;
}

/**
 * Effective privileges, table-level and column-level together.
 *
 * `information_schema.role_table_grants` reports only table-wide grants. Several
 * tables here are granted `UPDATE` on a named column subset instead, which that
 * view cannot see — reading it alone reports them as append-only when they are
 * not.
 */
async function effectiveGrants(table: string) {
  const { rows } = await adminPool.query<{ privilege_type: string; columns: string | null }>(
    `SELECT g.privilege_type,
            CASE WHEN t.privilege_type IS NOT NULL THEN NULL
                 ELSE string_agg(DISTINCT g.column_name, ',' ORDER BY g.column_name)
            END AS columns
       FROM information_schema.column_privileges g
       LEFT JOIN information_schema.role_table_grants t
              ON t.table_name = g.table_name
             AND t.grantee = g.grantee
             AND t.privilege_type = g.privilege_type
      WHERE g.table_schema = 'public'
        AND g.table_name = $1
        AND g.grantee = 'geraicuan_app'
      GROUP BY g.privilege_type, t.privilege_type
      ORDER BY g.privilege_type`,
    [table],
  );
  return rows.map(({ privilege_type, columns }) =>
    columns === null ? privilege_type : `${privilege_type}(${columns})`,
  );
}

describe("tenant isolation posture", () => {
  it("forces row-level security with at least one policy on every tenant-scoped table", async () => {
    await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
    const tables = await tenantScopedTables();
    expect(tables.length).toBeGreaterThan(20);

    const unprotected = tables.filter(
      (table) => !table.rls || !table.forced || table.policies === 0,
    );
    expect(
      unprotected.map(({ relname, rls, forced, policies }) => ({ relname, rls, forced, policies })),
    ).toEqual([]);
  });

  it("grants the application role a usable privilege on every tenant-scoped table", async () => {
    // `shipment_rts_events` shipped with a policy and no grant at all, so the
    // page died on `permission denied` rather than on row-level security. A
    // policy without a grant is not protection, it is an outage.
    const tables = await tenantScopedTables();
    const ungranted: string[] = [];
    for (const { relname } of tables) {
      const grants = await effectiveGrants(relname);
      if (!grants.some((grant) => grant.startsWith("SELECT"))) ungranted.push(relname);
    }
    expect(ungranted).toEqual([]);
  });

  it("grants the application role no privilege it never exercises", async () => {
    // Append-only: no UPDATE and no DELETE at any granularity.
    for (const table of [
      "audit_events",
      "ledger_entries",
      "print_events",
      "provider_order_history_events",
      "provider_order_status_observations",
      "provider_settlement_items",
      "provider_settlement_pulls",
      "reconciliation_runs",
      "shipment_cod_totals",
      "shipment_estimate_services",
      "shipment_estimate_snapshots",
      "shipment_invoices",
      "shipment_parties",
      "shipment_rts_events",
    ]) {
      expect(await effectiveGrants(table), table).toEqual(["INSERT", "SELECT"]);
    }

    // Provider records are not append-only: each one is updated in place as the
    // provider resolves it, but only on the columns that carry the outcome.
    expect(await effectiveGrants("provider_batches")).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE(completed_at,safe_error_code,status,submission_attempted_at,updated_at)",
    ]);
    expect(await effectiveGrants("provider_order_snapshots")).toEqual([
      "INSERT",
      "SELECT",
      // T-223 / 0056: provider_batch_id is written when an order is accepted.
      // T-238 / 0063: return_cnote_no is written by the status pull.
      "UPDATE(cnote_no,is_paid,provider_batch_id,provider_order_id,resolved_at,return_cnote_no,safe_response_code,status)",
    ]);
    expect(await effectiveGrants("provider_unpaid_recoveries")).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE(attempted_at,completed_at,safe_response_code,status,updated_at)",
    ]);

    // Membership state changes, never its subject.
    expect(await effectiveGrants("memberships")).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE(role,status,updated_at)",
    ]);

    // Rate limits are upserted on their natural key; only the counter and the
    // window timestamp move.
    for (const table of ["shipment_rate_limits", "mengantar_credential_rate_limits"]) {
      expect(await effectiveGrants(table), table).toEqual([
        "INSERT",
        "SELECT",
        "UPDATE(count,last_request)",
      ]);
    }

    // The remaining mutable tenant records. Asserting the exact set, not just
    // the absence of identity columns, so a later grant of any new column has
    // to be stated here rather than landing silently.
    const mutable: Record<string, string> = {
      contact_addresses:
        "UPDATE(address,archived_at,destination_area_id,destination_area_label,is_primary,label,updated_at)",
      // T-241 / 0064: category joins the column grant; contact_number never does.
      contacts: "UPDATE(archived_at,category,is_recipient,is_sender,name,phone,updated_at)",
      managed_secret_payloads:
        "UPDATE(authentication_tag,ciphertext,key_version,nonce,reference,updated_at)",
      mengantar_connections: "UPDATE(secret_reference,updated_at)",
      outlets:
        "UPDATE(default_origin_area_id,default_origin_area_label,default_pickup_address_id,default_pickup_address_label,mengantar_authority_version,name,updated_at)",
      shipment_drafts:
        "UPDATE(cogs_amount_idr,declared_value_idr,destination_area_id,destination_area_label,destination_area_verified_at,is_cod,package_content,package_height_cm,package_length_cm,package_quantity,package_weight_grams,package_width_cm,updated_at)",
      shipments: "UPDATE(cogs_amount_idr,status,updated_at)",
      // T-229 / 0059: the per-size choices and who changed them; never the tenant or size.
      // T-243 / 0065: the courier logo, gerai logo and label note toggles.
      tenant_label_settings:
        "UPDATE(show_courier_logo,show_gerai_logo,show_label_note,show_recipient_address_detail,show_recipient_name,show_recipient_phone,show_return_warning,show_sender_address,show_sender_phone,updated_at,updated_by_user_id)",
      // T-233 / 0058: contact_whatsapp is written only by set_tenant_contact_whatsapp.
      tenants: "UPDATE(name,status,updated_at)",
    };
    for (const [table, update] of Object.entries(mutable)) {
      const grants = await effectiveGrants(table);
      expect(grants.filter((grant) => grant.startsWith("UPDATE")), table).toEqual([update]);
    }
  });

  it("keeps global reference allocation metadata inaccessible to tenant SQL", async () => {
    expect(await effectiveGrants("shipment_reference_counters")).toEqual([]);
  });

  it("never lets the application role rewrite a row's identity or owner", async () => {
    // A tenant move must be impossible at the privilege layer, not only
    // rejected by a policy's WITH CHECK.
    const immutable: Record<string, readonly string[]> = {
      contact_addresses: ["id", "tenant_id", "created_at", "contact_id"],
      contacts: ["id", "tenant_id", "created_at", "contact_number"],
      managed_secret_payloads: ["tenant_id", "created_at", "outlet_id", "purpose"],
      mengantar_connections: ["id", "tenant_id", "created_at", "outlet_id"],
      outlets: ["id", "tenant_id", "created_at"],
      shipment_drafts: ["tenant_id", "created_at", "shipment_id"],
      shipments: ["id", "tenant_id", "created_at", "outlet_id", "created_by_user_id", "public_reference", "reference_user_number", "reference_date", "daily_sequence"],
      users: ["public_number"],
      tenants: ["id", "created_at", "contact_whatsapp"],
      tenant_label_settings: ["tenant_id", "label_size", "created_at"],
    };

    for (const [table, columns] of Object.entries({
      ...immutable,
      mengantar_credential_rate_limits: ["tenant_id", "outlet_id", "actor_id"],
      shipment_rate_limits: ["tenant_id", "actor_id", "operation"],
    })) {
      const { rows } = await adminPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = $1
            AND grantee = 'geraicuan_app' AND privilege_type = 'UPDATE'
            AND column_name = ANY($2::text[])`,
        [table, columns],
      );
      expect(rows.map((row) => row.column_name), table).toEqual([]);
    }
  });

  it("runs the application on a role that cannot bypass row-level security", async () => {
    const appPool = new Pool({ connectionString: appDatabaseUrl });
    try {
      const { rows } = await appPool.query<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
      // Every policy in this schema is worthless against a superuser or a
      // BYPASSRLS role, so `withTenantContext` refuses to run on one.
      expect(rows[0]?.rolsuper, rows[0]?.rolname).toBe(false);
      expect(rows[0]?.rolbypassrls, rows[0]?.rolname).toBe(false);
    } finally {
      await appPool.end();
    }
  });

  it("hides existing rows from the application role when no tenant context is set", async () => {
    const appPool = new Pool({ connectionString: appDatabaseUrl });
    const tenantId = "00000000-0000-2900-0000-000000000001";
    const outletId = "00000000-0000-2901-0000-000000000001";
    const shipmentId = "00000000-0000-2902-0000-000000000001";
    try {
      await adminPool.query(
        "INSERT INTO tenants (id, name, status) VALUES ($1, 'Posture Tenant', 'ACTIVE') ON CONFLICT (id) DO NOTHING",
        [tenantId],
      );
      await adminPool.query(
        `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
         VALUES ($1, $2, 'Posture Outlet', 'pickup', 'origin') ON CONFLICT (id) DO NOTHING`,
        [outletId, tenantId],
      );
      await adminPool.query(
        `INSERT INTO shipments (id, tenant_id, outlet_id, status)
         VALUES ($1, $2, $3, 'DRAFT') ON CONFLICT (id) DO NOTHING`,
        [shipmentId, tenantId, outletId],
      );

      // The row exists. This is the posture that made the invented tracking
      // webhook inert: without `app.tenant_id`, the application role sees none
      // of it, so a zero result here is enforcement rather than an empty table.
      const { rows: adminRows } = await adminPool.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM shipments WHERE id = $1",
        [shipmentId],
      );
      expect(adminRows[0]?.total).toBe(1);

      const { rows: appRows } = await appPool.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM shipments WHERE id = $1",
        [shipmentId],
      );
      expect(appRows[0]?.total).toBe(0);
    } finally {
      await appPool.end();
      await adminPool.query("DELETE FROM shipments WHERE id = $1", [shipmentId]);
      await adminPool.query("DELETE FROM outlets WHERE id = $1", [outletId]);
      await adminPool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    }
  });

  it("gives the application role no privilege at all on internal allocator tables", async () => {
    for (const table of INTERNAL_NO_RUNTIME_ACCESS) {
      expect(await effectiveGrants(table), table).toEqual([]);
      const { rows } = await adminPool.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id') AS exists",
        [table],
      );
      // Keep the exemption honest: it only applies to tables that really are tenant-keyed.
      expect(rows[0]?.exists, table).toBe(true);
    }
  });
});
