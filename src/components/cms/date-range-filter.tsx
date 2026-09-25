"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { ANALYTICS_PRESETS, type AnalyticsPresetId } from "@/lib/analytics-range";
import { cn } from "@/lib/utils";

/**
 * PR-53: the one date-range control, identical on every page with a time basis.
 *
 * Anatomy follows the owner's reference (2026-09-16) with four departures, the
 * first three accepted in T-163 and the fourth forced by the fallback the same
 * entry requires:
 *
 * 1. Focus is our single 2px full-alpha `--ring`. The reference paints a 3px
 *    ring at half alpha, which is exactly what `design-token-contrast`
 *    forbids, so neither the width nor the alpha modifier is copied.
 * 2. Day cells and every control here are at least 44 px below `md`.
 * 3. The locale is `id-ID`, week starting Monday — the same day `minggu-ini`
 *    counts from.
 * 4. **The disclosure is a native `<details>`/`<summary>`, not a Radix
 *    popover.** T-163 requires the native `type="date"` inputs to stay "the
 *    typed and fallback path, so the feature still works if the calendar fails
 *    to load". A popover unmounts its content when closed, so the named
 *    `rentang`, `dari` and `sampai` controls would leave the page's single GET
 *    form whenever the popover is shut, and the page's own "Terapkan" would
 *    silently drop the range. `<details>` keeps them in the form at all times
 *    and needs no JavaScript at all; CSS turns it into a popover panel from
 *    `md` and a bottom sheet below it.
 *
 * The preset control is one value in two shapes: a native radio list from `lg`
 * and a native select below it. Only the radios carry the `rentang` name, so
 * the form can never submit two values for one parameter.
 */

export type DateRangeFilterProps = {
  /** Text naming the compared span, where the page compares periods. */
  comparisonLabel?: string;
  /** Last included date, `yyyy-mm-dd`. */
  endDate: string;
  /** Prefix for every id this control owns, e.g. "dashboard". */
  idPrefix: string;
  presetId: AnalyticsPresetId;
  /** Resolved range in words, e.g. "20 Agu 2026 – 16 Sep 2026". */
  rangeLabel: string;
  /** First included date, `yyyy-mm-dd`. */
  startDate: string;
  /** WIB today, `yyyy-mm-dd`; nothing later can be chosen. */
  todayLocalDate: string;
  /** Zone in words, e.g. "WIB (UTC+07:00)". */
  timezoneLabel: string;
};

/** `yyyy-mm-dd` as a UTC midnight instant, which is how the calendar reads days. */
function toDay(value: string): Date | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function toDateString(day: Date): string {
  return [
    String(day.getUTCFullYear()).padStart(4, "0"),
    String(day.getUTCMonth() + 1).padStart(2, "0"),
    String(day.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function DateRangeFilter({
  comparisonLabel,
  endDate,
  idPrefix,
  presetId,
  rangeLabel,
  startDate,
  todayLocalDate,
  timezoneLabel,
}: DateRangeFilterProps) {
  const [preset, setPreset] = useState<AnalyticsPresetId>(presetId);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // `<summary>` exposes its expanded state natively, but the reference anatomy
  // asks for an explicit `aria-expanded` and a test binds it. Mirror the real
  // state rather than printing a value that goes stale on the first toggle.
  // lazy: the mirror is only correct from hydration onward. Server-rendered the
  // panel is shut, so `false` is true then; a toggle *before* hydration would be
  // announced as collapsed until this effect runs and syncs. Upgrade path: drop
  // the explicit attribute and rely on the native `<details>` state, which needs
  // the reference anatomy to give up `aria-expanded` as it already gave up the
  // dialog role.
  useEffect(() => {
    const element = detailsRef.current;
    if (!element) return;
    const sync = () => setOpen(element.open);
    sync();
    element.addEventListener("toggle", sync);
    return () => element.removeEventListener("toggle", sync);
  }, []);

  const choosePreset = (value: string) => setPreset(value as AnalyticsPresetId);
  const chooseRange = (range: DateRange | undefined) => {
    if (!range?.from) return;
    setPreset("kustom");
    setStart(toDateString(range.from));
    setEnd(toDateString(range.to ?? range.from));
  };
  const chooseTypedStart = (value: string) => {
    setPreset("kustom");
    setStart(value);
  };
  const chooseTypedEnd = (value: string) => {
    setPreset("kustom");
    setEnd(value);
  };

  const selected: DateRange | undefined = toDay(start)
    ? { from: toDay(start), to: toDay(end) }
    : undefined;
  const fieldClass = "grid min-w-0 gap-1.5 text-sm font-medium text-foreground";

  return (
    <details
      className="cms-range-filter"
      data-filter-disclosure
      data-slot="date-range-filter"
      ref={detailsRef}
    >
      <summary
        aria-expanded={open}
        className="cms-range-trigger outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={`${idPrefix}-range-trigger`}
      >
        <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{rangeLabel}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </summary>

      {/* A group, not a dialog. Departure 1 made this a `<details>` disclosure so
          the date inputs never leave the page's single GET form; that content is
          therefore always in the document, and it traps no focus, has no modality
          and no Escape-to-close. A dialog role here announced a dialog that is
          none of those things, and a permanently mounted one also collided with
          the command palette's own — `header-tools.mjs` caught it on `/app`. The
          haspopup the reference anatomy asks for goes with it:
          `<summary>` plus `aria-expanded` is what this control actually is. */}
      <div aria-label="Pilih rentang tanggal" className="cms-range-popover" role="group">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="grid content-start gap-2 lg:w-44 lg:shrink-0">
            <span className="text-sm font-medium text-foreground" id={`${idPrefix}-range-preset-label`}>
              Periode
            </span>
            {/* One value, two shapes. The Select carries no `name`, so only the
                hidden input above is ever submitted. */}
            {/* Native, so the chosen preset is already painted server-side;
                Radix's Select resolves its label only after hydration and this
                is the only preset control visible below `lg`. It carries no
                `name`: the hidden input above is the single submitted value. */}
            <select
              aria-labelledby={`${idPrefix}-range-preset-label`}
              className="min-h-11 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
              id={`${idPrefix}-rentang`}
              onChange={(event) => choosePreset(event.target.value)}
              value={preset}
            >
              {ANALYTICS_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            {/* Native radios rather than the Radix `RadioGroup`, and they are
                the submitted control: the checked one carries `rentang` itself,
                so there is no hidden mirror to keep in step and nothing leaves
                the form when the panel closes (a `display:none` control is
                still submitted). Radix would have rendered one `aria-hidden`,
                `tabindex="-1"` bubble input per item purely to achieve that —
                eight invisible controls per filter form, which the browser
                sweep counts as controls with no focus ring. Arrow-key roving
                focus comes free with the native group. */}
            <div
              aria-labelledby={`${idPrefix}-range-preset-label`}
              className="hidden gap-0 lg:grid"
              role="radiogroup"
            >
              {ANALYTICS_PRESETS.map((item) => (
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm md:min-h-10",
                    preset === item.id ? "bg-muted font-medium" : "hover:bg-accent",
                  )}
                  htmlFor={`${idPrefix}-rentang-${item.id}`}
                  key={item.id}
                >
                  <input
                    checked={preset === item.id}
                    // The pointer target is the 44px row, not the 16px dot:
                    // the label wraps the input, and `after:-inset-2` widens the
                    // slop the same way `RadioGroupItem` already does.
                    className="relative size-4 shrink-0 accent-primary outline-none after:absolute after:-inset-x-3 after:-inset-y-3 focus-visible:ring-2 focus-visible:ring-ring"
                    id={`${idPrefix}-rentang-${item.id}`}
                    name="rentang"
                    onChange={() => choosePreset(item.id)}
                    type="radio"
                    value={item.id}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          {/* Mounted only while the panel is open. A two-month grid is a table
              of sixty-odd numbered cells; leaving it in the closed markup of
              every list page put weekday headers and day numbers into the
              page's own tables and counts. The named controls that must always
              submit are the hidden preset and the two date inputs, not this. */}
          {open ? (
            <Calendar
              defaultMonth={toDay(start)}
              disabled={{ after: new Date(`${todayLocalDate}T00:00:00.000Z`) }}
              mode="range"
              numberOfMonths={2}
              onSelect={chooseRange}
              required={false}
              selected={selected}
            />
          ) : null}
        </div>

        {/* The typed path, and the fallback if the calendar never loads. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={fieldClass} htmlFor={`${idPrefix}-dari`}>
            Dari tanggal
            <Input
              className="max-md:min-h-11"
              id={`${idPrefix}-dari`}
              max={todayLocalDate}
              name="dari"
              onChange={(event) => chooseTypedStart(event.target.value)}
              type="date"
              value={start}
            />
          </label>
          <label className={fieldClass} htmlFor={`${idPrefix}-sampai`}>
            Sampai tanggal
            <Input
              className="max-md:min-h-11"
              id={`${idPrefix}-sampai`}
              max={todayLocalDate}
              name="sampai"
              onChange={(event) => chooseTypedEnd(event.target.value)}
              type="date"
              value={end}
            />
          </label>
        </div>

        {/* `id` first so a page-level regex bound to `<p class="…">` keeps
            matching that page's own summary line, not this one. */}
        <p id={`${idPrefix}-range-resolved`} className="text-sm text-muted-foreground">
          Rentang aktif: {rangeLabel} · {timezoneLabel}
          {comparisonLabel ? ` · dibandingkan dengan ${comparisonLabel}` : ""}
        </p>

        <div>
          <Button className="max-md:min-h-11" type="submit">Terapkan rentang</Button>
        </div>
      </div>
    </details>
  );
}
