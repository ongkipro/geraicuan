"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { id as idLocale } from "react-day-picker/locale/id";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ANALYTICS_PRESETS, type AnalyticsPresetId } from "@/lib/analytics-range";
import { cn } from "@/lib/utils";

/** Spec 10 §5: the four presets the picker offers; any other range is picked on the calendar. */
const PICKER_PRESETS = ANALYTICS_PRESETS.filter((preset) =>
  (["hari-ini", "7-hari", "30-hari", "bulan-ini"] as AnalyticsPresetId[]).includes(preset.id),
);

const dayLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type Selection = { presetId: AnalyticsPresetId; from: string; to: string };

/**
 * The period control of a `FilterBar` (spec 10 §4.2): a calendar-icon button opening presets and
 * a range calendar. It writes the URL parameters `parseAnalyticsRange` reads — `rentang`, and for
 * a picked range `dari`/`sampai` — as hidden inputs of the surrounding GET form; "Terapkan"
 * submits them.
 */
export function DateRangePicker({
  endDate,
  label,
  presetId,
  startDate,
}: {
  /** `range.lastIncludedDate` (YYYY-MM-DD, WIB calendar day). */
  endDate: string;
  /** The server-formatted period, e.g. "27 Agu 2026 – 25 Sep 2026". */
  label: string;
  presetId: AnalyticsPresetId;
  /** `range.startDate` (YYYY-MM-DD). */
  startDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>({ from: startDate, presetId, to: endDate });
  const [draft, setDraft] = useState<DateRange | undefined>();
  const changed = selection.presetId !== presetId || selection.from !== startDate || selection.to !== endDate;

  const triggerLabel = !changed
    ? label
    : selection.presetId === "kustom"
      ? selection.from === selection.to
        ? dayLabel.format(toDate(selection.from))
        : `${dayLabel.format(toDate(selection.from))} – ${dayLabel.format(toDate(selection.to))}`
      : ANALYTICS_PRESETS.find((preset) => preset.id === selection.presetId)?.label ?? label;

  function pickPreset(id: AnalyticsPresetId) {
    setSelection({ from: startDate, presetId: id, to: endDate });
    setDraft(undefined);
    setOpen(false);
  }

  function pickRange(range: DateRange | undefined) {
    setDraft(range);
    if (range?.from && range.to) {
      setSelection({ from: toValue(range.from), presetId: "kustom", to: toValue(range.to) });
    }
  }

  const calendarRange: DateRange = draft ?? { from: toDate(selection.from), to: toDate(selection.to) };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <input name="rentang" type="hidden" value={selection.presetId} />
      {selection.presetId === "kustom" ? (
        <>
          <input name="dari" type="hidden" value={selection.from} />
          <input name="sampai" type="hidden" value={selection.to} />
        </>
      ) : null}
      <PopoverTrigger asChild>
        <Button aria-label={`Periode: ${triggerLabel}`} className="justify-start border-input px-3 text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground" type="button" variant="outline">
          <CalendarDays aria-hidden="true" className="text-muted-foreground" />
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown aria-hidden="true" className="ml-auto text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto max-w-[calc(100vw-2rem)] flex-col gap-3 p-3 md:flex-row">
        <ul aria-label="Pilihan periode" className="flex flex-wrap gap-2 md:w-40 md:flex-col md:flex-nowrap">
          {PICKER_PRESETS.map((preset) => (
            <li key={preset.id}>
              <Button
                aria-pressed={selection.presetId === preset.id}
                className={cn(
                  "w-full justify-start",
                  selection.presetId === preset.id && "bg-accent text-accent-foreground hover:bg-accent",
                )}
                onClick={() => pickPreset(preset.id)}
                type="button"
                variant="ghost"
              >
                {preset.label}
              </Button>
            </li>
          ))}
        </ul>
        <Calendar
          defaultMonth={calendarRange.from}
          disabled={{ after: new Date() }}
          locale={idLocale}
          mode="range"
          numberOfMonths={1}
          onSelect={pickRange}
          selected={calendarRange}
        />
      </PopoverContent>
    </Popover>
  );
}
