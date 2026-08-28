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
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatuses = [
  "PROVISIONING",
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
] as const;
export const identityStatuses = ["ACTIVE", "SUSPENDED"] as const;


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
    unique("memberships_tenant_user_key").on(table.tenantId, table.userId),
    index("memberships_user_tenant_idx").on(table.userId, table.tenantId),
    check(
      "memberships_role_valid",
      sql`role IN ('TENANT_ADMIN', 'OPERATOR')`,
    ),
    check("memberships_status_valid", sql`status IN ('ACTIVE', 'SUSPENDED')`),
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
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
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
    check("audit_events_target_type_valid", sql`target_type = 'TENANT'`),
    check(
      "audit_events_action_valid",
      sql`action IN ('TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED')`,
    ),
    check("audit_events_outcome_valid", sql`outcome IN ('SUCCESS', 'DENIED')`),
  ],
);
