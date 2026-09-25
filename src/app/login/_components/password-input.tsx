"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type Ref } from "react";

import { Input } from "@/components/ui/input";

/**
 * A password field with a labelled show/hide control (PR-62). V-27 (T-202): the
 * toggle is an icon button inside the field's right edge, so the 48px input keeps
 * its full width at 390px; it stays a real 44px button, reachable by keyboard and
 * announced with its state. The `!` utilities win over the unlayered `.auth-field`
 * input padding in globals.css.
 */
export function PasswordInput({
  id,
  inputRef,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { id: string; inputRef?: Ref<HTMLInputElement> }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} className="pr-12!" id={id} ref={inputRef} type={visible ? "text" : "password"} />
      <button
        aria-controls={id}
        aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0.5 my-auto inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}
