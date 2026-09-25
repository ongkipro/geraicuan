"use client";

import { CircleAlert } from "lucide-react";
import { forwardRef } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field";
import { CONTACT_ROLE_EFFECTS, CONTACT_ROLES, contactRoleLabel, type ContactRole } from "@/lib/contact-role-filter";

/** Spec 10 §4.11: every field keeps room for its inline error so the form does not jump. */
export function FieldMessage({ error, id }: { error?: string; id: string }) {
  return <div className="min-h-5"><FieldError id={id}>{error}</FieldError></div>;
}

/** Spec 10 §4.11: an error summary at the top links to each invalid field. */
export const ErrorSummary = forwardRef<HTMLDivElement, { errors: Record<string, string | undefined>; targets?: Record<string, string>; title: string }>(
  function ErrorSummary({ errors, targets = {}, title }, ref) {
    const entries = Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1]));
    if (entries.length === 0) return null;
    return (
      <Alert ref={ref} role="alert" tabIndex={-1} variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <ul className="list-disc pl-5">
            {entries.map(([field, message]) => <li key={field}><a className="underline underline-offset-4" href={`#${targets[field] ?? field}`}>{message}</a></li>)}
          </ul>
        </AlertDescription>
      </Alert>
    );
  },
);

/**
 * The Peran option cards (ref kontak-baru.html): a checkbox per role with what holding it does;
 * a ticked card takes the accent fill and primary border.
 */
export function RoleOptions({
  defaults,
  error,
  onSenderChange,
}: {
  defaults: Record<ContactRole, boolean>;
  error?: string;
  onSenderChange?: (checked: boolean) => void;
}) {
  return (
    <fieldset aria-describedby={error ? "roles-error" : undefined} aria-invalid={Boolean(error)} className="grid gap-2 outline-none" id="roles" tabIndex={-1}>
      <legend className="sr-only">Peran kontak</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {CONTACT_ROLES.map((role) => {
          const name = role === "pengirim" ? "roleSender" : "roleRecipient";
          return (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              key={role}
            >
              <input
                aria-describedby={`${name}-effect`}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                defaultChecked={defaults[role]}
                name={name}
                onChange={role === "pengirim" && onSenderChange ? (event) => onSenderChange(event.target.checked) : undefined}
                type="checkbox"
              />
              <span className="grid gap-1">
                <span className="text-sm font-semibold">Sebagai {contactRoleLabel(role).toLowerCase()}</span>
                <span className="text-xs text-muted-foreground" id={`${name}-effect`}>{CONTACT_ROLE_EFFECTS[role]}</span>
              </span>
            </label>
          );
        })}
      </div>
      <FieldMessage error={error} id="roles-error" />
    </fieldset>
  );
}
