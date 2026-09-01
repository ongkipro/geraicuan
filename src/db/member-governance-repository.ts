import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import {
  auditEvents,
  memberships,
  membershipRoles,
  users,
} from "@/db/schema";

export type TenantMemberRole = (typeof membershipRoles)[number];

export type TenantMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TenantMemberRole;
  status: "ACTIVE" | "SUSPENDED";
  updatedAt: Date;
};

export type MemberGovernanceReason =
  | "ALREADY_ACTIVE"
  | "ATTEMPT_CONFLICT"
  | "INVITATION_NOT_ALLOWED"
  | "LAST_ACTIVE_ADMIN"
  | "MEMBER_NOT_FOUND"
  | "NO_CHANGE"
  | "NOT_AUTHORIZED"
  | "SELF_CHANGE_NOT_ALLOWED";

export type MemberGovernanceResult =
  | { ok: true; member: TenantMember }
  | { ok: false; reason: MemberGovernanceReason };

type MemberGovernanceAction =
  | "MEMBER_INVITED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_DEACTIVATED";

type GovernedMembership = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TenantMemberRole;
  status: "ACTIVE" | "SUSPENDED";
  updatedAt: Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class MemberGovernanceDeniedError extends Error {
  constructor() {
    super("Tenant member governance is not authorized.");
  }
}

function isMemberRole(value: string): value is TenantMemberRole {
  return membershipRoles.some((role) => role === value);
}

function normalizeEmail(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function memberView(member: GovernedMembership): TenantMember {
  return {
    id: member.id,
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    updatedAt: member.updatedAt,
  };
}

async function appendAudit(
  tx: TenantTransaction,
  context: TenantContext,
  action: MemberGovernanceAction,
  outcome: "SUCCESS" | "DENIED",
  targetId: string,
  details: {
    attemptId: string;
    inputMembershipId?: string;
    reason?: MemberGovernanceReason;
    requestedRole?: TenantMemberRole;
    resultUpdatedAt?: string;
    targetUserId?: string;
    fromRole?: TenantMemberRole;
    toRole?: TenantMemberRole;
    fromStatus?: "ACTIVE" | "SUSPENDED";
    toStatus?: "ACTIVE" | "SUSPENDED";
  },
) {
  const metadata: Record<string, string> = {};
  metadata.attemptId = details.attemptId;
  if (details.inputMembershipId) metadata.inputMembershipId = details.inputMembershipId;
  if (details.reason) metadata.reason = details.reason;
  if (details.requestedRole) metadata.requestedRole = details.requestedRole;
  if (details.resultUpdatedAt) metadata.resultUpdatedAt = details.resultUpdatedAt;
  if (details.targetUserId) metadata.targetUserId = details.targetUserId;
  if (details.fromRole) metadata.fromRole = details.fromRole;
  if (details.toRole) metadata.toRole = details.toRole;
  if (details.fromStatus) metadata.fromStatus = details.fromStatus;
  if (details.toStatus) metadata.toStatus = details.toStatus;

  await tx.insert(auditEvents).values({
    actorId: context.userId,
    actorRole: "TENANT_MEMBER",
    tenantId: context.tenantId,
    action,
    targetType: "MEMBERSHIP",
    targetId,
    outcome,
    metadata,
  });
}

async function deny(
  tx: TenantTransaction,
  context: TenantContext,
  action: MemberGovernanceAction,
  targetId: string,
  reason: MemberGovernanceReason,
  details: {
    attemptId: string;
    inputMembershipId?: string;
    requestedRole?: TenantMemberRole;
    targetUserId?: string;
  },
): Promise<MemberGovernanceResult> {
  await appendAudit(tx, context, action, "DENIED", targetId, { ...details, reason });
  return { ok: false, reason };
}

type MemberGovernanceReceipt = {
  outcome: "SUCCESS" | "DENIED";
  targetId: string;
  metadata: Record<string, unknown>;
};

function isGovernanceReason(value: unknown): value is MemberGovernanceReason {
  return [
    "ALREADY_ACTIVE",
    "ATTEMPT_CONFLICT",
    "INVITATION_NOT_ALLOWED",
    "LAST_ACTIVE_ADMIN",
    "MEMBER_NOT_FOUND",
    "NO_CHANGE",
    "NOT_AUTHORIZED",
    "SELF_CHANGE_NOT_ALLOWED",
  ].includes(String(value));
}

async function lockGovernanceAttempt(
  tx: TenantTransaction,
  context: TenantContext,
  attemptId: string,
) {
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${'member-governance-attempt:' + attemptId}, 0)
    )
  `);
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${'member-governance-tenant:' + context.tenantId}, 0)
    )
  `);
}

async function lockTargetUser(tx: TenantTransaction, userId: string) {
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${'member-governance-user:' + userId}, 0)
    )
  `);
}

async function loadAttemptReceipt(
  tx: TenantTransaction,
  context: TenantContext,
  action: MemberGovernanceAction,
  attemptId: string,
): Promise<MemberGovernanceReceipt | undefined> {
  const rows = await tx
    .select({
      outcome: auditEvents.outcome,
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(and(
      eq(auditEvents.actorId, context.userId),
      eq(auditEvents.tenantId, context.tenantId),
      eq(auditEvents.action, action),
      sql`${auditEvents.metadata} ->> 'attemptId' = ${attemptId}`,
    ))
    .limit(2);
  if (rows.length !== 1) return undefined;
  return {
    outcome: rows[0].outcome,
    targetId: rows[0].targetId,
    metadata: rows[0].metadata as Record<string, unknown>,
  };
}

async function replayReceipt(
  tx: TenantTransaction,
  context: TenantContext,
  receipt: MemberGovernanceReceipt,
): Promise<MemberGovernanceResult> {
  if (receipt.outcome === "DENIED") {
    return {
      ok: false,
      reason: isGovernanceReason(receipt.metadata.reason)
        ? receipt.metadata.reason
        : "ATTEMPT_CONFLICT",
    };
  }
  const member = await loadMembership(tx, context, receipt.targetId);
  const role = isMemberRole(String(receipt.metadata.toRole))
    ? String(receipt.metadata.toRole) as TenantMemberRole
    : undefined;
  const status = receipt.metadata.toStatus === "ACTIVE" || receipt.metadata.toStatus === "SUSPENDED"
    ? receipt.metadata.toStatus
    : undefined;
  const resultUpdatedAt = typeof receipt.metadata.resultUpdatedAt === "string"
    ? new Date(receipt.metadata.resultUpdatedAt)
    : undefined;
  if (!member || !role || !status || !resultUpdatedAt || Number.isNaN(resultUpdatedAt.getTime())) {
    return { ok: false, reason: "ATTEMPT_CONFLICT" };
  }
  return {
    ok: true,
    member: { ...member, role, status, updatedAt: resultUpdatedAt },
  };
}

async function loadMembership(
  tx: TenantTransaction,
  context: TenantContext,
  membershipId: string,
): Promise<GovernedMembership | undefined> {
  const rows = await tx
    .select({
      id: memberships.id,
      userId: memberships.userId,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
      updatedAt: memberships.updatedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.tenantId, context.tenantId),
      ),
    )
    .limit(1)
    .for("update", { of: memberships });

  return rows[0];
}

async function lockActiveTenantAdmins(
  tx: TenantTransaction,
  context: TenantContext,
) {
  const locked = await tx.execute<{ id: string }>(sql`
    SELECT ${memberships.id} AS id
    FROM ${memberships}
    WHERE ${memberships.tenantId} = ${context.tenantId}::uuid
      AND ${memberships.role} = 'TENANT_ADMIN'
      AND ${memberships.status} = 'ACTIVE'
    ORDER BY ${memberships.id}
    FOR UPDATE
  `);
  return locked.rows.length;
}

export async function listTenantMembers(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<TenantMember[]> {
  if (context.role !== "TENANT_ADMIN") {
    throw new MemberGovernanceDeniedError();
  }

  const rows = await tx
    .select({
      id: memberships.id,
      userId: memberships.userId,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
      updatedAt: memberships.updatedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.tenantId, context.tenantId))
    .orderBy(asc(users.name), asc(users.email), asc(memberships.id));

  return rows.map(memberView);
}

export async function inviteTenantMember(
  tx: TenantTransaction,
  context: TenantContext,
  input: { attemptId: string; email: string; role: TenantMemberRole },
): Promise<MemberGovernanceResult> {
  const action = "MEMBER_INVITED" as const;
  if (!UUID_PATTERN.test(input.attemptId)) {
    return { ok: false, reason: "ATTEMPT_CONFLICT" };
  }
  await lockGovernanceAttempt(tx, context, input.attemptId);
  if (context.role !== "TENANT_ADMIN") {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) return replayReceipt(tx, context, receipt);
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "NOT_AUTHORIZED", {
      attemptId: input.attemptId,
    });
  }
  const email = normalizeEmail(input.email);
  if (
    email.length === 0
    || email.length > 254
    || !EMAIL_PATTERN.test(email)
    || !isMemberRole(input.role)
  ) {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) {
      return receipt.metadata.requestedRole === input.role
        ? replayReceipt(tx, context, receipt)
        : { ok: false, reason: "ATTEMPT_CONFLICT" };
    }
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "INVITATION_NOT_ALLOWED", {
      attemptId: input.attemptId,
      requestedRole: isMemberRole(input.role) ? input.role : undefined,
    });
  }

  const targetRows = await tx
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, eq(users.status, "ACTIVE")))
    .limit(2);
  if (targetRows.length !== 1) {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) {
      return receipt.metadata.requestedRole === input.role
        ? replayReceipt(tx, context, receipt)
        : { ok: false, reason: "ATTEMPT_CONFLICT" };
    }
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "INVITATION_NOT_ALLOWED", {
      attemptId: input.attemptId,
      requestedRole: input.role,
    });
  }
  const target = targetRows[0];
  await lockTargetUser(tx, target.id);

  const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
  if (receipt) {
    return receipt.metadata.targetUserId === target.id
      && receipt.metadata.requestedRole === input.role
      ? replayReceipt(tx, context, receipt)
      : { ok: false, reason: "ATTEMPT_CONFLICT" };
  }

  const eligibility = await tx.execute<{ allowed: boolean }>(sql`
    SELECT public.tenant_member_invitation_allowed(
      ${context.tenantId}::uuid,
      ${target.id}::text
    ) AS allowed
  `);
  if (eligibility.rows[0]?.allowed !== true) {
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "INVITATION_NOT_ALLOWED", {
      attemptId: input.attemptId,
      requestedRole: input.role,
      targetUserId: target.id,
    });
  }

  const existingRows = await tx
    .select({
      id: memberships.id,
      userId: memberships.userId,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
      updatedAt: memberships.updatedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.tenantId, context.tenantId),
        eq(memberships.userId, target.id),
      ),
    )
    .limit(1)
    .for("update", { of: memberships });
  const existing = existingRows[0];
  if (existing?.status === "ACTIVE") {
    return deny(tx, context, action, existing.id, "ALREADY_ACTIVE", {
      attemptId: input.attemptId,
      requestedRole: input.role,
      targetUserId: target.id,
    });
  }

  if (existing) {
    const updatedRows = await tx
      .update(memberships)
      .set({ role: input.role, status: "ACTIVE", updatedAt: new Date() })
      .where(
        and(
          eq(memberships.id, existing.id),
          eq(memberships.tenantId, context.tenantId),
          eq(memberships.status, "SUSPENDED"),
        ),
      )
      .returning({
        id: memberships.id,
        userId: memberships.userId,
        role: memberships.role,
        status: memberships.status,
        updatedAt: memberships.updatedAt,
      });
    const updated = updatedRows[0];
    if (!updated) {
      return deny(tx, context, action, existing.id, "INVITATION_NOT_ALLOWED", {
        attemptId: input.attemptId,
        requestedRole: input.role,
        targetUserId: target.id,
      });
    }
    const member = memberView({ ...updated, name: target.name, email: target.email });
    await appendAudit(tx, context, action, "SUCCESS", member.id, {
      attemptId: input.attemptId,
      fromRole: existing.role,
      toRole: member.role,
      fromStatus: existing.status,
      toStatus: member.status,
      requestedRole: input.role,
      resultUpdatedAt: member.updatedAt.toISOString(),
      targetUserId: target.id,
    });
    return { ok: true, member };
  }

  const insertedRows = await tx
    .insert(memberships)
    .values({
      tenantId: context.tenantId,
      userId: target.id,
      role: input.role,
      status: "ACTIVE",
    })
    .onConflictDoNothing()
    .returning({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      status: memberships.status,
      updatedAt: memberships.updatedAt,
    });
  const inserted = insertedRows[0];
  if (!inserted) {
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "INVITATION_NOT_ALLOWED", {
      attemptId: input.attemptId,
      requestedRole: input.role,
      targetUserId: target.id,
    });
  }

  const member = memberView({ ...inserted, name: target.name, email: target.email });
  await appendAudit(tx, context, action, "SUCCESS", member.id, {
    attemptId: input.attemptId,
    toRole: member.role,
    toStatus: member.status,
    requestedRole: input.role,
    resultUpdatedAt: member.updatedAt.toISOString(),
    targetUserId: target.id,
  });
  return { ok: true, member };
}

export async function changeTenantMemberRole(
  tx: TenantTransaction,
  context: TenantContext,
  input: { attemptId: string; membershipId: string; role: TenantMemberRole },
): Promise<MemberGovernanceResult> {
  const action = "MEMBER_ROLE_CHANGED" as const;
  if (!UUID_PATTERN.test(input.attemptId)) {
    return { ok: false, reason: "ATTEMPT_CONFLICT" };
  }
  await lockGovernanceAttempt(tx, context, input.attemptId);
  const targetId = UUID_PATTERN.test(input.membershipId)
    ? input.membershipId
    : "UNRESOLVED_MEMBER";
  if (context.role !== "TENANT_ADMIN") {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) return replayReceipt(tx, context, receipt);
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "NOT_AUTHORIZED", {
      attemptId: input.attemptId,
    });
  }
  if (targetId === "UNRESOLVED_MEMBER" || !isMemberRole(input.role)) {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) {
      return receipt.metadata.requestedRole === input.role
        ? replayReceipt(tx, context, receipt)
        : { ok: false, reason: "ATTEMPT_CONFLICT" };
    }
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "MEMBER_NOT_FOUND", {
      attemptId: input.attemptId,
      requestedRole: isMemberRole(input.role) ? input.role : undefined,
    });
  }

  const member = await loadMembership(tx, context, input.membershipId);
  if (!member || member.status !== "ACTIVE") {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) {
      return receipt.metadata.requestedRole === input.role
        ? replayReceipt(tx, context, receipt)
        : { ok: false, reason: "ATTEMPT_CONFLICT" };
    }
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "MEMBER_NOT_FOUND", {
      attemptId: input.attemptId,
      requestedRole: input.role,
    });
  }
  const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
  if (receipt) {
    return receipt.metadata.inputMembershipId === member.id
      && receipt.metadata.requestedRole === input.role
      ? replayReceipt(tx, context, receipt)
      : { ok: false, reason: "ATTEMPT_CONFLICT" };
  }
  if (member.role === input.role) {
    return deny(tx, context, action, member.id, "NO_CHANGE", {
      attemptId: input.attemptId,
      inputMembershipId: member.id,
      requestedRole: input.role,
    });
  }
  if (member.role === "TENANT_ADMIN" && input.role === "OPERATOR") {
    const activeAdminCount = await lockActiveTenantAdmins(tx, context);
    if (activeAdminCount <= 1) {
      return deny(tx, context, action, member.id, "LAST_ACTIVE_ADMIN", {
        attemptId: input.attemptId,
        inputMembershipId: member.id,
        requestedRole: input.role,
      });
    }
  }
  if (member.userId === context.userId) {
    return deny(tx, context, action, member.id, "SELF_CHANGE_NOT_ALLOWED", {
      attemptId: input.attemptId,
      inputMembershipId: member.id,
      requestedRole: input.role,
    });
  }

  const updatedRows = await tx
    .update(memberships)
    .set({ role: input.role, updatedAt: new Date() })
    .where(
      and(
        eq(memberships.id, member.id),
        eq(memberships.tenantId, context.tenantId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .returning({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      status: memberships.status,
      updatedAt: memberships.updatedAt,
    });
  const updated = updatedRows[0];
  if (!updated) {
    return deny(tx, context, action, member.id, "MEMBER_NOT_FOUND", {
      attemptId: input.attemptId,
      inputMembershipId: member.id,
      requestedRole: input.role,
    });
  }

  const result = memberView({ ...updated, name: member.name, email: member.email });
  await appendAudit(tx, context, action, "SUCCESS", result.id, {
    attemptId: input.attemptId,
    fromRole: member.role,
    toRole: result.role,
    fromStatus: member.status,
    toStatus: result.status,
    inputMembershipId: member.id,
    requestedRole: input.role,
    resultUpdatedAt: result.updatedAt.toISOString(),
    targetUserId: member.userId,
  });
  return { ok: true, member: result };
}

export async function deactivateTenantMember(
  tx: TenantTransaction,
  context: TenantContext,
  input: { attemptId: string; membershipId: string },
): Promise<MemberGovernanceResult> {
  const action = "MEMBER_DEACTIVATED" as const;
  if (!UUID_PATTERN.test(input.attemptId)) {
    return { ok: false, reason: "ATTEMPT_CONFLICT" };
  }
  await lockGovernanceAttempt(tx, context, input.attemptId);
  const targetId = UUID_PATTERN.test(input.membershipId)
    ? input.membershipId
    : "UNRESOLVED_MEMBER";
  if (context.role !== "TENANT_ADMIN") {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) return replayReceipt(tx, context, receipt);
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "NOT_AUTHORIZED", {
      attemptId: input.attemptId,
    });
  }
  if (targetId === "UNRESOLVED_MEMBER") {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) return replayReceipt(tx, context, receipt);
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "MEMBER_NOT_FOUND", {
      attemptId: input.attemptId,
    });
  }

  const member = await loadMembership(tx, context, input.membershipId);
  if (!member || member.status !== "ACTIVE") {
    const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
    if (receipt) return replayReceipt(tx, context, receipt);
    return deny(tx, context, action, "UNRESOLVED_MEMBER", "MEMBER_NOT_FOUND", {
      attemptId: input.attemptId,
    });
  }
  const receipt = await loadAttemptReceipt(tx, context, action, input.attemptId);
  if (receipt) {
    return receipt.metadata.inputMembershipId === member.id
      ? replayReceipt(tx, context, receipt)
      : { ok: false, reason: "ATTEMPT_CONFLICT" };
  }
  if (member.role === "TENANT_ADMIN") {
    const activeAdminCount = await lockActiveTenantAdmins(tx, context);
    if (activeAdminCount <= 1) {
      return deny(tx, context, action, member.id, "LAST_ACTIVE_ADMIN", {
        attemptId: input.attemptId,
        inputMembershipId: member.id,
      });
    }
  }
  if (member.userId === context.userId) {
    return deny(tx, context, action, member.id, "SELF_CHANGE_NOT_ALLOWED", {
      attemptId: input.attemptId,
      inputMembershipId: member.id,
    });
  }

  const updatedRows = await tx
    .update(memberships)
    .set({ status: "SUSPENDED", updatedAt: new Date() })
    .where(
      and(
        eq(memberships.id, member.id),
        eq(memberships.tenantId, context.tenantId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .returning({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      status: memberships.status,
      updatedAt: memberships.updatedAt,
    });
  const updated = updatedRows[0];
  if (!updated) {
    return deny(tx, context, action, member.id, "MEMBER_NOT_FOUND", {
      attemptId: input.attemptId,
      inputMembershipId: member.id,
    });
  }

  const result = memberView({ ...updated, name: member.name, email: member.email });
  await appendAudit(tx, context, action, "SUCCESS", result.id, {
    attemptId: input.attemptId,
    fromRole: member.role,
    toRole: result.role,
    fromStatus: member.status,
    toStatus: result.status,
    inputMembershipId: member.id,
    resultUpdatedAt: result.updatedAt.toISOString(),
    targetUserId: member.userId,
  });
  return { ok: true, member: result };
}
