import { ArrowRight, Megaphone } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";

/**
 * T-244/T-256: the Dasbor's one line to Info terbaru while this member has unread
 * announcements. Same words as the sidebar badge's name ("N info baru", `unreadInfoLabel`) and its primary pill;
 * one row from `sm`, the link under the text on a phone. Renders nothing at 0.
 */
export function UnreadInfoNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Alert className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid="dashboard-info-notice" role="status">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Megaphone aria-hidden="true" className="size-4 shrink-0 text-primary" />
        {/* The sidebar badge's pill; the sentence reads "N info baru" as one phrase. */}
        <span className="font-semibold text-foreground">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
            {count > 99 ? "99+" : count}
          </span>{" "}
          info baru
        </span>
        <span className="text-muted-foreground max-sm:hidden">dari tim GeraiCUAN</span>
      </span>
      <Link
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline md:min-h-8 [&_svg]:size-4"
        href="/app/info"
      >
        Lihat info terbaru
        <ArrowRight aria-hidden="true" />
      </Link>
    </Alert>
  );
}
