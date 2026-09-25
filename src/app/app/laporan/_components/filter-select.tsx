"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__semua__";

/**
 * A filter-row select (spec 10 §4.2): a shadcn Select whose value travels in a hidden input of
 * the surrounding GET form. "All" sends no parameter at all, which is what the parsers read as
 * unfiltered, so the URL stays canonical.
 */
export function FilterSelect({
  allLabel,
  label,
  name,
  options,
  value,
}: {
  allLabel: string;
  /** Accessible name; the row has no visible labels. */
  label: string;
  name: string;
  options: readonly { label: string; value: string }[];
  value: string | null;
}) {
  const [selected, setSelected] = useState(value ?? ALL);
  return (
    <>
      {selected === ALL ? null : <input name={name} type="hidden" value={selected} />}
      <Select onValueChange={setSelected} value={selected}>
        <SelectTrigger aria-label={label} className="min-w-44 max-md:w-full">
          <SelectValue>{options.find((option) => option.value === selected)?.label ?? allLabel}</SelectValue>
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
