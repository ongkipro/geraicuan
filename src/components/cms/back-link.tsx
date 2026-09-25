import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * T-206 (owner reference): the way back sits above the page eyebrow as a text link, not as
 * a header button, leaving the header actions to the page's own work. 44px target on touch.
 * Shared by the shipment, label and contact detail pages; a candidate for `src/components/cms`.
 */
export function BackLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline md:min-h-8" href={href}>
      <ArrowLeft aria-hidden="true" className="size-4" />
      {children}
    </Link>
  );
}
