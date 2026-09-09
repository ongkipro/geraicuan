import { createHash, randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

const scryptAsync = promisify(scrypt);
const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
};

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.DEV_LOCAL_PASSWORD;

if (!databaseUrl || !password) {
  throw new Error("DATABASE_URL and DEV_LOCAL_PASSWORD are required.");
}

const target = new URL(databaseUrl);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/geraicuan_test") {
  throw new Error("This seeder only permits the isolated local geraicuan_test database.");
}

const accounts = [
  {
    email: "tenant@geraicuan.com",
    name: "Demo Tenant Admin",
    role: "TENANT_ADMIN",
  },
  {
    email: "operator@geraicuan.com",
    name: "Demo Operator",
    role: "OPERATOR",
  },
  {
    email: "super@geraicuan.com",
    name: "Local Super Admin",
    role: "SUPER_ADMIN",
  },
];
const tenantId = "70000000-0000-4000-8000-000000000001";
const outletId = "70000000-0000-4000-8000-000000000002";
const issuer = "local:credential";
const passwordHash = await hashPassword(password);
const client = new Client({ connectionString: databaseUrl });
let seedSummary;

const fixedUuid = (prefix, index) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const anchor = new Date(`${jakartaDate}T00:00:00+07:00`);
const at = (daysAgo, hour = 9, minute = 0) =>
  new Date(anchor.getTime() - daysAgo * 86_400_000 + hour * 3_600_000 + minute * 60_000);

const contacts = Array.from({ length: 15 }, (_, index) => ({
  id: fixedUuid("71", index + 1),
  name: [
    "Ayu Lestari", "Bima Pratama", "Citra Maharani", "Dedi Kurniawan", "Eka Safitri",
    "Farhan Akbar", "Gita Permata", "Hendra Wijaya", "Intan Puspita", "Joko Santoso",
    "Kartika Sari", "Lukman Hakim", "Maya Anggraini", "Nanda Putri", "Rizky Ramadhan",
  ][index],
  phone: `08129000${String(index + 1).padStart(4, "0")}`,
  isSender: index < 3,
  isRecipient: index !== 1,
}));
const archivedContact = {
  id: fixedUuid("71", 16),
  name: "Sari Arsip",
  phone: "081290000016",
  isSender: false,
  isRecipient: true,
};

// A return only happens to a shipment the provider already accepted, so these
// statuses keep the ISSUED provider shape and differ only on the shipment row.
const RETURN_LIFECYCLE_STATUSES = new Set([
  "RTS_QUEUED",
  "RTS_IN_TRANSIT",
  "RTS_RECEIVED",
  "PROBLEM",
]);

const shipmentDefinitions = [
  { status: "DRAFT", isCod: false, daysAgo: 0 },
  { status: "DRAFT", isCod: true, daysAgo: 1 },
  { status: "DRAFT", isCod: false, daysAgo: 2 },
  { status: "ESTIMATED", isCod: true, daysAgo: 1 },
  { status: "ESTIMATED", isCod: false, daysAgo: 3 },
  { status: "ESTIMATED", isCod: true, daysAgo: 5 },
  { status: "ESTIMATED", isCod: false, daysAgo: 8 },
  { status: "SUBMISSION_QUEUED", isCod: true, daysAgo: 0 },
  { status: "SUBMISSION_QUEUED", isCod: false, daysAgo: 1 },
  { status: "SUBMISSION_UNKNOWN", isCod: true, daysAgo: 0 },
  { status: "SUBMISSION_UNKNOWN", isCod: false, daysAgo: 4 },
  { status: "SUBMISSION_UNKNOWN", isCod: true, daysAgo: 12 },
  { status: "ISSUED", isCod: true, daysAgo: 0, cnoteNo: "SANITIZED-CNOTE-0001" },
  { status: "ISSUED", isCod: false, daysAgo: 3, cnoteNo: "SANITIZED-CNOTE-0002" },
  { status: "AWAITING_UPSTREAM_PAYMENT", isCod: false, daysAgo: 1 },
  { status: "AWAITING_UPSTREAM_PAYMENT", isCod: false, daysAgo: 6 },
  { status: "FAILED", isCod: true, daysAgo: 2 },
  { status: "FAILED", isCod: false, daysAgo: 10 },
  { status: "RTS_QUEUED", isCod: true, daysAgo: 1, cnoteNo: "SANITIZED-CNOTE-0003" },
  { status: "RTS_QUEUED", isCod: false, daysAgo: 2, cnoteNo: "SANITIZED-CNOTE-0004" },
  { status: "RTS_QUEUED", isCod: true, daysAgo: 4, cnoteNo: "SANITIZED-CNOTE-0005" },
  { status: "RTS_IN_TRANSIT", isCod: false, daysAgo: 3, cnoteNo: "SANITIZED-CNOTE-0006" },
  { status: "RTS_IN_TRANSIT", isCod: true, daysAgo: 6, cnoteNo: "SANITIZED-CNOTE-0007" },
  { status: "RTS_RECEIVED", isCod: false, daysAgo: 9, cnoteNo: "SANITIZED-CNOTE-0008" },
  { status: "PROBLEM", isCod: true, daysAgo: 2, cnoteNo: "SANITIZED-CNOTE-0009" },
].map((definition, index) => ({
  ...definition,
  // Every third shipment records a merchant cost, so the COGS and Net Margin
  // KPIs have a non-zero value to render and a zero cohort to contrast with.
  cogsAmountIdr: index % 3 === 0 ? 40_000 + index * 5_000 : null,
  index,
  id: fixedUuid("72", index + 1),
  estimateSnapshotId: fixedUuid("73", index + 1),
  estimateServiceId: fixedUuid("74", index + 1),
  codTotalId: fixedUuid("75", index + 1),
  batchId: fixedUuid("76", index + 1),
  providerOrderSnapshotId: fixedUuid("77", index + 1),
}));

await client.connect();
try {
  await client.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geraicuan_test_runtime') THEN CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app; END IF; END $$",
  );
  const runtimePasswordStatement = await client.query(
    "SELECT format('ALTER ROLE geraicuan_test_runtime PASSWORD %L', $1::text) AS statement",
    [password],
  );
  await client.query(runtimePasswordStatement.rows[0].statement);
  await client.query("BEGIN");
  await client.query("DELETE FROM rate_limits");
  await client.query(
    `INSERT INTO tenants (id, name, status)
       VALUES ($1, 'Local Development Tenant', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE', updated_at = now()`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
       VALUES ($1, $2, 'Local Development Outlet', 'local-pickup', 'local-origin')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, default_pickup_address_id = EXCLUDED.default_pickup_address_id, default_origin_area_id = EXCLUDED.default_origin_area_id`,
    [outletId, tenantId],
  );

  const userIds = new Map();
  for (const account of accounts) {
    const user = await client.query(
      `INSERT INTO users (id, name, email, email_verified, status)
         VALUES ($1, $2, $3, true, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, email_verified = true, status = 'ACTIVE', updated_at = now()
         RETURNING id`,
      [randomUUID(), account.name, account.email],
    );
    const userId = user.rows[0].id;
    userIds.set(account.role, userId);

    await client.query(
      `INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password)
         VALUES ($1, $2, 'credential', $3, $2, $4)
         ON CONFLICT (issuer, account_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now()`,
      [randomUUID(), userId, issuer, passwordHash],
    );

    if (account.role !== "SUPER_ADMIN") {
      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, role, status)
           VALUES ($1, $2, $3, 'ACTIVE')
           ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE', updated_at = now()`,
        [tenantId, userId, account.role],
      );
    } else {
      await client.query(
        `INSERT INTO platform_roles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
    }
  }

  const adminUserId = userIds.get("TENANT_ADMIN");
  if (!adminUserId) throw new Error("Seed Tenant Admin was not resolved.");

  for (const contact of contacts) {
    await client.query(
      `INSERT INTO contacts (
         id, tenant_id, name, phone, is_recipient, is_sender, archived_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         is_recipient = EXCLUDED.is_recipient,
         is_sender = EXCLUDED.is_sender,
         archived_at = NULL,
         updated_at = EXCLUDED.updated_at`,
      [contact.id, tenantId, contact.name, contact.phone, contact.isRecipient, contact.isSender, at(20 - contacts.indexOf(contact), 8)],
    );
    await client.query(
      `INSERT INTO contact_addresses (
         id, tenant_id, contact_id, label, address, destination_area_id,
         destination_area_label, is_primary, archived_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Alamat utama', $4, $5, $6, true, NULL, $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         contact_id = EXCLUDED.contact_id,
         label = EXCLUDED.label,
         address = EXCLUDED.address,
         destination_area_id = EXCLUDED.destination_area_id,
         destination_area_label = EXCLUDED.destination_area_label,
         is_primary = true,
         archived_at = NULL,
         updated_at = EXCLUDED.updated_at`,
      [
        fixedUuid("70", contacts.indexOf(contact) + 1),
        tenantId,
        contact.id,
        `Jl. Demo GeraiCUAN No. ${contacts.indexOf(contact) + 1}, Jakarta`,
        `31710${String((contacts.indexOf(contact) % 5) + 1).padStart(2, "0")}`,
        ["Gambir, Jakarta Pusat", "Tebet, Jakarta Selatan", "Kebayoran Baru, Jakarta Selatan", "Kebon Jeruk, Jakarta Barat", "Kelapa Gading, Jakarta Utara"][contacts.indexOf(contact) % 5],
        at(20 - contacts.indexOf(contact), 8),
      ],
    );
  }

  const archivedAt = at(1, 18);
  await client.query(
    `INSERT INTO contacts (
       id, tenant_id, name, phone, is_recipient, is_sender, archived_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
     ON CONFLICT (id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       is_recipient = EXCLUDED.is_recipient,
       is_sender = EXCLUDED.is_sender,
       archived_at = EXCLUDED.archived_at,
       updated_at = EXCLUDED.updated_at`,
    [
      archivedContact.id,
      tenantId,
      archivedContact.name,
      archivedContact.phone,
      archivedContact.isRecipient,
      archivedContact.isSender,
      archivedAt,
      at(22, 8),
    ],
  );
  await client.query(
    `INSERT INTO contact_addresses (
       id, tenant_id, contact_id, label, address, destination_area_id,
       destination_area_label, is_primary, archived_at, created_at, updated_at
     ) VALUES ($1, $2, $3, 'Alamat lama', 'Jl. Arsip Demo No. 16, Jakarta',
       '31710016', 'Gambir, Jakarta Pusat', true, $4, $5, $4)
     ON CONFLICT (id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       contact_id = EXCLUDED.contact_id,
       label = EXCLUDED.label,
       address = EXCLUDED.address,
       destination_area_id = EXCLUDED.destination_area_id,
       destination_area_label = EXCLUDED.destination_area_label,
       is_primary = true,
       archived_at = EXCLUDED.archived_at,
       updated_at = EXCLUDED.updated_at`,
    [fixedUuid("70", 16), tenantId, archivedContact.id, archivedAt, at(22, 8)],
  );

  for (const shipment of shipmentDefinitions) {
    const createdAt = at(shipment.daysAgo, 8 + shipment.index % 7, (shipment.index * 7) % 60);
    const resolvedAt = shipment.status === "SUBMISSION_QUEUED"
      ? null
      : new Date(createdAt.getTime() + 2 * 3_600_000);
    const updatedAt = resolvedAt ?? new Date(createdAt.getTime() + 30 * 60_000);
    const declaredValueIdr = shipment.isCod ? 125_000 + shipment.index * 25_000 : 90_000 + shipment.index * 20_000;
    const recipient = contacts[3 + shipment.index % (contacts.length - 3)];
    const sender = contacts[shipment.index % 3];
    const areaIndex = shipment.index % 5;
    const destinationAreaId = `31710${String(areaIndex + 1).padStart(2, "0")}`;
    const destinationAreaLabel = ["Gambir, Jakarta Pusat", "Tebet, Jakarta Selatan", "Kebayoran Baru, Jakarta Selatan", "Kebon Jeruk, Jakarta Barat", "Kelapa Gading, Jakarta Utara"][areaIndex];

    await client.query(
      `INSERT INTO shipments (
         id, tenant_id, outlet_id, status, cogs_amount_idr, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         outlet_id = EXCLUDED.outlet_id,
         status = EXCLUDED.status,
         cogs_amount_idr = EXCLUDED.cogs_amount_idr,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [shipment.id, tenantId, outletId, shipment.status, shipment.cogsAmountIdr, createdAt, updatedAt],
    );
    await client.query(
      `INSERT INTO shipment_drafts (
         shipment_id, tenant_id, destination_area_id, destination_area_label,
         package_content, package_weight_grams, package_quantity,
         package_length_cm, package_width_cm, package_height_cm,
         declared_value_idr, is_cod, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 25, 18, 12, $8, $9, $10, $11)
       ON CONFLICT (shipment_id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         destination_area_id = EXCLUDED.destination_area_id,
         destination_area_label = EXCLUDED.destination_area_label,
         package_content = EXCLUDED.package_content,
         package_weight_grams = EXCLUDED.package_weight_grams,
         package_quantity = EXCLUDED.package_quantity,
         package_length_cm = EXCLUDED.package_length_cm,
         package_width_cm = EXCLUDED.package_width_cm,
         package_height_cm = EXCLUDED.package_height_cm,
         declared_value_idr = EXCLUDED.declared_value_idr,
         is_cod = EXCLUDED.is_cod,
         updated_at = EXCLUDED.updated_at`,
      [
        shipment.id,
        tenantId,
        destinationAreaId,
        destinationAreaLabel,
        ["Pakaian", "Aksesori", "Peralatan rumah", "Buku", "Produk perawatan"][shipment.index % 5],
        500 + shipment.index * 125,
        1 + shipment.index % 3,
        declaredValueIdr,
        shipment.isCod,
        createdAt,
        updatedAt,
      ],
    );

    for (const [partyIndex, party] of [sender, recipient].entries()) {
      await client.query(
        `INSERT INTO shipment_parties (
           id, tenant_id, shipment_id, role, name, phone, address,
           destination_area_id, destination_area_label, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (shipment_id, role) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           address = EXCLUDED.address,
           destination_area_id = EXCLUDED.destination_area_id,
           destination_area_label = EXCLUDED.destination_area_label`,
        [
          fixedUuid(partyIndex === 0 ? "7c" : "7d", shipment.index + 1),
          tenantId,
          shipment.id,
          partyIndex === 0 ? "SENDER" : "RECIPIENT",
          party.name,
          party.phone,
          `Jl. Demo GeraiCUAN No. ${(shipment.index % contacts.length) + 1}, Jakarta`,
          partyIndex === 0 ? null : destinationAreaId,
          partyIndex === 0 ? null : destinationAreaLabel,
          createdAt,
        ],
      );
    }

    if (shipment.status === "DRAFT") continue;

    const providerService = ["JNE REG", "SiCepat REG", "JT EZ"][shipment.index % 3];
    const courier = ["JNE", "SiCepat", "JT"][shipment.index % 3];
    const shippingAmountIdr = 12_000 + (shipment.index % 5) * 2_500;
    const insuranceAmountIdr = shipment.index % 3 === 0 ? 2_000 : null;
    const estimateAt = new Date(createdAt.getTime() + 30 * 60_000);
    await client.query(
      `INSERT INTO shipment_estimate_snapshots (
         id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
         destination_area_label, weight_grams, is_cod_requested, credential_source, retrieved_at
       ) VALUES ($1, $2, $3, $4, 'local-origin', $5, $6, $7, $8, 'platform_default', $9)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         shipment_id = EXCLUDED.shipment_id,
         outlet_id = EXCLUDED.outlet_id,
         origin_area_id = EXCLUDED.origin_area_id,
         destination_area_id = EXCLUDED.destination_area_id,
         destination_area_label = EXCLUDED.destination_area_label,
         weight_grams = EXCLUDED.weight_grams,
         is_cod_requested = EXCLUDED.is_cod_requested,
         credential_source = EXCLUDED.credential_source,
         retrieved_at = EXCLUDED.retrieved_at`,
      [shipment.estimateSnapshotId, tenantId, shipment.id, outletId, destinationAreaId, destinationAreaLabel, 500 + shipment.index * 125, shipment.isCod, estimateAt],
    );
    await client.query(
      `INSERT INTO shipment_estimate_services (
         id, tenant_id, snapshot_id, provider_service, currency,
         shipping_amount_idr, shipping_source_field, insurance_amount_idr,
         insurance_source_field, delivery_estimate, cod_eligible
       ) VALUES ($1, $2, $3, $4, 'IDR', $5, 'price', $6, $7, '1-3 hari', true)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         snapshot_id = EXCLUDED.snapshot_id,
         provider_service = EXCLUDED.provider_service,
         shipping_amount_idr = EXCLUDED.shipping_amount_idr,
         insurance_amount_idr = EXCLUDED.insurance_amount_idr,
         insurance_source_field = EXCLUDED.insurance_source_field,
         delivery_estimate = EXCLUDED.delivery_estimate,
         cod_eligible = EXCLUDED.cod_eligible`,
      [shipment.estimateServiceId, tenantId, shipment.estimateSnapshotId, providerService, shippingAmountIdr, insuranceAmountIdr, insuranceAmountIdr === null ? null : "insurance_price"],
    );

    let providerCodAmountIdr = null;
    let serviceFeeIdr = null;
    let vatAmountIdr = null;
    if (shipment.isCod) {
      serviceFeeIdr = Math.floor(((declaredValueIdr + shippingAmountIdr) * 3 + 50) / 100);
      vatAmountIdr = Math.floor((serviceFeeIdr * 11 + 50) / 100);
      providerCodAmountIdr = declaredValueIdr + shippingAmountIdr + serviceFeeIdr + vatAmountIdr;
      await client.query(
        `INSERT INTO shipment_cod_totals (
           id, tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
           goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
           provider_cod_amount_idr, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'IDR', $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           shipment_id = EXCLUDED.shipment_id,
           snapshot_id = EXCLUDED.snapshot_id,
           estimate_service_id = EXCLUDED.estimate_service_id,
           goods_value_idr = EXCLUDED.goods_value_idr,
           shipping_amount_idr = EXCLUDED.shipping_amount_idr,
           service_fee_idr = EXCLUDED.service_fee_idr,
           vat_amount_idr = EXCLUDED.vat_amount_idr,
           provider_cod_amount_idr = EXCLUDED.provider_cod_amount_idr`,
        [shipment.codTotalId, tenantId, shipment.id, shipment.estimateSnapshotId, shipment.estimateServiceId, declaredValueIdr, shippingAmountIdr, serviceFeeIdr, vatAmountIdr, providerCodAmountIdr, estimateAt],
      );
    }

    if (shipment.status === "ESTIMATED") continue;

    const batchStatus = shipment.status === "SUBMISSION_QUEUED"
      ? "SUBMISSION_QUEUED"
      : shipment.status === "SUBMISSION_UNKNOWN"
        ? "SUBMISSION_UNKNOWN"
        : shipment.status === "FAILED"
          ? "FAILED"
          : "COMPLETED";
    const attemptedAt = batchStatus === "SUBMISSION_QUEUED" ? null : new Date(createdAt.getTime() + 60 * 60_000);
    const completedAt = ["COMPLETED", "FAILED"].includes(batchStatus) ? resolvedAt : null;
    const batchSafeErrorCode = shipment.status === "SUBMISSION_UNKNOWN"
      ? "PROVIDER_TIMEOUT"
      : shipment.status === "FAILED"
        ? "PROVIDER_REJECTED"
        : null;
    await client.query(
      `INSERT INTO provider_batches (
         id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
         provider_account_key, idempotency_key, status, safe_error_code,
         submission_attempted_at, completed_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 'local-pickup', $4, 'platform_default', $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         outlet_id = EXCLUDED.outlet_id,
         pickup_address_id = EXCLUDED.pickup_address_id,
         courier = EXCLUDED.courier,
         credential_source = EXCLUDED.credential_source,
         provider_account_key = EXCLUDED.provider_account_key,
         idempotency_key = EXCLUDED.idempotency_key,
         status = EXCLUDED.status,
         safe_error_code = EXCLUDED.safe_error_code,
         submission_attempted_at = EXCLUDED.submission_attempted_at,
         completed_at = EXCLUDED.completed_at,
         updated_at = EXCLUDED.updated_at`,
      [shipment.batchId, tenantId, outletId, courier, sha256("local-demo-provider-account"), sha256(`local-demo:${shipment.id}`), batchStatus, batchSafeErrorCode, attemptedAt, completedAt, createdAt, updatedAt],
    );
    const returned = RETURN_LIFECYCLE_STATUSES.has(shipment.status);
    const providerSnapshotStatus = returned ? "ISSUED" : shipment.status;
    const safeResponseCode = returned || shipment.status === "ISSUED" || shipment.status === "AWAITING_UPSTREAM_PAYMENT"
      ? "ORDER_ACCEPTED"
      : shipment.status === "SUBMISSION_UNKNOWN"
        ? "PROVIDER_TIMEOUT"
        : shipment.status === "FAILED"
          ? "PROVIDER_REJECTED"
          : null;
    const providerOrderId = shipment.status === "ISSUED"
      ? shipment.index === 12 ? "SANITIZED-ORDER-0001" : "SANITIZED-ORDER-0002"
      : returned
        ? `SANITIZED-ORDER-RETURN-${shipment.index + 1}`
        : shipment.status === "AWAITING_UPSTREAM_PAYMENT"
          ? `SANITIZED-ORDER-UNPAID-${shipment.index + 1}`
          : null;
    await client.query(
      `INSERT INTO provider_order_snapshots (
         id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
         estimate_service_id, position, provider_service,
         destination_area_id, destination_area_label, currency,
         shipping_amount_idr, insurance_amount_idr, is_cod,
         provider_cod_amount_idr, status, provider_order_id, is_paid,
         cnote_no, safe_response_code, resolved_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, 'IDR', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         batch_id = EXCLUDED.batch_id,
         shipment_id = EXCLUDED.shipment_id,
         estimate_snapshot_id = EXCLUDED.estimate_snapshot_id,
         estimate_service_id = EXCLUDED.estimate_service_id,
         provider_service = EXCLUDED.provider_service,
         destination_area_id = EXCLUDED.destination_area_id,
         destination_area_label = EXCLUDED.destination_area_label,
         shipping_amount_idr = EXCLUDED.shipping_amount_idr,
         insurance_amount_idr = EXCLUDED.insurance_amount_idr,
         is_cod = EXCLUDED.is_cod,
         provider_cod_amount_idr = EXCLUDED.provider_cod_amount_idr,
         status = EXCLUDED.status,
         provider_order_id = EXCLUDED.provider_order_id,
         is_paid = EXCLUDED.is_paid,
         cnote_no = EXCLUDED.cnote_no,
         safe_response_code = EXCLUDED.safe_response_code,
         resolved_at = EXCLUDED.resolved_at`,
      [
        shipment.providerOrderSnapshotId, tenantId, shipment.batchId, shipment.id,
        shipment.estimateSnapshotId, shipment.estimateServiceId, providerService,
        destinationAreaId, destinationAreaLabel,
        shippingAmountIdr, insuranceAmountIdr, shipment.isCod, providerCodAmountIdr,
        providerSnapshotStatus, providerOrderId,
        shipment.status === "ISSUED" || returned ? true : shipment.status === "AWAITING_UPSTREAM_PAYMENT" ? false : null,
        shipment.cnoteNo ?? null, safeResponseCode, resolvedAt, createdAt,
      ],
    );
  }

  let ledgerIndex = 1;
  const insertLedgerEntry = async ({
    shipment,
    entryType,
    financialClass,
    amountIdr,
  }) => {
    await client.query(
      `INSERT INTO ledger_entries (
         id, tenant_id, outlet_id, shipment_id, provider_batch_id,
         provider_order_snapshot_id, reconciliation_run_id, entry_type,
         financial_class, amount_idr, currency, effective_at, source_event,
         source_event_id, actor_type, actor_user_id, reverses_entry_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, 'IDR', $10,
         'PROVIDER_ORDER_ISSUED', $11, 'USER', $12, NULL, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        fixedUuid("7a", ledgerIndex++), tenantId, outletId, shipment.id,
        shipment.batchId, shipment.providerOrderSnapshotId, entryType,
        financialClass, amountIdr,
        new Date(at(shipment.daysAgo, 8 + shipment.index % 7, (shipment.index * 7) % 60).getTime() + 2 * 3_600_000),
        shipment.providerOrderSnapshotId, adminUserId,
      ],
    );
  };

  // A return was issued before it came back, so it carries the same issuance
  // ledger entries. Keeping these out would leave a provider-accepted COD
  // shipment with no COD_PRINCIPAL_COLLECTABLE entry, which no real state
  // transition can produce.
  const ledgerBearingShipments = shipmentDefinitions.filter(
    ({ status }) => status === "ISSUED" || RETURN_LIFECYCLE_STATUSES.has(status),
  );
  for (const shipment of ledgerBearingShipments) {
    const declaredValueIdr = shipment.isCod ? 125_000 + shipment.index * 25_000 : 90_000 + shipment.index * 20_000;
    const shippingAmountIdr = 12_000 + (shipment.index % 5) * 2_500;
    const insuranceAmountIdr = shipment.index % 3 === 0 ? 2_000 : null;
    if (shipment.isCod) {
      const serviceFeeIdr = Math.floor(((declaredValueIdr + shippingAmountIdr) * 3 + 50) / 100);
      const vatAmountIdr = Math.floor((serviceFeeIdr * 11 + 50) / 100);
      await insertLedgerEntry({ shipment, entryType: "COD_PRINCIPAL_COLLECTABLE", financialClass: "LIABILITY", amountIdr: declaredValueIdr });
      await insertLedgerEntry({ shipment, entryType: "GERAICUAN_COD_SERVICE_FEE_REVENUE", financialClass: "REVENUE", amountIdr: serviceFeeIdr });
      await insertLedgerEntry({ shipment, entryType: "COD_SERVICE_FEE_VAT_PAYABLE", financialClass: "LIABILITY", amountIdr: vatAmountIdr });
    }
    await insertLedgerEntry({ shipment, entryType: "MENGANTAR_SHIPPING_COST", financialClass: "EXPENSE", amountIdr: shippingAmountIdr });
    if (insuranceAmountIdr !== null) {
      await insertLedgerEntry({ shipment, entryType: "MENGANTAR_INSURANCE_COST", financialClass: "EXPENSE", amountIdr: insuranceAmountIdr });
    }

    if (shipment.status === "ISSUED") {
      await client.query(
        `INSERT INTO print_events (
           id, tenant_id, shipment_id, provider_order_snapshot_id, sequence,
           outcome, reason_code, awb_snapshot, actor_user_id, actor_role, printed_at
         ) VALUES ($1, $2, $3, $4, 1, 'PRINTED', NULL, $5, $6, 'TENANT_ADMIN', $7)
         ON CONFLICT (id) DO NOTHING`,
        [fixedUuid("78", shipment.index + 1), tenantId, shipment.id, shipment.providerOrderSnapshotId, shipment.cnoteNo, adminUserId, at(shipment.daysAgo, 17)],
      );
    }
  }

  // Return-lifecycle evidence. Each returned shipment gets a queued event, and
  // the ones that moved further get a later one, so the RTS list has a latest
  // note to render and more than one event on a single shipment to prove the
  // list stays one row per shipment.
  const returnedShipments = shipmentDefinitions.filter(
    ({ status }) => RETURN_LIFECYCLE_STATUSES.has(status),
  );
  // Re-seeding must be deterministic: without this, a later run that inserts
  // fewer events still passes its own count check because the previous run's
  // rows are still there.
  await client.query(
    `DELETE FROM shipment_rts_events
     WHERE tenant_id = $1 AND shipment_id = ANY($2::uuid[])`,
    [tenantId, shipmentDefinitions.map(({ id }) => id)],
  );
  let rtsEventIndex = 1;
  const insertRtsEvent = async (shipment, status, notes, hoursAfterCreation) => {
    await client.query(
      `INSERT INTO shipment_rts_events (id, tenant_id, shipment_id, status, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         created_at = EXCLUDED.created_at`,
      [
        fixedUuid("7e", rtsEventIndex++),
        tenantId,
        shipment.id,
        status,
        notes,
        new Date(at(shipment.daysAgo, 9).getTime() + hoursAfterCreation * 3_600_000),
      ],
    );
  };
  for (const shipment of returnedShipments) {
    if (shipment.status === "PROBLEM") {
      // shipment_rts_events has no PROBLEM status, and a delivery problem is
      // not yet a return. Leaving it eventless is the honest fixture and is
      // also the only row that exercises the no-notes fallback in the list.
      continue;
    }
    await insertRtsEvent(
      shipment,
      "RTS_QUEUED",
      "Penerima tidak dapat dihubungi setelah tiga percobaan antar; paket dijadwalkan kembali ke outlet asal.",
      1,
    );
    if (shipment.status === "RTS_IN_TRANSIT" || shipment.status === "RTS_RECEIVED") {
      await insertRtsEvent(
        shipment,
        "RTS_IN_TRANSIT",
        "Paket retur sudah dijemput kurir dan sedang dalam perjalanan ke outlet asal.",
        5,
      );
    }
    if (shipment.status === "RTS_RECEIVED") {
      await insertRtsEvent(
        shipment,
        "RTS_RECEIVED",
        "Barang retur diterima dan diverifikasi fisik di outlet asal.",
        11,
      );
    }
  }

  const codPrincipalTotal = ledgerBearingShipments
    .filter(({ isCod }) => isCod)
    .reduce((total, shipment) => total + 125_000 + shipment.index * 25_000, 0);
  const shippingLedgerTotal = ledgerBearingShipments
    .reduce((total, shipment) => total + 12_000 + (shipment.index % 5) * 2_500, 0);
  const reconciliationDefinitions = [
    {
      id: fixedUuid("79", 1),
      entryId: fixedUuid("7b", 1),
      entryType: "COD_PRINCIPAL_COLLECTABLE",
      sourceEventId: "local-demo-reconciliation:cod-principal",
      sourceTotalIdr: codPrincipalTotal,
      ledgerTotalIdr: codPrincipalTotal,
      varianceIdr: 0,
      status: "MATCHED",
      createdAt: at(0, 16),
    },
    {
      id: fixedUuid("79", 2),
      entryId: fixedUuid("7b", 2),
      entryType: "MENGANTAR_SHIPPING_COST",
      sourceEventId: "local-demo-reconciliation:shipping",
      sourceTotalIdr: shippingLedgerTotal + 1_500,
      ledgerTotalIdr: shippingLedgerTotal,
      varianceIdr: 1_500,
      status: "VARIANCE",
      createdAt: at(0, 17),
    },
  ];
  for (const reconciliation of reconciliationDefinitions) {
    await client.query(
      `INSERT INTO reconciliation_runs (
         id, tenant_id, outlet_id, cadence, reconciled_entry_type,
         period_start, period_end, currency, source_total_idr, ledger_total_idr,
         variance_idr, status, source_event_id, actor_user_id, created_at
       ) VALUES ($1, $2, $3, 'MONTHLY', $4, $5, $6, 'IDR', $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [
        reconciliation.id, tenantId, outletId, reconciliation.entryType,
        at(30, 0), new Date(anchor.getTime() + 86_400_000),
        reconciliation.sourceTotalIdr, reconciliation.ledgerTotalIdr,
        reconciliation.varianceIdr, reconciliation.status,
        reconciliation.sourceEventId, adminUserId, reconciliation.createdAt,
      ],
    );
    await client.query(
      `INSERT INTO ledger_entries (
         id, tenant_id, outlet_id, shipment_id, provider_batch_id,
         provider_order_snapshot_id, reconciliation_run_id, entry_type,
         financial_class, amount_idr, currency, effective_at, source_event,
         source_event_id, actor_type, actor_user_id, reverses_entry_id, created_at
       ) VALUES ($1, $2, $3, NULL, NULL, NULL, $4, 'RECONCILIATION', 'MEMO', $5,
         'IDR', $6, 'RECONCILIATION_CLOSED', $7, 'USER', $8, NULL, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        reconciliation.entryId, tenantId, outletId, reconciliation.id,
        reconciliation.varianceIdr, new Date(anchor.getTime() + 86_400_000),
        reconciliation.sourceEventId, adminUserId, reconciliation.createdAt,
      ],
    );
  }

  // reconciliation_runs is immutable by trigger, so a database seeded before
  // the reconciled population changed keeps totals that silently disagree with
  // the ledger. Fail loudly with the recovery step instead.
  for (const reconciliation of reconciliationDefinitions) {
    const { rows: persisted } = await client.query(
      `SELECT source_total_idr, ledger_total_idr, variance_idr, status
       FROM reconciliation_runs WHERE id = $1`,
      [reconciliation.id],
    );
    const row = persisted[0];
    if (
      row
      && (Number(row.source_total_idr) !== reconciliation.sourceTotalIdr
        || Number(row.ledger_total_idr) !== reconciliation.ledgerTotalIdr
        || Number(row.variance_idr) !== reconciliation.varianceIdr
        || row.status !== reconciliation.status)
    ) {
      throw new Error(
        `Stale reconciliation run ${reconciliation.id}: the database holds `
        + `${row.status} ${row.source_total_idr}/${row.ledger_total_idr} but this seed computes `
        + `${reconciliation.status} ${reconciliation.sourceTotalIdr}/${reconciliation.ledgerTotalIdr}. `
        + "reconciliation_runs is immutable by trigger, so recreate the local database "
        + "(docker compose down -v, docker compose up -d db, pnpm db:migrate) before re-seeding.",
      );
    }
  }

  const counts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM memberships WHERE tenant_id = $1 AND status = 'ACTIVE') AS memberships,
       (SELECT count(*)::int FROM contacts WHERE tenant_id = $1 AND archived_at IS NULL) AS contacts,
       (SELECT count(*)::int FROM contacts WHERE tenant_id = $1 AND archived_at IS NOT NULL) AS archived_contacts,
       (SELECT count(*)::int FROM contacts WHERE tenant_id = $1 AND id = ANY($2::uuid[])) AS seed_contacts,
       (SELECT count(*)::int FROM contact_addresses WHERE tenant_id = $1 AND archived_at IS NULL) AS contact_addresses,
       (SELECT count(*)::int FROM shipments WHERE tenant_id = $1) AS shipments,
       (SELECT count(*)::int FROM shipments WHERE tenant_id = $1 AND id = ANY($3::uuid[])) AS seed_shipments,
       (SELECT jsonb_object_agg(status, total ORDER BY status) FROM (
          SELECT status, count(*)::int AS total FROM shipments
          WHERE tenant_id = $1 AND id = ANY($3::uuid[]) GROUP BY status
        ) statuses) AS shipment_statuses,
       (SELECT count(*)::int FROM shipment_rts_events WHERE tenant_id = $1) AS rts_events,
       (SELECT coalesce(sum(cogs_amount_idr), 0)::int FROM shipments
          WHERE tenant_id = $1 AND id = ANY($3::uuid[])) AS cogs_total_idr,
       (SELECT count(*)::int FROM shipment_estimate_snapshots WHERE tenant_id = $1) AS estimate_snapshots,
       (SELECT count(*)::int FROM shipment_estimate_services WHERE tenant_id = $1) AS estimate_services,
       (SELECT count(*)::int FROM shipment_cod_totals WHERE tenant_id = $1) AS cod_totals,
       (SELECT count(*)::int FROM provider_batches WHERE tenant_id = $1) AS provider_batches,
       (SELECT count(*)::int FROM provider_order_snapshots WHERE tenant_id = $1) AS provider_orders,
       (SELECT count(*)::int FROM ledger_entries WHERE tenant_id = $1) AS ledger_entries,
       (SELECT count(*)::int FROM reconciliation_runs WHERE tenant_id = $1) AS reconciliation_runs,
       (SELECT count(*)::int FROM print_events WHERE tenant_id = $1) AS print_events`,
    [tenantId, [...contacts.map(({ id }) => id), archivedContact.id], shipmentDefinitions.map(({ id }) => id)],
  );
  seedSummary = counts.rows[0];
  const expectedStatuses = {
    AWAITING_UPSTREAM_PAYMENT: 2,
    DRAFT: 3,
    ESTIMATED: 4,
    FAILED: 2,
    ISSUED: 2,
    PROBLEM: 1,
    RTS_IN_TRANSIT: 2,
    RTS_QUEUED: 3,
    RTS_RECEIVED: 1,
    SUBMISSION_QUEUED: 2,
    SUBMISSION_UNKNOWN: 3,
  };
  const expectedCogsTotalIdr = shipmentDefinitions.reduce(
    (total, { cogsAmountIdr }) => total + (cogsAmountIdr ?? 0),
    0,
  );
  const expectedRtsEvents = returnedShipments.reduce(
    (total, { status }) =>
      status === "PROBLEM"
        ? total
        : total
          + 1
          + (status === "RTS_IN_TRANSIT" || status === "RTS_RECEIVED" ? 1 : 0)
          + (status === "RTS_RECEIVED" ? 1 : 0),
    0,
  );
  if (
    seedSummary.seed_contacts !== contacts.length + 1
    || seedSummary.archived_contacts < 1
    || seedSummary.seed_shipments !== shipmentDefinitions.length
    || Object.keys(seedSummary.shipment_statuses ?? {}).length !== Object.keys(expectedStatuses).length
    || Object.entries(expectedStatuses).some(
      ([status, total]) => seedSummary.shipment_statuses?.[status] !== total,
    )
    || seedSummary.rts_events !== expectedRtsEvents
    || seedSummary.cogs_total_idr !== expectedCogsTotalIdr
  ) {
    throw new Error("Local demo seed verification failed; transaction was not committed.");
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

console.log("Seeded local demo data without provider calls:", seedSummary);
