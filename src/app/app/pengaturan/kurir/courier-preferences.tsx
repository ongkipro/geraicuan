"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { saveCourierPreferences, type CourierPreferencesActionState } from "@/app/app/pengaturan/actions";
import { CourierLogo } from "@/components/app/courier-logo";
import { DataCard } from "@/components/app/data-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { SELECTABLE_COURIERS } from "@/lib/gerai-settings";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { cn } from "@/lib/utils";

const FORM_ID = "courier-preferences-form";

/**
 * T-243 Pengaturan → Mitra kurir: one switch per Mengantar courier. A switched-off courier
 * is left out of Cek tarif and Buat kiriman; shipments already made are untouched. At least
 * one stays on (the server refuses otherwise).
 */
export function CourierPreferences({ disabled }: { disabled: readonly string[] }) {
  const [state, formAction, pending] = useActionState<CourierPreferencesActionState, FormData>(saveCourierPreferences, {});
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set(disabled));
  const resultRef = useRef<HTMLDivElement>(null);
  const activeCount = SELECTABLE_COURIERS.filter((courier) => !off.has(courier)).length;

  useEffect(() => {
    if (state.resultToken) resultRef.current?.focus();
  }, [state.resultToken]);

  const toggle = (courier: string, on: boolean) => setOff((current) => {
    const next = new Set(current);
    if (on) next.delete(courier);
    else next.add(courier);
    return next;
  });

  return (
    <DataCard
      count={activeCount}
      description="Kurir yang dimatikan tidak muncul di Cek tarif dan Buat kiriman. Kiriman yang sudah dibuat tidak berubah."
      footer={(
        <Button className="ml-auto" disabled={pending || activeCount === 0} form={FORM_ID} type="submit">
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      )}
      title="Mitra kurir"
    >
      {/* Hidden values only, as on Informasi label: a form reset must not revert the switches. */}
      <form action={formAction} className="hidden" id={FORM_ID}>
        {SELECTABLE_COURIERS.map((courier) => (
          <input key={courier} name={`kurir.${courier}`} type="hidden" value={off.has(courier) ? "0" : "1"} />
        ))}
      </form>
      {state.error ? (
        <Alert className="outline-none" ref={resultRef} role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>Pilihan kurir belum tersimpan</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : state.saved ? (
        <Alert className="outline-none" ref={resultRef} role="status" tabIndex={-1}>
          <AlertTitle>Pilihan kurir disimpan</AlertTitle>
          <AlertDescription>Cek tarif dan Buat kiriman berikutnya hanya menawarkan kurir yang aktif.</AlertDescription>
        </Alert>
      ) : activeCount === 0 ? (
        <Alert role="status" variant="destructive">
          <AlertTitle>Aktifkan minimal satu kurir</AlertTitle>
          <AlertDescription>Tanpa kurir aktif, Cek tarif dan Buat kiriman tidak dapat menawarkan layanan.</AlertDescription>
        </Alert>
      ) : null}
      <ul aria-label="Kurir Mengantar" className="grid gap-3 sm:grid-cols-2">
        {SELECTABLE_COURIERS.map((courier) => {
          const id = `kurir-${courier}`;
          const on = !off.has(courier);
          return (
            <li className="rounded-xl bg-tile p-4 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring" data-on={on} key={courier}>
              <Field className="has-[>[data-slot=field-content]]:items-center" orientation="horizontal">
                <FieldContent className="flex-row items-center gap-3">
                  <span className="flex h-8 w-16 shrink-0 items-center justify-center">
                    <CourierLogo className={cn("max-h-8 max-w-16 transition-[filter,opacity] motion-reduce:transition-none", !on && "opacity-50 grayscale")} courier={courier} decorative />
                  </span>
                  <span className="grid gap-0.5">
                    <FieldLabel htmlFor={id}>{courierDisplayName(courier)}</FieldLabel>
                    <span className="text-xs text-muted-foreground">{on ? "Ditawarkan" : "Tidak ditawarkan"}</span>
                  </span>
                </FieldContent>
                <Switch
                  checked={on}
                  className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                  id={id}
                  onCheckedChange={(next) => toggle(courier, next)}
                />
              </Field>
            </li>
          );
        })}
      </ul>
    </DataCard>
  );
}
