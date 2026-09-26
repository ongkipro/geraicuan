"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { issueBatchInvoices } from "@/app/app/label/cetak/actions";
import { Button } from "@/components/ui/button";

/** Issues the missing invoices of the batch on an explicit click, then re-reads the view. */
export function IssueBatchInvoicesButton({ numbers }: { numbers: number[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={pending}
        onClick={() => startTransition(async () => {
          setFailed(false);
          try {
            await issueBatchInvoices(numbers);
            router.refresh();
          } catch {
            setFailed(true);
          }
        })}
        type="button"
      >
        <FileText aria-hidden="true" />
        {pending ? "Menerbitkan invoice…" : `Terbitkan ${numbers.length} invoice`}
      </Button>
      {failed ? <span className="text-sm text-destructive" role="alert">Invoice belum dapat diterbitkan. Coba lagi.</span> : null}
    </div>
  );
}
