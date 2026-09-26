import { Printer, ReceiptText, Send, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AuthSurface = "platform" | "tenant";

const CORES = [
  { icon: Send, label: "Kirim" },
  { icon: Printer, label: "Cetak resi" },
  { icon: ReceiptText, label: "Invoice" },
] as const;

/**
 * D-21 (T-225): the desktop visual panel of Masuk and Daftar, left of the card at ≥ 1024px
 * only. Brand, one headline, the three cores and a static nota mock built from markup — no
 * image, no marketing paragraph. The mock is decoration (`aria-hidden`); the cores list is read.
 */
function AuthVisualPanel({ platform }: { platform: boolean }) {
  return (
    <aside
      aria-label="GeraiCUAN"
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col gap-10 p-12 text-primary-foreground lg:flex lg:w-[44%] lg:max-w-[40rem] xl:p-16",
        platform ? "border-r border-background/15 bg-foreground" : "bg-primary",
      )}
      data-slot="auth-visual"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 items-center justify-center rounded-lg bg-primary-foreground text-sm font-bold",
            platform ? "text-foreground" : "text-primary",
          )}
        >
          GC
        </span>
        <span className="text-lg font-bold">Gerai<span className="text-brand-light">CUAN</span></span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="flex flex-col gap-4">
          {platform ? null : (
            <span className="inline-flex h-7 w-fit items-center rounded-full bg-primary-foreground/15 px-3 text-xs font-semibold">Gratis</span>
          )}
          <p className="max-w-md text-[2rem] leading-tight font-bold">
            {platform ? "Pantau gerai, pendaftaran, dan audit platform." : "Satu tempat untuk semua kiriman gerai Anda."}
          </p>
        </div>
        <ul aria-label="Tiga fitur utama" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg font-semibold">
          {CORES.map(({ icon: Icon, label }, index) => (
            <li className="flex items-center gap-3" key={label}>
              {index > 0 ? <span aria-hidden="true" className="text-primary-foreground/60">·</span> : null}
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15">
                  <Icon className="size-5" />
                </span>
                {label}
              </span>
            </li>
          ))}
        </ul>
        <NotaMock />
      </div>
    </aside>
  );
}

/** A small static nota: the invoice number derives from the shipment number (DATA-14). */
function NotaMock() {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-xs rotate-[-2deg] rounded-xl bg-card p-5 text-sm text-card-foreground shadow-xl"
      data-slot="auth-nota-mock"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-dashed pb-3">
        <span className="font-bold">Sekar Batik</span>
        <span className="font-mono text-xs text-muted-foreground">INV-SBN-10001</span>
      </div>
      <div className="flex flex-col gap-1.5 border-b border-dashed py-3">
        <div className="flex justify-between gap-3"><span className="text-muted-foreground">Nomor kiriman</span><span className="font-mono font-semibold">SBN-10001</span></div>
        <div className="flex justify-between gap-3"><span className="text-muted-foreground">Ekspedisi</span><span className="font-semibold">JNE · REG</span></div>
      </div>
      <div className="flex justify-between gap-3 pt-3 font-bold"><span>Total ongkir</span><span className="tabular-nums">Rp18.000</span></div>
    </div>
  );
}

/**
 * Spec 17 §UX-v3.7/§UX-v3.10 public frame: one card, 17px body, 48px fields. The Super Admin
 * surface sits on a dark ground with its own badge so it is never mistaken for the gerai login.
 * `visual` (Masuk, Daftar) adds the desktop panel on the left at ≥ 1024px; below that only the
 * card shows.
 */
export function AuthShell({
  children,
  description,
  footer,
  homeHref,
  surface,
  title,
  visual = false,
  wide = false,
}: {
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  homeHref?: string;
  surface: AuthSurface;
  title: string;
  visual?: boolean;
  wide?: boolean;
}) {
  const platform = surface === "platform";
  const column = (
    <div className={cn("flex w-full flex-col gap-6", wide ? "max-w-2xl" : "max-w-md")}>
      <div className={cn("flex items-center justify-between gap-3", visual && "lg:justify-end")}>
        <Link
          className={cn("flex items-center gap-3 rounded-lg", platform ? "text-background" : "text-foreground", visual && "lg:hidden")}
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
          <span className="text-lg font-bold">Gerai<span className={platform ? "text-brand-light" : "text-brand-strong"}>CUAN</span></span>
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
  );
  return (
    <main
      className={cn(
        // 17px body (spec 17 §UX-v3.7): one step above the CMS's 15px, for a page read once and slowly.
        "flex min-h-svh text-[1.0625rem]",
        platform ? "bg-foreground" : "bg-background",
      )}
      data-surface={surface}
    >
      {visual ? <AuthVisualPanel platform={platform} /> : null}
      <div className="flex min-h-svh flex-1 flex-col items-center justify-center gap-6 px-4 py-12">{column}</div>
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
