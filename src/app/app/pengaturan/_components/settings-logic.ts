import type { SafeOutletReadiness } from "@/app/app/pengaturan/outlet-settings-types";

type OrderableOutlet = { id: string; name: string; readinessStatus: "ready" | "needs_attention" };

/** Outlets needing attention first, then by name (id-ID collation), then id. */
export function orderOutlets<T extends OrderableOutlet>(outlets: readonly T[]): T[] {
  return [...outlets].sort((left, right) => {
    if (left.readinessStatus !== right.readinessStatus) {
      return left.readinessStatus === "needs_attention" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "id-ID") || left.id.localeCompare(right.id);
  });
}

/** The outlet `?outlet=` names when it belongs to the list, else the first; null without outlets. */
export function pickActiveOutlet<T extends { id: string }>(
  outlets: readonly T[],
  requested: string | string[] | undefined,
): T | null {
  const id = typeof requested === "string" ? requested : null;
  return outlets.find((outlet) => outlet.id === id) ?? outlets[0] ?? null;
}

/** One sentence naming the connection an outlet ships with (Outlet page, read-only). */
export function connectionSentence(outlet: SafeOutletReadiness) {
  if (outlet.connectionStatus === "private_attention") return "Akun Mengantar sendiri — perlu diperiksa";
  if (outlet.connectionSource === "private") return "Akun Mengantar sendiri";
  if (outlet.privateConnectionRequired) return "Belum terhubung ke akun Mengantar gerai";
  return "Koneksi bawaan GeraiCUAN";
}

export type MemberLike = {
  id: string;
  userId: string;
  name: string;
  role: "TENANT_ADMIN" | "OPERATOR";
  status: "ACTIVE" | "SUSPENDED";
};

/** Active first, the viewer first among equals, Tenant Admin before Operator, then by name. */
export function orderMembers<T extends MemberLike>(members: readonly T[], viewerUserId: string): T[] {
  return [...members].sort((left, right) => {
    if (left.status !== right.status) return left.status === "ACTIVE" ? -1 : 1;
    const leftSelf = left.userId === viewerUserId;
    if (leftSelf !== (right.userId === viewerUserId)) return leftSelf ? -1 : 1;
    if (left.role !== right.role) return left.role === "TENANT_ADMIN" ? -1 : 1;
    return left.name.localeCompare(right.name, "id-ID") || left.id.localeCompare(right.id);
  });
}

export function summarizeMembers(members: readonly MemberLike[]) {
  const active = members.filter((member) => member.status === "ACTIVE");
  return {
    total: members.length,
    active: active.length,
    inactive: members.length - active.length,
    activeAdmins: active.filter((member) => member.role === "TENANT_ADMIN").length,
    activeOperators: active.filter((member) => member.role === "OPERATOR").length,
  };
}

/**
 * What a member row offers. The server refuses the same cases again; this only decides
 * whether "Kelola akses" or the sentence that explains why not is shown.
 */
export function memberAccess(member: MemberLike, viewerUserId: string, activeAdmins: number) {
  const isCurrentUser = member.userId === viewerUserId;
  const isLastActiveAdmin = member.status === "ACTIVE" && member.role === "TENANT_ADMIN" && activeAdmins === 1;
  if (member.status === "SUSPENDED") {
    return { isCurrentUser, isLastActiveAdmin, manageable: false, note: "Undang ulang untuk mengaktifkan" } as const;
  }
  if (isLastActiveAdmin) {
    return { isCurrentUser, isLastActiveAdmin, manageable: false, note: "Admin terakhir dilindungi" } as const;
  }
  if (isCurrentUser) {
    return { isCurrentUser, isLastActiveAdmin, manageable: false, note: "Diubah oleh pemilik gerai lain" } as const;
  }
  return { isCurrentUser, isLastActiveAdmin, manageable: true, note: null } as const;
}

/** Two initials from the stored display name, e.g. "Ayu Admin" → "AA". */
export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase("id-ID")).join("") || "?";
}

export const ROLE_LABEL = { OPERATOR: "Operator", TENANT_ADMIN: "Pemilik gerai" } as const;
