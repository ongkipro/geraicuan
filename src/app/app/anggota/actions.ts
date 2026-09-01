"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import {
  changeTenantMemberRole,
  deactivateTenantMember,
  inviteTenantMember,
  type MemberGovernanceReason,
  type TenantMemberRole,
} from "@/db/member-governance-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type MemberActionField = "attemptId" | "confirmation" | "email" | "membershipId" | "role";

export type MemberActionState = {
  errors?: Partial<Record<MemberActionField, string>>;
  message?: string;
  nextAttemptId?: string;
  resultToken?: string;
  status?: "error" | "success";
  values?: { email?: string; role?: TenantMemberRole };
};

function formString(formData: FormData, name: MemberActionField) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isMemberRole(value: string): value is TenantMemberRole {
  return value === "TENANT_ADMIN" || value === "OPERATOR";
}

async function requireTenantAdminPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }
  if (principal.role !== "TENANT_ADMIN") {
    redirect("/app");
  }
  return principal;
}

function failed(
  message: string,
  attemptId: string | undefined,
  detail: Pick<MemberActionState, "errors" | "values"> = {},
): MemberActionState {
  return {
    ...detail,
    message,
    nextAttemptId: attemptId && UUID_PATTERN.test(attemptId) ? attemptId : randomUUID(),
    resultToken: randomUUID(),
    status: "error",
  };
}

function succeeded(message: string): MemberActionState {
  return {
    message,
    nextAttemptId: randomUUID(),
    resultToken: randomUUID(),
    status: "success",
  };
}

function denialMessage(reason: MemberGovernanceReason) {
  switch (reason) {
    case "LAST_ACTIVE_ADMIN":
      return "Perubahan ditolak. Tenant harus memiliki setidaknya satu Tenant Admin aktif.";
    case "NO_CHANGE":
      return "Tidak ada perubahan peran untuk disimpan.";
    case "SELF_CHANGE_NOT_ALLOWED":
      return "Ubah peran atau status akun Anda melalui Tenant Admin aktif lain.";
    case "ALREADY_ACTIVE":
      return "Akun tersebut sudah menjadi anggota aktif tenant ini.";
    case "INVITATION_NOT_ALLOWED":
      return "Undangan tidak dapat diproses. Pastikan email adalah akun GeraiCUAN aktif yang belum terikat ke tenant lain.";
    case "MEMBER_NOT_FOUND":
    case "NOT_AUTHORIZED":
    case "ATTEMPT_CONFLICT":
      return "Tindakan anggota tidak diizinkan.";
  }
}

export async function inviteMemberAction(
  _previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const principal = await requireTenantAdminPrincipal();
  const attemptId = formString(formData, "attemptId");
  const email = formString(formData, "email").normalize("NFKC").toLocaleLowerCase("en-US");
  const role = formString(formData, "role");
  const errors: MemberActionState["errors"] = {};

  if (!UUID_PATTERN.test(attemptId)) {
    errors.confirmation = "Permintaan undangan tidak valid. Coba lagi.";
  }
  if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = "Masukkan email akun GeraiCUAN yang valid.";
  }
  if (!isMemberRole(role)) {
    errors.role = "Pilih peran anggota yang valid.";
  }
  if (Object.keys(errors).length > 0) {
    return failed("Periksa kembali undangan yang ditandai.", attemptId, {
      errors,
      values: {
        ...(email.length <= 254 ? { email } : {}),
        ...(isMemberRole(role) ? { role } : {}),
      },
    });
  }

  let result;
  try {
    result = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => inviteTenantMember(tx, context, {
        attemptId,
        email,
        role: role as TenantMemberRole,
      }),
    );
  } catch {
    return failed("Undangan belum dapat diproses. Coba lagi.", attemptId, {
      values: { email, role: role as TenantMemberRole },
    });
  }
  if (!result.ok) {
    return failed(denialMessage(result.reason), attemptId, {
      values: { email, role: role as TenantMemberRole },
    });
  }

  revalidatePath("/app/anggota");
  return succeeded(`${result.member.name} ditambahkan sebagai ${result.member.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"}.`);
}

export async function changeMemberRoleAction(
  _previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const principal = await requireTenantAdminPrincipal();
  const attemptId = formString(formData, "attemptId");
  const membershipId = formString(formData, "membershipId");
  const role = formString(formData, "role");
  const confirmation = formString(formData, "confirmation");
  const errors: MemberActionState["errors"] = {};

  if (!UUID_PATTERN.test(attemptId)) {
    errors.confirmation = "Permintaan perubahan tidak valid. Coba lagi.";
  }
  if (!UUID_PATTERN.test(membershipId)) {
    errors.membershipId = "Anggota tidak valid.";
  }
  if (!isMemberRole(role)) {
    errors.role = "Pilih peran anggota yang valid.";
  }
  if (confirmation !== "CONFIRM_ROLE_CHANGE") {
    errors.confirmation = "Konfirmasi perubahan peran wajib dipilih.";
  }
  if (Object.keys(errors).length > 0) {
    return failed("Perubahan peran belum dikirim.", attemptId, {
      errors,
      values: isMemberRole(role) ? { role } : undefined,
    });
  }

  let result;
  try {
    result = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => changeTenantMemberRole(tx, context, {
        attemptId,
        membershipId,
        role: role as TenantMemberRole,
      }),
    );
  } catch {
    return failed("Perubahan peran belum dapat diproses. Coba lagi.", attemptId, {
      values: { role: role as TenantMemberRole },
    });
  }
  if (!result.ok) {
    return failed(denialMessage(result.reason), attemptId, {
      values: { role: role as TenantMemberRole },
    });
  }

  revalidatePath("/app/anggota");
  return succeeded(`Peran ${result.member.name} diubah menjadi ${result.member.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"}.`);
}

export async function deactivateMemberAction(
  _previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const principal = await requireTenantAdminPrincipal();
  const attemptId = formString(formData, "attemptId");
  const membershipId = formString(formData, "membershipId");
  const confirmation = formString(formData, "confirmation");
  const errors: MemberActionState["errors"] = {};

  if (!UUID_PATTERN.test(attemptId)) {
    errors.confirmation = "Permintaan penonaktifan tidak valid. Coba lagi.";
  }
  if (!UUID_PATTERN.test(membershipId)) {
    errors.membershipId = "Anggota tidak valid.";
  }
  if (confirmation !== "CONFIRM_DEACTIVATE") {
    errors.confirmation = "Konfirmasi penonaktifan wajib dipilih.";
  }
  if (Object.keys(errors).length > 0) {
    return failed("Penonaktifan belum dikirim.", attemptId, { errors });
  }

  let result;
  try {
    result = await withTenantContext(
      db,
      principal.userId,
      principal.tenantId,
      (tx, context) => deactivateTenantMember(tx, context, { attemptId, membershipId }),
    );
  } catch {
    return failed("Penonaktifan belum dapat diproses. Coba lagi.", attemptId);
  }
  if (!result.ok) {
    return failed(denialMessage(result.reason), attemptId);
  }

  revalidatePath("/app/anggota");
  return succeeded(`${result.member.name} dinonaktifkan dari tenant ini.`);
}
