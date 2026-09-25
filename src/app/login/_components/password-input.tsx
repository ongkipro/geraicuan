"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type Ref } from "react";

import { Input } from "@/components/ui/input";

/**
 * A password field with a visible, labelled show/hide control (PR-62). The
 * toggle is a real 48px button outside the input, so it is reachable by
 * keyboard and announced with its state.
 */
export function PasswordInput({
  id,
  inputRef,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { id: string; inputRef?: Ref<HTMLInputElement> }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-password">
      <Input {...props} id={id} ref={inputRef} type={visible ? "text" : "password"} />
      <button
        aria-controls={id}
        aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={visible}
        className="auth-password-toggle"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        <span aria-hidden="true">{visible ? "Sembunyikan" : "Tampilkan"}</span>
      </button>
    </div>
  );
}
