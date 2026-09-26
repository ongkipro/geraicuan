"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The toolbar status facet (spec 10 §4.4): the tiles above cover the groups; this reaches every
 * single status. Choosing one navigates to that option's URL, which keeps the period; the URL
 * stays the state (`key` remounts the control when the page's status changes).
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
    <Select
      defaultValue={value}
      key={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) startTransition(() => router.push(option.href));
      }}
    >
      <SelectTrigger aria-busy={pending || undefined} aria-label={label} className="w-full font-medium md:w-56">
        {/* Children render the label on the server too, so the trigger is never blank before hydration. */}
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
