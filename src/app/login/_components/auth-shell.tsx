import { ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AuthSurface = "platform" | "tenant";

/**
 * Spec 17 §UX-v3.7 public frame: one centered card, 17px body, 48px fields. The Super Admin
 * surface sits on a dark ground with its own badge so it is never mistaken for the gerai login.
 */
export function AuthShell({
  children,
  description,
  footer,
  homeHref,
  surface,
  title,
  wide = false,
}: {
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  homeHref?: string;
  surface: AuthSurface;
  title: string;
  wide?: boolean;
}) {
  const platform = surface === "platform";
  return (
    <main
      className={cn(
        // 17px body (spec 17 §UX-v3.7): one step above the CMS's 15px, for a page read once and slowly.
        "flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-12 text-[1.0625rem]",
        platform ? "bg-foreground" : "bg-background",
      )}
      data-surface={surface}
    >
      <div className={cn("flex w-full flex-col gap-6", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center justify-between gap-3">
          <Link
            className={cn("flex items-center gap-3 rounded-lg", platform ? "text-background" : "text-foreground")}
            href={homeHref ?? "/"}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 items-center justify-center rounded-lg text-sm font-bold",
                platform ? "bg-background text-foreground" : "bg-foreground text-background",
              )}
            >
              GC
            </span>
            <span className="text-lg font-bold">GeraiCUAN</span>
          </Link>
          <span
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
              platform ? "bg-background text-foreground" : "bg-accent text-accent-foreground",
            )}
            data-slot="surface-badge"
          >
            {platform ? <ShieldCheck aria-hidden="true" className="size-4" /> : <Store aria-hidden="true" className="size-4" />}
            {platform ? "Khusus Super Admin" : "Untuk gerai"}
          </span>
        </div>
        <section
          aria-labelledby="auth-title"
          className="flex flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground md:p-8"
        >
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold" id="auth-title">{title}</h1>
            {description ? <div className="text-muted-foreground">{description}</div> : null}
          </header>
          {children}
          {footer ? (
            <nav aria-label="Tautan akun" className="flex flex-col items-start gap-1 border-t pt-4">
              {footer}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}

/** A footer link of the auth card: 44px target, primary colour. */
export function AuthLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline" href={href}>
      {children}
    </Link>
  );
}

/** 48px fields at the auth card's 17px (spec 17 §UX-v3.7). */
export const AUTH_FIELD = "h-12 text-[length:inherit] max-md:h-12 md:text-[length:inherit]";
export const AUTH_LABEL = "text-[length:inherit] font-medium";
export const AUTH_HINT = "text-sm text-muted-foreground";
export const AUTH_ERROR = "text-sm font-medium text-destructive";
