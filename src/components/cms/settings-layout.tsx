import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/cms/page-header";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type SettingsNavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
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
  /** Navigation landmark name; defaults to "Menu pengaturan". */
  navLabel?: string;
  children?: ReactNode;
};

/**
 * shadcn-admin settings frame: heading, separator, a left nav on large
 * screens (a wrapping row of links below lg, no client JS) and the content.
 * Server component.
 */
export function SettingsLayout({
  children,
  currentHref,
  description,
  eyebrow,
  header,
  items,
  navLabel = "Menu pengaturan",
  title,
}: SettingsLayoutProps) {
  return (
    <div className="grid min-w-0 gap-4">
      {header ?? <PageHeader description={description} eyebrow={eyebrow} title={title} />}
      <Separator />
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:gap-12">
        <aside className="min-w-0 lg:w-1/5 lg:shrink-0">
          <nav aria-label={navLabel}>
            <ul className="flex flex-wrap gap-1 lg:flex-col">
              {items.map(({ href, icon: Icon, label }) => {
                const current = href === currentHref;
                return (
                  <li key={href}>
                    <Link
                      aria-current={current ? "true" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground md:min-h-9",
                        current ? "bg-muted text-foreground" : "text-muted-foreground",
                      )}
                      href={href}
                    >
                      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
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
