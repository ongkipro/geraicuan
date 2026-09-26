"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { issueShipmentInvoice } from "@/app/app/invoice/actions";
import type { IssueShipmentInvoiceResult } from "@/db/shipment-invoice-repository";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** A refusal code in words; a switch rather than a status-keyed map (the one status-label map lives in shipment-queue). */
function refusalMessage(code: Extract<IssueShipmentInvoiceResult, { ok: false }>["code"]) {
  switch (code) {
    case "CANCELLED": return "Mengantar melaporkan kiriman ini dibatalkan, jadi invoice tidak diterbitkan.";
    case "NOT_FOUND": return "Kiriman tidak ditemukan.";
    case "NOT_ISSUED": return "Invoice terbit setelah resi terbit.";
  }
}

/**
 * PR-76: issues the shipment's one invoice (the action returns the existing one on a
 * repeat), then re-reads the server-rendered page. A retry after an error is safe.
 */
export function IssueInvoiceButton({
  children,
  className,
  icon,
  shipmentNumber,
}: {
  children: string;
  className?: string;
  icon?: ReactNode;
  shipmentNumber: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <div>
        <Button
          className={className}
          disabled={pending}
          onClick={() => startTransition(async () => {
            setError(null);
            try {
              const result = await issueShipmentInvoice(shipmentNumber);
              if (result.ok) router.refresh();
              else setError(refusalMessage(result.code));
            } catch {
              setError("Invoice belum dapat diterbitkan. Coba lagi.");
            }
          })}
          type="button"
        >
          {icon}
          {pending ? "Menerbitkan invoice…" : children}
        </Button>
      </div>
      {error ? (
        <Alert role="alert" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Invoice belum terbit</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
