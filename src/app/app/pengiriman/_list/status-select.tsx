"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * The toolbar status facet (spec 10 §4.4): the tiles above cover the groups; this reaches every
 * single status. Choosing one navigates to that option's URL, which keeps the period.
 */
export function StatusSelect({
  label,
  options,
  value,
}: {
  label: string;
  options: readonly { href: string; label: string; value: string }[];
  value: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="max-md:w-full">
      <span className="sr-only">{label}</span>
      <select
        aria-busy={pending || undefined}
        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11 md:w-56"
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) startTransition(() => router.push(next.href));
        }}
        defaultValue={value}
        key={value}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
