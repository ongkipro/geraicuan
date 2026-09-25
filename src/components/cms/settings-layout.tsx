import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/cms/page-header";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type SettingsNavItem = {
  href: string;
  label: string;
  /** One line, sentence case: what the page is for. Shown on the mobile index rows. */
  description: string;
  icon: LucideIcon;
};

type SettingsHeading =
  | {
      /**
       * Preferred: pass `<PageHeader … />` from the page itself, so the page
       * source still declares the eyebrow and title that its loading.tsx and
       * error.tsx must repeat (tests/dashboard-error-loading).
       */
      header: ReactNode;
      title?: never;
      description?: never;
      eyebrow?: never;
    }
  | {
      header?: never;
      title: ReactNode;
      description?: ReactNode;
      eyebrow?: string;
    };

export type SettingsLayoutProps = SettingsHeading & {
  items: readonly SettingsNavItem[];
  /**
   * The page's own route (e.g. "/app/pengaturan", no query or hash). The item
   * whose `href` equals it gets `aria-current="true"` and the `bg-muted`
   * highlight; an unmatched value marks nothing, so never pass "". It is
   * `"true"`, not `"page"`: the shell sidebar already owns the one
   * `aria-current="page"` for this route, and screening flagged two.
   */
  currentHref: string;
  /**
   * The settings index. Below `lg` it decides the two shapes PR-46 names: on
   * the index the whole menu is the page (tappable rows with a chevron), on
   * every other settings page the menu collapses to one back link.
   */
  indexHref: string;
  /** Navigation landmark name; defaults to "Menu pengaturan". */
  navLabel?: string;
  children?: ReactNode;
};

/**
 * PR-46 settings frame: heading, separator, the settings menu (a left rail from
 * `lg`, the page itself below `lg` on the index, one back link below `lg`
 * everywhere else) and the content column. Server component, no client JS.
 */
export function SettingsLayout({
  children,
  currentHref,
  description,
  eyebrow,
  header,
  indexHref,
  items,
  navLabel = "Menu pengaturan",
  title,
}: SettingsLayoutProps) {
  const onIndex = currentHref === indexHref;
  return (
    <div className="grid min-w-0 gap-4">
      {header ?? <PageHeader description={description} eyebrow={eyebrow} title={title} />}
      <Separator />
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:gap-10">
        <aside
          className={cn(
            "min-w-0 lg:w-44 lg:shrink-0 xl:w-56",
            onIndex ? null : "max-lg:hidden",
          )}
        >
          <nav aria-label={navLabel}>
            <ul className="grid gap-1">
              {items.map(({ description: itemDescription, href, icon: Icon, label }) => {
                const current = href === currentHref;
                return (
                  <li key={href}>
                    <Link
                      aria-current={current ? "true" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground lg:min-h-9 lg:py-1.5",
                        current ? "bg-muted font-semibold text-foreground" : "text-muted-foreground",
                      )}
                      href={href}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate font-medium">{label}</span>
                        <span className="text-xs leading-5 text-muted-foreground lg:hidden">
                          {itemDescription}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground lg:hidden"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0 flex-1 lg:max-w-[47.5rem]">
          {onIndex ? null : (
            <Link
              aria-label="Kembali ke Pengaturan"
              className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              href={indexHref}
            >
              <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
              Pengaturan
            </Link>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export type SettingsCardProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Status badge, rendered beside the title. */
  badge?: ReactNode;
  /** Heading id, for aria-labelledby and hash focus targets. */
  id?: string;
  /** Footer actions: right-aligned from `md`, full width below it. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * PR-46 card anatomy: title and description, body, divider, footer actions
 * right-aligned (full width below `md`), status badge beside the title.
 */
export function SettingsCard({
  badge,
  children,
  className,
  description,
  footer,
  id,
  title,
}: SettingsCardProps) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0", className)}>
      <Card className="ios-glass-card rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          {/* `tabIndex={-1}` makes the heading a valid `#hash` focus target, which
            is how the outlet selector moves focus into the card it just changed. */}
        <CardTitle id={id} tabIndex={id ? -1 : undefined}>{title}</CardTitle>
          {badge ? <CardAction>{badge}</CardAction> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="min-w-0">{children}</CardContent>
        {footer ? (
          <CardFooter className="flex-wrap justify-end gap-2 max-md:flex-col max-md:items-stretch [&>*]:min-h-11 md:[&>*]:min-h-9">
            {footer}
          </CardFooter>
        ) : null}
      </Card>
    </section>
  );
}

export type ContentSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Heading id, for aria-labelledby and hash focus targets. */
  id?: string;
  children?: ReactNode;
  className?: string;
  /** Classes for the content wrapper, e.g. `lg:max-w-none` to lift the form cap for a list. */
  contentClassName?: string;
  /** Heading level; defaults to 3. Use 2 when no h2 sits between the page h1 and this section. */
  headingLevel?: 2 | 3;
};

/** One settings panel: title (h3 by default), muted description, separator, content capped at lg:max-w-xl. */
export function ContentSection({ children, className, contentClassName, description, headingLevel = 3, id, title }: ContentSectionProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={cn("grid min-w-0 gap-4", className)}>
      <div>
        <Heading className="text-lg font-medium" id={id}>{title}</Heading>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <Separator />
      <div className={cn("min-w-0 lg:max-w-xl", contentClassName)}>{children}</div>
    </section>
  );
}
