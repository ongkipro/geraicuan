import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * T-149 content patterns. Both two-column patterns share one geometry: a main
 * column that may hold a wide table (`minmax(0,1fr)`, never bare `1fr`) and a
 * fixed 22rem rail. The split is a container query on the page frame, so the
 * layout does not change for reasons the operator cannot see (the sidebar rail
 * moves the viewport breakpoint by 208px).
 */
const twoColumn = "grid gap-6 @4xl/page:grid-cols-[minmax(0,1fr)_22rem] @4xl/page:items-start @4xl/page:gap-8";

/** Form and flow pages: sections on the left, summary and the primary action on the rail. */
export function FormLayout({ aside, children, className, ...props }: ComponentProps<"div"> & { aside?: ReactNode }) {
  return (
    <div className={cn(twoColumn, className)} {...props}>
      <div className="grid min-w-0 gap-6">{children}</div>
      {aside}
    </div>
  );
}

/** Detail pages: data and history on the left, "what is true now" on the rail. */
export function DetailLayout({ aside, asideFirst = false, children, className, ...props }: ComponentProps<"div"> & { aside?: ReactNode; asideFirst?: boolean }) {
  // `asideFirst`: the rail leads in the DOM (and so in focus and reading order) and on mobile,
  // and is placed in the right column at the split, so visual and focus order agree below it.
  if (asideFirst) {
    return (
      <div className={cn(twoColumn, className)} {...props}>
        <div className="grid min-w-0 gap-4 @4xl/page:col-start-2 @4xl/page:row-start-1">{aside}</div>
        <div className="grid min-w-0 gap-6 @4xl/page:col-start-1 @4xl/page:row-start-1">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn(twoColumn, className)} {...props}>
      <div className="grid min-w-0 gap-6">{children}</div>
      {aside}
    </div>
  );
}

/**
 * The rail itself. It sticks below the shell header (`--cms-header-h`, published
 * by `.cms-main`) and scrolls internally, so a long summary never traps the page.
 * Below the split it is a normal block in the flow.
 */
export function PageAside({ children, className, label, ...props }: ComponentProps<"aside"> & { label: string }) {
  return (
    <aside
      aria-label={label}
      className={cn(
        "grid min-w-0 gap-4 @4xl/page:sticky @4xl/page:top-[calc(var(--cms-header-h,4rem)+1rem)]",
        "@4xl/page:z-10 @4xl/page:max-h-[calc(100dvh-var(--cms-header-h,4rem)-2rem)] @4xl/page:overflow-y-auto @4xl/page:overscroll-contain",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

/**
 * Field widths state what the data is: a phone number is not as wide as an
 * address. Applied to the Field box (its control already fills it). Every size
 * is full width below `sm`, where a 44px target matters more than shape.
 */
export const fieldWidth = {
  xs: "w-full sm:w-24 sm:shrink-0",
  sm: "w-full sm:w-32 sm:shrink-0",
  md: "w-full sm:w-48 sm:shrink-0",
  money: "w-full sm:w-56 sm:shrink-0",
  lg: "w-full sm:w-80 sm:shrink-0",
  xl: "w-full sm:w-104 sm:shrink-0",
  full: "w-full max-w-2xl",
} as const;

/** One row of fields: wraps to content instead of forcing a fixed column grid. */
export function FieldRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-start gap-x-6 gap-y-5", className)} {...props} />;
}

/**
 * A card headline sits on a muted band with a hairline under it. The negative top
 * margin spans the band across the card because `Card` owns the vertical padding, and
 * `border-b` makes `CardHeader` add its own bottom padding.
 */
/** Spec 10 v2 frame budget: card headers carry no band or rule; kept as a hook for existing callers. */
export const cardBandClassName = "";

/**
 * Page-level section heading for a region that sits directly on the ground. Spec 10 §1.9
 * (T-203): neutral like a card title — the brand blue marks interaction, not headings.
 */
export const sectionHeadingClassName = "text-base font-semibold text-foreground";
