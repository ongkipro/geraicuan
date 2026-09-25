"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "semua";

/**
 * One select of a platform filter row: a shadcn Select whose value travels in a hidden input of
 * the surrounding GET form ("" = no filter, the value `parsePlatformFilters` already reads).
 */
export function FilterSelect({
  allLabel,
  label,
  name,
  options,
  value,
}: {
  allLabel: string;
  label: string;
  name: string;
  options: readonly { label: string; value: string }[];
  value?: string | null;
}) {
  const [selected, setSelected] = useState(value || ALL);
  return (
    <>
      <input name={name} type="hidden" value={selected === ALL ? "" : selected} />
      <Select onValueChange={setSelected} value={selected}>
        <SelectTrigger aria-label={label} className="min-w-44 font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
