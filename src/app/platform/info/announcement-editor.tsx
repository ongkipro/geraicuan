"use client";

import { ArrowDownToLine, Pencil, Plus } from "lucide-react";
import { useActionState, useId, useRef, useState } from "react";

import { type AnnouncementActionState, saveAnnouncement, unpublishAnnouncement } from "@/app/platform/info/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CharacterClassInput } from "@/components/ui/character-class-input";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_TITLE_MAX,
  type AnnouncementCategory,
} from "@/lib/announcements";

const initialState: AnnouncementActionState = {};
const number = new Intl.NumberFormat("id-ID");

export type EditableAnnouncement = {
  body: string;
  category: AnnouncementCategory;
  id: string;
  pinned: boolean;
  published: boolean;
  title: string;
};

function Result({ className, state }: { className?: string; state: AnnouncementActionState }) {
  if (!state.message || state.errors) return null;
  const ok = state.outcome === "published" || state.outcome === "saved" || state.outcome === "unpublished";
  return (
    <p className={cn(ok ? "text-xs text-muted-foreground" : "text-xs font-medium text-destructive", className)} role={ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}

/**
 * T-244: create or edit one announcement in a dialog — title, category, plain-text body,
 * pinned switch — then "Tayangkan" (publish now) or "Simpan draf". Fields are controlled so a
 * refused save keeps what was typed. Closing after a save shows the result beside the trigger.
 */
/** `inline` (row footers): the wrapper dissolves into the footer's flex row and the result takes its own line below the buttons. */
const WRAPPER = "flex flex-col items-end gap-1";
const INLINE_RESULT = "order-last basis-full text-right";

export function AnnouncementEditor({ announcement, inline = false }: { announcement?: EditableAnnouncement; inline?: boolean }) {
  const [state, action, pending] = useActionState(saveAnnouncement, initialState);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [category, setCategory] = useState<string>(announcement?.category ?? "");
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [handled, setHandled] = useState<string | undefined>(undefined);
  const base = useId();
  const ids = { body: `${base}-body`, category: `${base}-category`, pinned: `${base}-pinned`, title: `${base}-title` };
  const errors = state.errors ?? {};

  // A successful save closes the dialog (and clears a new-announcement form) once per result,
  // adjusted during render rather than in an effect.
  if (state.resultToken && handled !== state.resultToken) {
    setHandled(state.resultToken);
    if (state.outcome === "published" || state.outcome === "saved") {
      setOpen(false);
      if (!announcement) {
        setTitle("");
        setBody("");
        setCategory("");
        setPinned(false);
      }
    }
  }

  // Spec 10 §4.11: every field keeps room for its inline error, so a refused save does not shift the dialog.
  const error = (key: keyof typeof errors) => (
    <div className="min-h-5"><FieldError id={`${ids[key]}-error`}>{errors[key]}</FieldError></div>
  );

  return (
    <div className={inline ? "contents" : WRAPPER}>
      <Dialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
        <DialogTrigger asChild>
          {announcement ? (
            <Button aria-label={`Ubah ${announcement.title}`} type="button" variant="outline">
              <Pencil aria-hidden="true" data-icon="inline-start" />
              Ubah
            </Button>
          ) : (
            <Button type="button">
              <Plus aria-hidden="true" data-icon="inline-start" />
              Buat info
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
          <form action={action} aria-busy={pending} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{announcement ? "Ubah info" : "Buat info"}</DialogTitle>
              <DialogDescription>Tampil di menu Info terbaru semua gerai. Isi berupa teks biasa; baris baru dipertahankan.</DialogDescription>
            </DialogHeader>
            {announcement ? <input name="id" type="hidden" value={announcement.id} /> : null}
            <Field className="gap-2" data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor={ids.title}>Judul</FieldLabel>
              <CharacterClassInput
                aria-describedby={errors.title ? `${ids.title}-error` : undefined}
                characterClass="FREE_TEXT"
                aria-invalid={errors.title ? true : undefined}
                id={ids.title}
                maxLength={ANNOUNCEMENT_TITLE_MAX}
                name="title"
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
              {error("title")}
            </Field>
            <Field className="gap-2" data-invalid={Boolean(errors.category)}>
              <FieldLabel htmlFor={ids.category}>Kategori</FieldLabel>
              <input name="category" type="hidden" value={category} />
              <Select onValueChange={setCategory} value={category}>
                <SelectTrigger
                  aria-describedby={errors.category ? `${ids.category}-error` : undefined}
                  aria-invalid={errors.category ? true : undefined}
                  className="w-full sm:w-60"
                  id={ids.category}
                >
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {ANNOUNCEMENT_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>{ANNOUNCEMENT_CATEGORY_LABEL[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error("category")}
            </Field>
            <Field className="gap-2" data-invalid={Boolean(errors.body)}>
              <FieldLabel htmlFor={ids.body}>Isi</FieldLabel>
              <Textarea
                aria-describedby={`${ids.body}-count${errors.body ? ` ${ids.body}-error` : ""}`}
                aria-invalid={errors.body ? true : undefined}
                className="min-h-40"
                id={ids.body}
                maxLength={ANNOUNCEMENT_BODY_MAX}
                name="body"
                onChange={(event) => setBody(event.target.value)}
                required
                value={body}
              />
              <FieldDescription className="tabular-nums" id={`${ids.body}-count`}>
                {number.format(body.length)} / {number.format(ANNOUNCEMENT_BODY_MAX)} karakter
              </FieldDescription>
              {error("body")}
            </Field>
            <Field className="rounded-xl bg-tile p-4 has-[>[data-slot=field-content]]:items-center" orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={ids.pinned}>Sematkan di atas</FieldLabel>
                <FieldDescription>Info yang disematkan tampil paling atas di semua gerai.</FieldDescription>
              </FieldContent>
              <Switch checked={pinned} id={ids.pinned} name="pinned" onCheckedChange={setPinned} />
            </Field>
            {state.message && (state.errors || state.outcome === "denied" || state.outcome === "error" || state.outcome === "invalid") ? (
              <p className="text-sm font-medium text-destructive" role="alert">{state.message}</p>
            ) : null}
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">Batal</Button>
              </DialogClose>
              <Button disabled={pending} name="intent" type="submit" value="draft" variant="outline">
                {announcement?.published ? "Turunkan & simpan draf" : "Simpan draf"}
              </Button>
              <Button disabled={pending} name="intent" type="submit" value="publish">
                {pending ? "Menyimpan…" : announcement?.published ? "Simpan & tetap tayang" : "Tayangkan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {open ? null : <Result className={inline ? INLINE_RESULT : undefined} state={state} />}
    </div>
  );
}

/** T-244: takes a published announcement back to draft after a confirmation naming it. */
export function UnpublishAnnouncement({ id, inline = false, title }: { id: string; inline?: boolean; title: string }) {
  const [state, action, pending] = useActionState(unpublishAnnouncement, initialState);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className={inline ? "contents" : WRAPPER}>
      <form action={action} className="hidden" ref={formRef}>
        <input name="id" type="hidden" value={id} />
      </form>
      <AlertDialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
        <AlertDialogTrigger asChild>
          <Button aria-label={`Turunkan ${title}`} disabled={pending} type="button" variant="outline">
            <ArrowDownToLine aria-hidden="true" data-icon="inline-start" />
            {pending ? "Menurunkan…" : "Turunkan"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turunkan “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Info ini hilang dari menu Info terbaru semua gerai dan kembali menjadi draf. Tindakan ini tercatat di jejak audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button disabled={pending} onClick={() => { setOpen(false); formRef.current?.requestSubmit(); }} type="button">
              Ya, turunkan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Result className={inline ? INLINE_RESULT : undefined} state={state} />
    </div>
  );
}
