import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  integer,
  pgTable,
  text,
  primaryKey,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatuses = [
  "PROVISIONING",
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
] as const;
export const identityStatuses = ["ACTIVE", "SUSPENDED"] as const;

export const auditEventActions = [
  "TENANT_CREATED",
  "TENANT_SUSPENDED",
  "TENANT_REACTIVATED",
  "PLATFORM_MONITORING_VIEWED",
  "MEMBER_INVITED",
  "MEMBER_ROLE_CHANGED",
  "MEMBER_DEACTIVATED",
  "OUTLET_SETTINGS_CHANGED",
  "MENGANTAR_CREDENTIAL_CREATED",
  "MENGANTAR_CREDENTIAL_REPLACED",
  "MENGANTAR_PLATFORM_DEFAULT_RESTORED",
] as const;
export const auditEventTargetTypes = [
  "TENANT",
  "PLATFORM",
  "MEMBERSHIP",
  "OUTLET",
] as const;


export const membershipRoles = ["TENANT_ADMIN", "OPERATOR"] as const;

export const shipmentStatuses = [
  "DRAFT",
  "ESTIMATED",
  "SUBMISSION_QUEUED",
  "SUBMISSION_UNKNOWN",
  "ISSUED",
  "AWAITING_UPSTREAM_PAYMENT",
  "FAILED",
] as const;

export const shipmentPartyRoles = ["SENDER", "RECIPIENT"] as const;

export const shipmentRateLimitOperations = [
  "estimate",
  "order-submit",
  "bulk-import",
] as const;

export const estimateCredentialSources = ["private", "platform_default"] as const;

export const providerBatchStatuses = [
  "SUBMISSION_QUEUED",
  "SUBMITTING",
  "SUBMISSION_UNKNOWN",
  "COMPLETED",
  "FAILED",
] as const;

export const providerOrderStatuses = [
  "SUBMISSION_QUEUED",
  "SUBMISSION_UNKNOWN",
  "ISSUED",
  "AWAITING_UPSTREAM_PAYMENT",
  "FAILED",
] as const;

export const providerUnpaidRecoveryStatuses = [
  "PAYMENT_QUEUED",
  "PAYING",
  "PAYMENT_UNKNOWN",
  "COMPLETED",
] as const;

export const ledgerEntryTypes = [
  "COD_PRINCIPAL_COLLECTABLE",
  "MENGANTAR_SHIPPING_COST",
  "MENGANTAR_INSURANCE_COST",
  "GERAICUAN_COD_SERVICE_FEE_REVENUE",
  "COD_SERVICE_FEE_VAT_PAYABLE",
  "NON_COD_UPSTREAM_PAYMENT",
  "COD_REMITTANCE",
  "ADJUSTMENT",
  "RECONCILIATION",
] as const;

export const ledgerFinancialClasses = [
  "LIABILITY",
  "EXPENSE",
  "REVENUE",
  "MEMO",
] as const;

export const ledgerSourceEvents = [
  "PROVIDER_ORDER_ISSUED",
  "UNPAID_RECOVERY_COMPLETED",
  "COD_REMITTANCE_CONFIRMED",
  "MANUAL_ADJUSTMENT",
  "RECONCILIATION_CLOSED",
] as const;

export const ledgerActorTypes = ["USER", "SYSTEM"] as const;
export const reconciliationCadences = ["DAILY", "MONTHLY"] as const;
export const reconciliationStatuses = ["MATCHED", "VARIANCE"] as const;

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  status: text("status", { enum: identityStatuses }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("accounts_issuer_account_id_unique").on(table.issuer, table.accountId),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    status: text("status", { enum: tenantStatuses }).notNull().default("PROVISIONING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    check("tenants_name_not_blank", sql`char_length(btrim(name)) > 0`),
    check(
      "tenants_status_valid",
      sql`status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')`,
    ),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role", { enum: membershipRoles }).notNull(),
    status: text("status", { enum: identityStatuses }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("memberships_user_key").on(table.userId),
    unique("memberships_tenant_user_key").on(table.tenantId, table.userId),
    index("memberships_user_tenant_idx").on(table.userId, table.tenantId),
    check(
      "memberships_role_valid",
      sql`role IN ('TENANT_ADMIN', 'OPERATOR')`,
    ),
    check("memberships_status_valid", sql`status IN ('ACTIVE', 'SUSPENDED')`),
  ],
);

export const shipmentRateLimits = pgTable(
  "shipment_rate_limits",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    operation: text("operation", { enum: shipmentRateLimitOperations }).notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "shipment_rate_limits_tenant_actor_operation_pk",
      columns: [table.tenantId, table.actorId, table.operation],
    }),
    check(
      "shipment_rate_limits_operation_valid",
      sql`operation IN ('estimate', 'order-submit', 'bulk-import')`,
    ),
    check("shipment_rate_limits_count_positive", sql`count > 0`),
  ],
);
export const outlets = pgTable(
  "outlets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    defaultPickupAddressId: text("default_pickup_address_id"),
    defaultPickupAddressLabel: text("default_pickup_address_label"),
    defaultOriginAreaId: text("default_origin_area_id"),
    defaultOriginAreaLabel: text("default_origin_area_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("outlets_id_tenant_key").on(table.id, table.tenantId),
    index("outlets_tenant_idx").on(table.tenantId),
    check("outlets_name_not_blank", sql`char_length(btrim(name)) > 0`),
    check(
      "outlets_pickup_label_not_blank",
      sql`default_pickup_address_label IS NULL OR char_length(btrim(default_pickup_address_label)) > 0`,
    ),
    check(
      "outlets_origin_label_not_blank",
      sql`default_origin_area_label IS NULL OR char_length(btrim(default_origin_area_label)) > 0`,
    ),
    check(
      "outlets_location_labels_complete",
      sql`(default_pickup_address_label IS NULL) = (default_origin_area_label IS NULL)`,
    ),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    isRecipient: boolean("is_recipient").notNull().default(true),
    isSender: boolean("is_sender").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("contacts_id_tenant_key").on(table.id, table.tenantId),
    index("contacts_tenant_archived_name_idx").on(table.tenantId, table.archivedAt, table.name),
    check("contacts_name_not_blank", sql`char_length(btrim(name)) > 0`),
    check("contacts_phone_not_blank", sql`char_length(btrim(phone)) > 0`),
    check("contacts_has_role", sql`is_sender OR is_recipient`),
  ],
);

export const contactAddresses = pgTable(
  "contact_addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    label: text("label").notNull(),
    address: text("address").notNull(),
    destinationAreaId: text("destination_area_id"),
    destinationAreaLabel: text("destination_area_label"),
    isPrimary: boolean("is_primary").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "contact_addresses_contact_tenant_fkey",
      columns: [table.contactId, table.tenantId],
      foreignColumns: [contacts.id, contacts.tenantId],
    }).onDelete("restrict"),
    index("contact_addresses_tenant_contact_idx").on(table.tenantId, table.contactId),
    unique("contact_addresses_contact_label_key").on(table.contactId, table.label),
    check("contact_addresses_label_not_blank", sql`char_length(btrim(label)) > 0`),
    check("contact_addresses_address_not_blank", sql`char_length(btrim(address)) > 0`),
    check(
      "contact_addresses_area_pair",
      sql`(destination_area_id IS NULL AND destination_area_label IS NULL)
        OR (
          char_length(btrim(destination_area_id)) BETWEEN 1 AND 160
          AND char_length(btrim(destination_area_label)) BETWEEN 1 AND 160
        )`,
    ),
  ],
);

export const mengantarConnections = pgTable(
  "mengantar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "restrict" })
      .unique(),
    secretReference: text("secret_reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("mengantar_connections_outlet_tenant_key").on(table.outletId, table.tenantId),
    check("mengantar_connections_secret_reference_not_blank", sql`char_length(btrim(secret_reference)) > 0`),
  ],
);

export const managedSecretPayloads = pgTable(
  "managed_secret_payloads",
  {
    reference: text("reference").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id").notNull(),
    purpose: text("purpose", { enum: ["MENGANTAR_API_KEY"] })
      .notNull()
      .default("MENGANTAR_API_KEY"),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    authenticationTag: text("authentication_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "managed_secret_payloads_outlet_tenant_fkey",
      columns: [table.outletId, table.tenantId],
      foreignColumns: [outlets.id, outlets.tenantId],
    }).onDelete("restrict"),
    unique("managed_secret_payloads_outlet_purpose_key").on(
      table.tenantId,
      table.outletId,
      table.purpose,
    ),
    check(
      "managed_secret_payloads_purpose_valid",
      sql`purpose = 'MENGANTAR_API_KEY'`,
    ),
    check(
      "managed_secret_payloads_envelope_not_blank",
      sql`char_length(btrim(reference)) > 0
        AND char_length(btrim(ciphertext)) > 0
        AND char_length(btrim(nonce)) > 0
        AND char_length(btrim(authentication_tag)) > 0`,
    ),
    check("managed_secret_payloads_key_version_valid", sql`key_version = 1`),
  ],
);

export const mengantarCredentialRateLimits = pgTable(
  "mengantar_credential_rate_limits",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "mengantar_credential_rate_limits_tenant_outlet_actor_pk",
      columns: [table.tenantId, table.outletId, table.actorId],
    }),
    foreignKey({
      name: "mengantar_credential_rate_limits_outlet_tenant_fkey",
      columns: [table.outletId, table.tenantId],
      foreignColumns: [outlets.id, outlets.tenantId],
    }).onDelete("restrict"),
    check("mengantar_credential_rate_limits_count_positive", sql`count > 0`),
  ],
);
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    status: text("status", { enum: shipmentStatuses }).notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "shipments_outlet_tenant_fkey",
      columns: [table.outletId, table.tenantId],
      foreignColumns: [outlets.id, outlets.tenantId],
    }).onDelete("restrict"),
    unique("shipments_id_tenant_key").on(table.id, table.tenantId),
    unique("shipments_id_outlet_tenant_key").on(
      table.id,
      table.outletId,
      table.tenantId,
    ),
    index("shipments_tenant_outlet_idx").on(table.tenantId, table.outletId),
    check(
      "shipments_status_valid",
      sql`status IN (
        'DRAFT',
        'ESTIMATED',
        'SUBMISSION_QUEUED',
        'SUBMISSION_UNKNOWN',
        'ISSUED',
        'AWAITING_UPSTREAM_PAYMENT',
        'FAILED'
      )`,
    ),
  ],
);

export const shipmentDrafts = pgTable(
  "shipment_drafts",
  {
    shipmentId: uuid("shipment_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    destinationAreaId: text("destination_area_id").notNull(),
    destinationAreaLabel: text("destination_area_label").notNull(),
    packageContent: text("package_content").notNull(),
    packageWeightGrams: integer("package_weight_grams").notNull(),
    packageQuantity: integer("package_quantity").notNull(),
    packageLengthCm: integer("package_length_cm"),
    packageWidthCm: integer("package_width_cm"),
    packageHeightCm: integer("package_height_cm"),
    declaredValueIdr: integer("declared_value_idr").notNull(),
    isCod: boolean("is_cod").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "shipment_drafts_shipment_tenant_fkey",
      columns: [table.shipmentId, table.tenantId],
      foreignColumns: [shipments.id, shipments.tenantId],
    }).onDelete("restrict"),
    index("shipment_drafts_tenant_idx").on(table.tenantId),
    check(
      "shipment_drafts_destination_area_id_valid",
      sql`char_length(btrim(destination_area_id)) BETWEEN 1 AND 160`,
    ),
    check(
      "shipment_drafts_destination_area_label_not_blank",
      sql`char_length(btrim(destination_area_label)) > 0`,
    ),
    check(
      "shipment_drafts_package_content_not_blank",
      sql`char_length(btrim(package_content)) > 0`,
    ),
    check(
      "shipment_drafts_package_weight_grams_positive",
      sql`package_weight_grams > 0`,
    ),
    check("shipment_drafts_package_quantity_positive", sql`package_quantity > 0`),
    check(
      "shipment_drafts_package_dimensions_valid",
      sql`(package_length_cm IS NULL AND package_width_cm IS NULL AND package_height_cm IS NULL)
        OR (package_length_cm > 0 AND package_width_cm > 0 AND package_height_cm > 0)`,
    ),
    check(
      "shipment_drafts_declared_value_idr_nonnegative",
      sql`declared_value_idr >= 0`,
    ),
    check(
      "shipment_drafts_cod_declared_value_positive",
      sql`NOT is_cod OR declared_value_idr > 0`,
    ),
  ],
);

export const shipmentEstimateSnapshots = pgTable(
  "shipment_estimate_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    originAreaId: text("origin_area_id").notNull(),
    destinationAreaId: text("destination_area_id").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    isCodRequested: boolean("is_cod_requested").notNull(),
    credentialSource: text("credential_source", {
      enum: estimateCredentialSources,
    }).notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "shipment_estimate_snapshots_shipment_tenant_fkey",
      columns: [table.shipmentId, table.tenantId],
      foreignColumns: [shipments.id, shipments.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "shipment_estimate_snapshots_outlet_tenant_fkey",
      columns: [table.outletId, table.tenantId],
      foreignColumns: [outlets.id, outlets.tenantId],
    }).onDelete("restrict"),
    unique("shipment_estimate_snapshots_id_tenant_key").on(table.id, table.tenantId),
    unique("shipment_estimate_snapshots_id_shipment_tenant_key").on(
      table.id,
      table.shipmentId,
      table.tenantId,
    ),
    index("shipment_estimate_snapshots_tenant_shipment_retrieved_idx").on(
      table.tenantId,
      table.shipmentId,
      table.retrievedAt,
    ),
    check(
      "shipment_estimate_snapshots_origin_area_id_valid",
      sql`char_length(btrim(origin_area_id)) BETWEEN 1 AND 160`,
    ),
    check(
      "shipment_estimate_snapshots_destination_area_id_valid",
      sql`char_length(btrim(destination_area_id)) BETWEEN 1 AND 160`,
    ),
    check(
      "shipment_estimate_snapshots_weight_grams_positive",
      sql`weight_grams > 0`,
    ),
    check(
      "shipment_estimate_snapshots_credential_source_valid",
      sql`credential_source IN ('private', 'platform_default')`,
    ),
  ],
);

export const shipmentEstimateServices = pgTable(
  "shipment_estimate_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    providerService: text("provider_service").notNull(),
    currency: text("currency", { enum: ["IDR"] }).notNull(),
    shippingAmountIdr: integer("shipping_amount_idr").notNull(),
    shippingSourceField: text("shipping_source_field", {
      enum: ["price"],
    }).notNull(),
    insuranceAmountIdr: integer("insurance_amount_idr"),
    insuranceSourceField: text("insurance_source_field"),
    deliveryEstimate: text("delivery_estimate").notNull(),
    codEligible: boolean("cod_eligible").notNull(),
  },
  (table) => [
    foreignKey({
      name: "shipment_estimate_services_snapshot_tenant_fkey",
      columns: [table.snapshotId, table.tenantId],
      foreignColumns: [shipmentEstimateSnapshots.id, shipmentEstimateSnapshots.tenantId],
    }).onDelete("restrict"),
    unique("shipment_estimate_services_snapshot_provider_key").on(
      table.snapshotId,
      table.providerService,
    ),
    unique("shipment_estimate_services_id_snapshot_tenant_key").on(
      table.id,
      table.snapshotId,
      table.tenantId,
    ),
    index("shipment_estimate_services_tenant_snapshot_idx").on(
      table.tenantId,
      table.snapshotId,
    ),
    check(
      "shipment_estimate_services_provider_service_valid",
      sql`char_length(btrim(provider_service)) BETWEEN 1 AND 80`,
    ),
    check("shipment_estimate_services_currency_idr", sql`currency = 'IDR'`),
    check(
      "shipment_estimate_services_shipping_amount_idr_nonnegative",
      sql`shipping_amount_idr >= 0`,
    ),
    check(
      "shipment_estimate_services_shipping_source_price",
      sql`shipping_source_field = 'price'`,
    ),
    check(
      "shipment_estimate_services_insurance_pair",
      sql`(insurance_amount_idr IS NULL AND insurance_source_field IS NULL)
        OR (
          insurance_amount_idr >= 0
          AND char_length(btrim(insurance_source_field)) BETWEEN 1 AND 80
        )`,
    ),
    check(
      "shipment_estimate_services_delivery_estimate_valid",
      sql`char_length(btrim(delivery_estimate)) BETWEEN 1 AND 160`,
    ),
  ],
);

export const shipmentCodTotals = pgTable(
  "shipment_cod_totals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    estimateServiceId: uuid("estimate_service_id").notNull(),
    currency: text("currency", { enum: ["IDR"] }).notNull(),
    goodsValueIdr: integer("goods_value_idr").notNull(),
    shippingAmountIdr: integer("shipping_amount_idr").notNull(),
    serviceFeeIdr: integer("service_fee_idr").notNull(),
    vatAmountIdr: integer("vat_amount_idr").notNull(),
    providerCodAmountIdr: integer("provider_cod_amount_idr").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "shipment_cod_totals_shipment_tenant_fkey",
      columns: [table.shipmentId, table.tenantId],
      foreignColumns: [shipments.id, shipments.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "shipment_cod_totals_snapshot_shipment_tenant_fkey",
      columns: [table.snapshotId, table.shipmentId, table.tenantId],
      foreignColumns: [
        shipmentEstimateSnapshots.id,
        shipmentEstimateSnapshots.shipmentId,
        shipmentEstimateSnapshots.tenantId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "shipment_cod_totals_service_snapshot_tenant_fkey",
      columns: [table.estimateServiceId, table.snapshotId, table.tenantId],
      foreignColumns: [
        shipmentEstimateServices.id,
        shipmentEstimateServices.snapshotId,
        shipmentEstimateServices.tenantId,
      ],
    }).onDelete("restrict"),
    unique("shipment_cod_totals_id_tenant_key").on(table.id, table.tenantId),
    unique("shipment_cod_totals_shipment_tenant_key").on(
      table.shipmentId,
      table.tenantId,
    ),
    index("shipment_cod_totals_tenant_snapshot_idx").on(
      table.tenantId,
      table.snapshotId,
    ),
    check("shipment_cod_totals_currency_idr", sql`currency = 'IDR'`),
    check(
      "shipment_cod_totals_goods_value_idr_positive",
      sql`goods_value_idr > 0`,
    ),
    check(
      "shipment_cod_totals_shipping_amount_idr_nonnegative",
      sql`shipping_amount_idr >= 0`,
    ),
    check(
      "shipment_cod_totals_service_fee_idr_nonnegative",
      sql`service_fee_idr >= 0`,
    ),
    check(
      "shipment_cod_totals_vat_amount_idr_nonnegative",
      sql`vat_amount_idr >= 0`,
    ),
    check(
      "shipment_cod_totals_provider_cod_amount_idr_positive",
      sql`provider_cod_amount_idr > 0`,
    ),
    check(
      "shipment_cod_totals_service_fee_exact",
      sql`service_fee_idr::bigint =
        (((goods_value_idr::bigint + shipping_amount_idr::bigint) * 3 + 50) / 100)`,
    ),
    check(
      "shipment_cod_totals_vat_exact",
      sql`vat_amount_idr::bigint = ((service_fee_idr::bigint * 11 + 50) / 100)`,
    ),
    check(
      "shipment_cod_totals_provider_cod_amount_exact",
      sql`provider_cod_amount_idr::bigint =
        goods_value_idr::bigint
        + shipping_amount_idr::bigint
        + service_fee_idr::bigint
        + vat_amount_idr::bigint`,
    ),
  ],
);

export const providerBatches = pgTable(
  "provider_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    pickupAddressId: text("pickup_address_id").notNull(),
    courier: text("courier").notNull(),
    credentialSource: text("credential_source", {
      enum: estimateCredentialSources,
    }).notNull(),
    providerAccountKey: text("provider_account_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: providerBatchStatuses })
      .notNull()
      .default("SUBMISSION_QUEUED"),
    safeErrorCode: text("safe_error_code"),
    submissionAttemptedAt: timestamp("submission_attempted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "provider_batches_outlet_tenant_fkey",
      columns: [table.outletId, table.tenantId],
      foreignColumns: [outlets.id, outlets.tenantId],
    }).onDelete("restrict"),
    unique("provider_batches_id_tenant_key").on(table.id, table.tenantId),
    unique("provider_batches_id_outlet_tenant_key").on(
      table.id,
      table.outletId,
      table.tenantId,
    ),
    unique("provider_batches_tenant_idempotency_key").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("provider_batches_tenant_outlet_created_idx").on(
      table.tenantId,
      table.outletId,
      table.createdAt,
    ),
    index("provider_batches_account_status_created_idx").on(
      table.providerAccountKey,
      table.status,
      table.createdAt,
    ),
    check(
      "provider_batches_pickup_address_id_valid",
      sql`char_length(btrim(pickup_address_id)) BETWEEN 1 AND 160`,
    ),
    check(
      "provider_batches_courier_valid",
      sql`char_length(btrim(courier)) BETWEEN 1 AND 80`,
    ),
    check(
      "provider_batches_credential_source_valid",
      sql`credential_source IN ('private', 'platform_default')`,
    ),
    check(
      "provider_batches_account_key_sha256",
      sql`provider_account_key ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "provider_batches_idempotency_key_sha256",
      sql`idempotency_key ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "provider_batches_status_valid",
      sql`status IN (
        'SUBMISSION_QUEUED',
        'SUBMITTING',
        'SUBMISSION_UNKNOWN',
        'COMPLETED',
        'FAILED'
      )`,
    ),
    check(
      "provider_batches_attempt_state_valid",
      sql`(status = 'SUBMISSION_QUEUED' AND submission_attempted_at IS NULL)
        OR (status <> 'SUBMISSION_QUEUED' AND submission_attempted_at IS NOT NULL)`,
    ),
    check(
      "provider_batches_completion_state_valid",
      sql`(status IN ('COMPLETED', 'FAILED') AND completed_at IS NOT NULL)
        OR (status NOT IN ('COMPLETED', 'FAILED') AND completed_at IS NULL)`,
    ),
    check(
      "provider_batches_safe_error_code_valid",
      sql`safe_error_code IS NULL
        OR char_length(btrim(safe_error_code)) BETWEEN 1 AND 80`,
    ),
  ],
);

export const providerOrderSnapshots = pgTable(
  "provider_order_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    estimateSnapshotId: uuid("estimate_snapshot_id").notNull(),
    estimateServiceId: uuid("estimate_service_id").notNull(),
    position: integer("position").notNull(),
    providerService: text("provider_service").notNull(),
    currency: text("currency", { enum: ["IDR"] }).notNull(),
    shippingAmountIdr: integer("shipping_amount_idr").notNull(),
    insuranceAmountIdr: integer("insurance_amount_idr"),
    isCod: boolean("is_cod").notNull(),
    providerCodAmountIdr: integer("provider_cod_amount_idr"),
    status: text("status", { enum: providerOrderStatuses })
      .notNull()
      .default("SUBMISSION_QUEUED"),
    providerOrderId: text("provider_order_id"),
    isPaid: boolean("is_paid"),
    cnoteNo: text("cnote_no"),
    safeResponseCode: text("safe_response_code"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "provider_order_snapshots_batch_tenant_fkey",
      columns: [table.batchId, table.tenantId],
      foreignColumns: [providerBatches.id, providerBatches.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "provider_order_snapshots_shipment_tenant_fkey",
      columns: [table.shipmentId, table.tenantId],
      foreignColumns: [shipments.id, shipments.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "provider_order_snapshots_estimate_shipment_tenant_fkey",
      columns: [table.estimateSnapshotId, table.shipmentId, table.tenantId],
      foreignColumns: [
        shipmentEstimateSnapshots.id,
        shipmentEstimateSnapshots.shipmentId,
        shipmentEstimateSnapshots.tenantId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "provider_order_snapshots_service_estimate_tenant_fkey",
      columns: [table.estimateServiceId, table.estimateSnapshotId, table.tenantId],
      foreignColumns: [
        shipmentEstimateServices.id,
        shipmentEstimateServices.snapshotId,
        shipmentEstimateServices.tenantId,
      ],
    }).onDelete("restrict"),
    unique("provider_order_snapshots_batch_position_key").on(
      table.batchId,
      table.position,
    ),
    unique("provider_order_snapshots_shipment_key").on(table.shipmentId),
    unique("provider_order_snapshots_id_tenant_key").on(table.id, table.tenantId),
    unique("provider_order_snapshots_id_batch_tenant_key").on(
      table.id,
      table.batchId,
      table.tenantId,
    ),
    index("provider_order_snapshots_tenant_batch_idx").on(
      table.tenantId,
      table.batchId,
    ),
    index("provider_order_snapshots_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    check("provider_order_snapshots_position_nonnegative", sql`position >= 0`),
    check(
      "provider_order_snapshots_provider_service_valid",
      sql`char_length(btrim(provider_service)) BETWEEN 1 AND 80`,
    ),
    check("provider_order_snapshots_currency_idr", sql`currency = 'IDR'`),
    check(
      "provider_order_snapshots_shipping_amount_nonnegative",
      sql`shipping_amount_idr >= 0`,
    ),
    check(
      "provider_order_snapshots_insurance_amount_nonnegative",
      sql`insurance_amount_idr IS NULL OR insurance_amount_idr >= 0`,
    ),
    check(
      "provider_order_snapshots_cod_amount_valid",
      sql`(is_cod AND provider_cod_amount_idr > 0)
        OR (NOT is_cod AND provider_cod_amount_idr IS NULL)`,
    ),
    check(
      "provider_order_snapshots_status_valid",
      sql`status IN (
        'SUBMISSION_QUEUED',
        'SUBMISSION_UNKNOWN',
        'ISSUED',
        'AWAITING_UPSTREAM_PAYMENT',
        'FAILED'
      )`,
    ),
    check(
      "provider_order_snapshots_cnote_authority",
      sql`(status = 'ISSUED' AND char_length(btrim(cnote_no)) > 0)
        OR (status <> 'ISSUED' AND cnote_no IS NULL)`,
    ),
    check(
      "provider_order_snapshots_unpaid_state_valid",
      sql`status <> 'AWAITING_UPSTREAM_PAYMENT'
        OR (NOT is_cod AND is_paid = false AND cnote_no IS NULL)`,
    ),
    check(
      "provider_order_snapshots_resolved_state_valid",
      sql`(status = 'SUBMISSION_QUEUED' AND resolved_at IS NULL)
        OR (status <> 'SUBMISSION_QUEUED' AND resolved_at IS NOT NULL)`,
    ),
    check(
      "provider_order_snapshots_provider_order_id_valid",
      sql`provider_order_id IS NULL
        OR char_length(btrim(provider_order_id)) BETWEEN 1 AND 160`,
    ),
    check(
      "provider_order_snapshots_safe_response_code_valid",
      sql`safe_response_code IS NULL
        OR char_length(btrim(safe_response_code)) BETWEEN 1 AND 80`,
    ),
  ],
);

export const providerUnpaidRecoveries = pgTable(
  "provider_unpaid_recoveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    providerOrderSnapshotId: uuid("provider_order_snapshot_id").notNull(),
    requestedByUserId: text("requested_by_user_id").notNull(),
    status: text("status", { enum: providerUnpaidRecoveryStatuses })
      .notNull()
      .default("PAYMENT_QUEUED"),
    safeResponseCode: text("safe_response_code"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "provider_unpaid_recoveries_order_batch_tenant_fkey",
      columns: [table.providerOrderSnapshotId, table.batchId, table.tenantId],
      foreignColumns: [
        providerOrderSnapshots.id,
        providerOrderSnapshots.batchId,
        providerOrderSnapshots.tenantId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "provider_unpaid_recoveries_requester_tenant_fkey",
      columns: [table.tenantId, table.requestedByUserId],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }).onDelete("restrict"),
    unique("provider_unpaid_recoveries_id_tenant_key").on(table.id, table.tenantId),
    unique("provider_unpaid_recoveries_order_snapshot_key").on(
      table.providerOrderSnapshotId,
    ),
    index("provider_unpaid_recoveries_tenant_batch_status_idx").on(
      table.tenantId,
      table.batchId,
      table.status,
    ),
    check(
      "provider_unpaid_recoveries_status_valid",
      sql`status IN ('PAYMENT_QUEUED', 'PAYING', 'PAYMENT_UNKNOWN', 'COMPLETED')`,
    ),
    check(
      "provider_unpaid_recoveries_attempt_state_valid",
      sql`(status = 'PAYMENT_QUEUED' AND attempted_at IS NULL)
        OR (status <> 'PAYMENT_QUEUED' AND attempted_at IS NOT NULL)`,
    ),
    check(
      "provider_unpaid_recoveries_completion_state_valid",
      sql`(status IN ('PAYMENT_UNKNOWN', 'COMPLETED') AND completed_at IS NOT NULL)
        OR (status NOT IN ('PAYMENT_UNKNOWN', 'COMPLETED') AND completed_at IS NULL)`,
    ),
    check(
      "provider_unpaid_recoveries_response_state_valid",
      sql`(status IN ('PAYMENT_QUEUED', 'PAYING') AND safe_response_code IS NULL)
        OR (
          status = 'PAYMENT_UNKNOWN'
          AND char_length(btrim(safe_response_code)) BETWEEN 1 AND 80
        )
        OR (status = 'COMPLETED' AND safe_response_code = 'PAY_UNPAID_ACCEPTED')`,
    ),
  ],
);

export const printEventOutcomes = ["PRINTED", "BLOCKED"] as const;

export const printEvents = pgTable(
  "print_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    providerOrderSnapshotId: uuid("provider_order_snapshot_id").notNull(),
    sequence: integer("sequence"),
    outcome: text("outcome", { enum: printEventOutcomes }).notNull(),
    reasonCode: text("reason_code"),
    awbSnapshot: text("awb_snapshot"),
    actorUserId: text("actor_user_id").notNull(),
    actorRole: text("actor_role", { enum: membershipRoles }).notNull(),
    printedAt: timestamp("printed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "print_events_shipment_tenant_fkey",
      columns: [table.shipmentId, table.tenantId],
      foreignColumns: [shipments.id, shipments.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "print_events_snapshot_tenant_fkey",
      columns: [table.providerOrderSnapshotId, table.tenantId],
      foreignColumns: [
        providerOrderSnapshots.id,
        providerOrderSnapshots.tenantId,
      ],
    }).onDelete("restrict"),
    unique("print_events_shipment_sequence_key").on(
      table.shipmentId,
      table.sequence,
    ),
    unique("print_events_id_tenant_key").on(table.id, table.tenantId),
    index("print_events_tenant_shipment_idx").on(
      table.tenantId,
      table.shipmentId,
      table.sequence,
    ),
    index("print_events_tenant_printed_idx").on(
      table.tenantId,
      table.printedAt,
    ),
    check(
      "print_events_outcome_valid",
      sql`outcome IN ('PRINTED', 'BLOCKED')`,
    ),
    check(
      "print_events_printed_state_valid",
      sql`(
        outcome = 'PRINTED'
        AND sequence > 0
        AND char_length(btrim(awb_snapshot)) BETWEEN 1 AND 160
        AND reason_code IS NULL
      ) OR (
        outcome = 'BLOCKED'
        AND sequence IS NULL
        AND awb_snapshot IS NULL
        AND char_length(btrim(reason_code)) BETWEEN 1 AND 40
      )`,
    ),
  ],
);

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    cadence: text("cadence", { enum: reconciliationCadences }).notNull(),
    reconciledEntryType: text("reconciled_entry_type", {
      enum: ledgerEntryTypes,
    }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    currency: text("currency", { enum: ["IDR"] }).notNull(),
    sourceTotalIdr: bigint("source_total_idr", { mode: "number" }).notNull(),
    ledgerTotalIdr: bigint("ledger_total_idr", { mode: "number" }).notNull(),
    varianceIdr: bigint("variance_idr", { mode: "number" }).notNull(),
    status: text("status", { enum: reconciliationStatuses }).notNull(),
    sourceEventId: text("source_event_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "reconciliation_runs_outlet_tenant_fkey",
      columns: [table.outletId, table.tenantId],
      foreignColumns: [outlets.id, outlets.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "reconciliation_runs_actor_tenant_fkey",
      columns: [table.tenantId, table.actorUserId],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }).onDelete("restrict"),
    unique("reconciliation_runs_id_tenant_key").on(table.id, table.tenantId),
    unique("reconciliation_runs_tenant_source_event_key").on(
      table.tenantId,
      table.sourceEventId,
    ),
    index("reconciliation_runs_tenant_outlet_period_idx").on(
      table.tenantId,
      table.outletId,
      table.periodStart,
      table.periodEnd,
    ),
    check(
      "reconciliation_runs_cadence_valid",
      sql`cadence IN ('DAILY', 'MONTHLY')`,
    ),
    check(
      "reconciliation_runs_entry_type_valid",
      sql`reconciled_entry_type IN (
        'COD_PRINCIPAL_COLLECTABLE',
        'MENGANTAR_SHIPPING_COST',
        'MENGANTAR_INSURANCE_COST',
        'GERAICUAN_COD_SERVICE_FEE_REVENUE',
        'COD_SERVICE_FEE_VAT_PAYABLE',
        'NON_COD_UPSTREAM_PAYMENT',
        'COD_REMITTANCE'
      )`,
    ),
    check(
      "reconciliation_runs_period_valid",
      sql`period_end > period_start`,
    ),
    check("reconciliation_runs_currency_idr", sql`currency = 'IDR'`),
    check(
      "reconciliation_runs_source_total_nonnegative",
      sql`source_total_idr >= 0`,
    ),
    check(
      "reconciliation_runs_variance_exact",
      sql`variance_idr = source_total_idr - ledger_total_idr`,
    ),
    check(
      "reconciliation_runs_status_valid",
      sql`(variance_idr = 0 AND status = 'MATCHED')
        OR (variance_idr <> 0 AND status = 'VARIANCE')`,
    ),
    check(
      "reconciliation_runs_source_event_id_valid",
      sql`char_length(btrim(source_event_id)) BETWEEN 1 AND 160`,
    ),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    shipmentId: uuid("shipment_id"),
    providerBatchId: uuid("provider_batch_id"),
    providerOrderSnapshotId: uuid("provider_order_snapshot_id"),
    reconciliationRunId: uuid("reconciliation_run_id"),
    entryType: text("entry_type", { enum: ledgerEntryTypes }).notNull(),
    financialClass: text("financial_class", {
      enum: ledgerFinancialClasses,
    }).notNull(),
    amountIdr: bigint("amount_idr", { mode: "number" }).notNull(),
    currency: text("currency", { enum: ["IDR"] }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    sourceEvent: text("source_event", { enum: ledgerSourceEvents }).notNull(),
    sourceEventId: text("source_event_id").notNull(),
    actorType: text("actor_type", { enum: ledgerActorTypes }).notNull(),
    actorUserId: text("actor_user_id"),
    reversesEntryId: uuid("reverses_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "ledger_entries_shipment_outlet_tenant_fkey",
      columns: [table.shipmentId, table.outletId, table.tenantId],
      foreignColumns: [shipments.id, shipments.outletId, shipments.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ledger_entries_batch_outlet_tenant_fkey",
      columns: [table.providerBatchId, table.outletId, table.tenantId],
      foreignColumns: [
        providerBatches.id,
        providerBatches.outletId,
        providerBatches.tenantId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "ledger_entries_order_batch_tenant_fkey",
      columns: [
        table.providerOrderSnapshotId,
        table.providerBatchId,
        table.tenantId,
      ],
      foreignColumns: [
        providerOrderSnapshots.id,
        providerOrderSnapshots.batchId,
        providerOrderSnapshots.tenantId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "ledger_entries_reconciliation_tenant_fkey",
      columns: [table.reconciliationRunId, table.tenantId],
      foreignColumns: [reconciliationRuns.id, reconciliationRuns.tenantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ledger_entries_actor_tenant_fkey",
      columns: [table.tenantId, table.actorUserId],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ledger_entries_reversal_tenant_fkey",
      columns: [table.reversesEntryId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
    }).onDelete("restrict"),
    unique("ledger_entries_id_tenant_key").on(table.id, table.tenantId),
    unique("ledger_entries_source_event_type_key").on(
      table.tenantId,
      table.sourceEvent,
      table.sourceEventId,
      table.entryType,
    ),
    index("ledger_entries_tenant_outlet_effective_idx").on(
      table.tenantId,
      table.outletId,
      table.effectiveAt,
      table.id,
    ),
    index("ledger_entries_tenant_shipment_effective_idx").on(
      table.tenantId,
      table.shipmentId,
      table.effectiveAt,
    ),
    index("ledger_entries_tenant_class_effective_idx").on(
      table.tenantId,
      table.financialClass,
      table.effectiveAt,
    ),
    check(
      "ledger_entries_type_valid",
      sql`entry_type IN (
        'COD_PRINCIPAL_COLLECTABLE',
        'MENGANTAR_SHIPPING_COST',
        'MENGANTAR_INSURANCE_COST',
        'GERAICUAN_COD_SERVICE_FEE_REVENUE',
        'COD_SERVICE_FEE_VAT_PAYABLE',
        'NON_COD_UPSTREAM_PAYMENT',
        'COD_REMITTANCE',
        'ADJUSTMENT',
        'RECONCILIATION'
      )`,
    ),
    check(
      "ledger_entries_financial_class_valid",
      sql`financial_class IN ('LIABILITY', 'EXPENSE', 'REVENUE', 'MEMO')`,
    ),
    check(
      "ledger_entries_type_class_valid",
      sql`(entry_type IN (
          'COD_PRINCIPAL_COLLECTABLE',
          'COD_SERVICE_FEE_VAT_PAYABLE',
          'COD_REMITTANCE'
        ) AND financial_class = 'LIABILITY')
        OR (entry_type IN (
          'MENGANTAR_SHIPPING_COST',
          'MENGANTAR_INSURANCE_COST'
        ) AND financial_class = 'EXPENSE')
        OR (
          entry_type = 'GERAICUAN_COD_SERVICE_FEE_REVENUE'
          AND financial_class = 'REVENUE'
        )
        OR (
          entry_type IN ('NON_COD_UPSTREAM_PAYMENT', 'RECONCILIATION')
          AND financial_class = 'MEMO'
        )
        OR entry_type = 'ADJUSTMENT'`,
    ),
    check(
      "ledger_entries_amount_valid",
      sql`(entry_type IN ('COD_REMITTANCE', 'ADJUSTMENT', 'RECONCILIATION'))
        OR amount_idr >= 0`,
    ),
    check("ledger_entries_currency_idr", sql`currency = 'IDR'`),
    check(
      "ledger_entries_source_event_valid",
      sql`(
          source_event = 'PROVIDER_ORDER_ISSUED'
          AND entry_type IN (
            'COD_PRINCIPAL_COLLECTABLE',
            'MENGANTAR_SHIPPING_COST',
            'MENGANTAR_INSURANCE_COST',
            'GERAICUAN_COD_SERVICE_FEE_REVENUE',
            'COD_SERVICE_FEE_VAT_PAYABLE'
          )
        )
        OR (
          source_event = 'UNPAID_RECOVERY_COMPLETED'
          AND entry_type IN (
            'MENGANTAR_SHIPPING_COST',
            'MENGANTAR_INSURANCE_COST',
            'NON_COD_UPSTREAM_PAYMENT'
          )
        )
        OR (
          source_event = 'COD_REMITTANCE_CONFIRMED'
          AND entry_type = 'COD_REMITTANCE'
        )
        OR (
          source_event = 'MANUAL_ADJUSTMENT'
          AND entry_type = 'ADJUSTMENT'
        )
        OR (
          source_event = 'RECONCILIATION_CLOSED'
          AND entry_type = 'RECONCILIATION'
        )`,
    ),
    check(
      "ledger_entries_source_event_id_valid",
      sql`char_length(btrim(source_event_id)) BETWEEN 1 AND 160`,
    ),
    check(
      "ledger_entries_actor_valid",
      sql`(actor_type = 'USER' AND actor_user_id IS NOT NULL)
        OR (actor_type = 'SYSTEM' AND actor_user_id IS NULL)`,
    ),
    check(
      "ledger_entries_source_link_valid",
      sql`(
          entry_type = 'RECONCILIATION'
          AND reconciliation_run_id IS NOT NULL
          AND shipment_id IS NULL
          AND provider_batch_id IS NULL
          AND provider_order_snapshot_id IS NULL
          AND reverses_entry_id IS NULL
        )
        OR (
          entry_type = 'ADJUSTMENT'
          AND reconciliation_run_id IS NULL
          AND shipment_id IS NOT NULL
          AND provider_batch_id IS NOT NULL
          AND provider_order_snapshot_id IS NOT NULL
          AND reverses_entry_id IS NOT NULL
        )
        OR (
          entry_type NOT IN ('ADJUSTMENT', 'RECONCILIATION')
          AND reconciliation_run_id IS NULL
          AND shipment_id IS NOT NULL
          AND provider_batch_id IS NOT NULL
          AND provider_order_snapshot_id IS NOT NULL
          AND reverses_entry_id IS NULL
        )`,
    ),
  ],
);

export const shipmentParties = pgTable(
  "shipment_parties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    role: text("role", { enum: shipmentPartyRoles }).notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "shipment_parties_shipment_tenant_fkey",
      columns: [table.shipmentId, table.tenantId],
      foreignColumns: [shipments.id, shipments.tenantId],
    }).onDelete("restrict"),
    unique("shipment_parties_shipment_role_key").on(table.shipmentId, table.role),
    index("shipment_parties_tenant_shipment_idx").on(table.tenantId, table.shipmentId),
    check(
      "shipment_parties_role_valid",
      sql`role IN ('SENDER', 'RECIPIENT')`,
    ),
    check("shipment_parties_name_not_blank", sql`char_length(btrim(name)) > 0`),
    check("shipment_parties_phone_not_blank", sql`char_length(btrim(phone)) > 0`),
    check("shipment_parties_address_not_blank", sql`char_length(btrim(address)) > 0`),
  ],
);

export const platformRoles = pgTable(
  "platform_roles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["SUPER_ADMIN"] }).notNull().default("SUPER_ADMIN"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [check("platform_roles_role_valid", sql`role = 'SUPER_ADMIN'`)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role", { enum: ["SUPER_ADMIN", "TENANT_MEMBER"] }),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "restrict",
    }),
    action: text("action", { enum: auditEventActions }).notNull(),
    targetType: text("target_type", { enum: auditEventTargetTypes }).notNull(),
    targetId: text("target_id").notNull(),
    outcome: text("outcome", { enum: ["SUCCESS", "DENIED"] }).notNull(),
    fromStatus: text("from_status", { enum: tenantStatuses }),
    toStatus: text("to_status", { enum: tenantStatuses }),
    correlationId: uuid("correlation_id").defaultRandom().notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_actor_created_idx").on(table.actorId, table.createdAt),
    index("audit_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    uniqueIndex("audit_events_member_attempt_key")
      .on(
        table.tenantId,
        table.actorId,
        table.action,
        sql`(${table.metadata} ->> 'attemptId')`,
      )
      .where(sql`${table.action} IN ('MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_DEACTIVATED') AND ${table.metadata} ? 'attemptId'`),
    uniqueIndex("audit_events_platform_lifecycle_attempt_key")
      .on(
        table.actorId,
        table.action,
        sql`(${table.metadata} ->> 'attemptId')`,
      )
      .where(sql`${table.action} IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED') AND ${table.metadata} ? 'attemptId'`),
    check(
      "audit_events_target_type_valid",
      sql`target_type IN ('TENANT', 'PLATFORM', 'MEMBERSHIP', 'OUTLET')`,
    ),
    check(
      "audit_events_action_valid",
      sql`action IN (
        'TENANT_CREATED',
        'TENANT_SUSPENDED',
        'TENANT_REACTIVATED',
        'PLATFORM_MONITORING_VIEWED',
        'MEMBER_INVITED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_DEACTIVATED',
        'OUTLET_SETTINGS_CHANGED',
        'MENGANTAR_CREDENTIAL_CREATED',
        'MENGANTAR_CREDENTIAL_REPLACED',
        'MENGANTAR_PLATFORM_DEFAULT_RESTORED'
      )`,
    ),
    check("audit_events_outcome_valid", sql`outcome IN ('SUCCESS', 'DENIED')`),
  ],
);
