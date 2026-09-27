import { ShieldCheck, UserRound, UsersRound } from "lucide-react";

import { initials, type memberAccess, ROLE_LABEL, type summarizeMembers } from "@/app/app/pengaturan/_components/settings-logic";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import type { TenantMember } from "@/db/member-governance-repository";
import { cn } from "@/lib/utils";

import { MemberAccessDialog } from "./member-access-dialog";

/**
 * T-256 (owner 2026-09-26: "kartu anggota ini apa?"): the three KPI cards became one compact
 * strip in the spec 10 §4.6 language — one card, cells split by 1px dividers, icon + 13px label,
 * 20/600 count. Figures, not filters: no links. Pemilik gerai and Operator count active members;
 * the total counts everyone and names the nonaktif part only when there is one.
 */
export function MemberStatStrip({ summary }: { summary: ReturnType<typeof summarizeMembers> }) {
  const cells = [
    { icon: UsersRound, label: "Total anggota", note: summary.inactive > 0 ? `${summary.inactive} nonaktif` : null, srNote: null, value: summary.total },
    { icon: ShieldCheck, label: "Pemilik gerai", note: null, srNote: "aktif", value: summary.activeAdmins },
    { icon: UserRound, label: "Operator", note: null, srNote: "aktif", value: summary.activeOperators },
  ];
  return (
    <section aria-label="Ringkasan anggota" className="@container overflow-hidden rounded-2xl bg-card shadow-card">
      <dl className="grid grid-cols-3 gap-px bg-border">
        {cells.map(({ icon: Icon, label, note, srNote, value }) => (
          <div className="flex min-h-16 min-w-0 flex-col justify-between gap-1 bg-card px-3 py-2.5 @xl:px-4 @xl:py-3" key={label}>
            <dt className="text-xs font-medium text-muted-foreground">
              <Icon aria-hidden="true" className="mr-1.5 inline size-4 align-[-3px] text-primary" />
              {label}
            </dt>
            <dd className="flex flex-wrap items-baseline gap-x-1.5 pt-0.5">
              <span className="text-xl leading-none font-semibold text-foreground tabular-nums">{value}</span>
              {srNote ? <span className="sr-only">{srNote}</span> : null}
              {note ? <span className="text-xs text-muted-foreground tabular-nums">{note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * One member: at `md` four subgrid columns (Anggota · Peran · Status · Tindakan); below, a
 * record card (identity, then badges with "Kelola akses" at the right). "Anda" is a badge beside
 * the name, never wrapped under it; a long name or email wraps in its own box. A member who
 * cannot be managed from here shows the reason instead of the action (`memberAccess`).
 */
export function MemberRow({
  access,
  deactivateAttemptId,
  member,
  roleAttemptId,
}: {
  access: ReturnType<typeof memberAccess>;
  deactivateAttemptId: string;
  member: TenantMember;
  roleAttemptId: string;
}) {
  const active = member.status === "ACTIVE";
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 md:col-span-4 md:grid-cols-subgrid md:gap-y-0 md:px-0"
      data-status={member.status}
    >
      <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1 md:pl-6">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {initials(member.name)}
        </span>
        <div className="grid min-w-0 gap-0.5">
          <p className="flex min-w-0 items-start gap-2" data-slot="member-name">
            <span className={cn("min-w-0 text-sm font-semibold wrap-anywhere", !active && "text-muted-foreground")}>{member.name}</span>
            {access.isCurrentUser ? <Badge className="mt-0.5 shrink-0" variant="outline">Anda</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground wrap-anywhere">{member.email}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        <span className="md:px-3"><Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge></span>
        <span className="md:px-3">
          {active ? <StatusBadge label="Aktif" tone="success" /> : <StatusBadge label="Nonaktif" tone="neutral" />}
        </span>
      </div>
      <div className={cn("md:max-w-48 md:justify-self-end md:pr-6 md:text-right", access.manageable ? "text-right" : "col-span-2 md:col-span-1")}>
        <MemberAccessDialog
          deactivateAttemptId={deactivateAttemptId}
          email={member.email}
          manageable={access.manageable}
          membershipId={member.id}
          name={member.name}
          note={access.note}
          role={member.role}
          roleAttemptId={roleAttemptId}
        />
      </div>
    </li>
  );
}
