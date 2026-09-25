"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type Ref } from "react";

import { AUTH_FIELD } from "@/app/login/_components/auth-shell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A 48px password field with a labelled show/hide toggle inside its right edge (a real 44px
 * button, keyboard reachable, its state announced through `aria-pressed`).
 */
export function PasswordInput({
  className,
  id,
  inputRef,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { id: string; inputRef?: Ref<HTMLInputElement> }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} className={cn(AUTH_FIELD, "pr-12", className)} id={id} ref={inputRef} type={visible ? "text" : "password"} />
      <button
        aria-controls={id}
        aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0.5 my-auto inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-5"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}
