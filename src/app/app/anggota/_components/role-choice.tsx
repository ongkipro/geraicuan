"use client";

import { ROLE_LABEL } from "@/app/app/pengaturan/_components/settings-logic";
import { OptionCard } from "@/components/app/option-card";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";

export type MemberRole = keyof typeof ROLE_LABEL;

const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  OPERATOR: "Buat kiriman dan cetak resi.",
  TENANT_ADMIN: "Semua akses Operator, ditambah laporan, pengaturan, dan anggota.",
};

/**
 * T-234: the member role as two radio option cards (same `role` field and values the Select
 * posted). Callers key it on the action's result token: React resets a form after its action,
 * and a remount makes the radios' default the current choice so the reset cannot undo it.
 */
export function RoleChoice({ disabled, error, legend, onChange, value }: {
  disabled?: boolean;
  error?: string;
  legend: string;
  onChange: (role: MemberRole) => void;
  value: MemberRole;
}) {
  return (
    <FieldSet className="gap-0" data-invalid={Boolean(error) || undefined}>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(Object.keys(ROLE_LABEL) as MemberRole[]).map((role) => (
          <OptionCard
            checked={value === role}
            description={ROLE_DESCRIPTION[role]}
            disabled={disabled}
            key={role}
            name="role"
            onSelect={() => onChange(role)}
            value={role}
          >
            {ROLE_LABEL[role]}
          </OptionCard>
        ))}
      </div>
      <FieldError className="mt-1.5">{error}</FieldError>
    </FieldSet>
  );
}
