"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { id as indonesianLocale } from "react-day-picker/locale";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * shadcn `Calendar` over `react-day-picker`, with three deliberate departures
 * from the upstream markup (T-163):
 *
 * 1. Focus is our single 2px full-alpha `--ring`. The reference paints a 3px
 *    ring at half alpha, and a half-alpha ring is exactly what
 *    `tests/design-token-contrast.integration.test.ts` forbids.
 * 2. Day cells are at least 44 px below `md` (the reference uses 28 px), then
 *    relax to 32 px where a pointer is the likely input.
 * 3. The locale is `id-ID`: Indonesian weekday and month names, and the week
 *    starts on Monday — the same day `minggu-ini` already counts from in
 *    `src/lib/analytics-range.ts`.
 *
 * The weekday and caption names come from `Intl.DateTimeFormat("id-ID")`
 * rather than from a bundled locale table, so the words on screen are the same
 * ones every other date on this page is formatted with.
 */

// No `timeZone` override: react-day-picker hands these formatters a local
// midnight, so forcing UTC shifted every name one day back for a reader east of
// Greenwich — the grid read "Min, Sen, Sel…" while the week genuinely started
// on Monday. The calendar only ever renders in the browser, so the reader's own
// zone is the right one and there is no server render to disagree with.
const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
const captionFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
});

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, ...props }: CalendarProps) {
  // Merged onto react-day-picker's own class names rather than replacing them,
  // so every part keeps its stable `rdp-*` hook for the browser audit while
  // still wearing our tokens.
  const rdp = getDefaultClassNames();
  const merged = (key: string, value: string) => cn((rdp as Record<string, string | undefined>)[key], value);

  return (
    <DayPicker
      className={cn("w-fit p-3", className)}
      classNames={{
        button_next: merged("button_next", cn(buttonVariants({ size: "icon", variant: "ghost" }), "size-11 md:size-8")),
        button_previous: merged("button_previous", cn(buttonVariants({ size: "icon", variant: "ghost" }), "size-11 md:size-8")),
        caption_label: merged("caption_label", "text-sm font-medium"),
        day: merged("day", "relative p-0 text-center text-sm"),
        day_button: merged(
          "day_button",
          "inline-flex size-11 items-center justify-center rounded-md tabular-nums outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8",
        ),
        disabled: merged("disabled", "text-muted-foreground opacity-50"),
        month: merged("month", "grid gap-3"),
        month_caption: merged("month_caption", "flex h-11 items-center justify-center md:h-8"),
        months: merged("months", "flex flex-col gap-4 sm:flex-row"),
        nav: merged("nav", "flex items-center justify-between"),
        outside: merged("outside", "text-muted-foreground"),
        // Range start and end carry `--primary`; the band between them is
        // `--muted`, so the selection reads at a glance without becoming a
        // second accent colour.
        range_end: merged("range_end", "rounded-r-md bg-muted [&_button]:bg-primary [&_button]:text-primary-foreground"),
        range_middle: merged("range_middle", "bg-muted [&_button]:hover:bg-accent"),
        range_start: merged("range_start", "rounded-l-md bg-muted [&_button]:bg-primary [&_button]:text-primary-foreground"),
        root: merged("root", "relative"),
        today: merged("today", "[&_button]:border [&_button]:border-primary"),
        week: merged("week", "flex w-full"),
        weekday: merged("weekday", "w-11 text-xs font-normal text-muted-foreground md:w-8"),
        weekdays: merged("weekdays", "flex"),
        weeks: merged("weeks", "grid gap-1"),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left"
            ? <ChevronLeft aria-hidden="true" {...chevronProps} />
            : <ChevronRight aria-hidden="true" {...chevronProps} />,
      }}
      formatters={{
        formatCaption: (month) => captionFormatter.format(month),
        formatWeekdayName: (weekday) => weekdayFormatter.format(weekday),
      }}
      locale={indonesianLocale}
      showOutsideDays
      weekStartsOn={1}
      {...props}
    />
  );
}
