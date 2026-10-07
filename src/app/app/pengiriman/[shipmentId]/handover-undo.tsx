"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { undoShipmentHandoverAction } from "@/app/app/label/handover-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * T-267 "Batalkan penandaan": both tenant roles, only while Mengantar has not reported the pickup
 * scan (the page renders it only then; the server checks again under a lock). Recorded as an
 * UNDONE event — the handover stays in the history, the parcel returns to Siap diserahkan.
 * L5: stays mounted after the undo (`canUndo` false) so its outcome line is still shown.
 */
export function HandoverUndoButton({ canUndo, publicReference, shipmentId }: { canUndo: boolean; publicReference: string; shipmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => startTransition(async () => {
    try {
      const result = await undoShipmentHandoverAction(shipmentId);
      if (!result.ok) {
        setMessage({ error: true, text: result.error });
        setOpen(false);
        router.refresh();
        return;
      }
      setMessage({ error: false, text: result.message });
      setOpen(false);
      router.refresh();
    } catch {
      setMessage({ error: true, text: "Pembatalan tidak dapat dicatat. Coba lagi." });
    }
  });

  if (!canUndo && !message) return null;
  return (
    <span className="flex flex-col items-start gap-1">
      {canUndo ? <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button className="max-md:h-11" size="sm" type="button" variant="outline">
            <Undo2 aria-hidden="true" />
            Batalkan penandaan
          </Button>
        </DialogTrigger>
        <DialogContent className="gap-6 p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Batalkan penandaan diserahkan?</DialogTitle>
            <DialogDescription>
              Paket <span className="font-mono">{publicReference}</span> kembali ke Siap diserahkan. Penandaan dan pembatalannya tetap tercatat.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6 px-6">
            <Button onClick={() => setOpen(false)} type="button" variant="outline">Kembali</Button>
            <Button disabled={pending} onClick={confirm} type="button" variant="destructive">
              {pending ? "Membatalkan…" : "Batalkan penandaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog> : null}
      {message ? <span className={message.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={message.error ? "alert" : "status"}>{message.text}</span> : null}
    </span>
  );
}
