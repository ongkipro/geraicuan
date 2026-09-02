"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

export type LoginDestination = "/login/super-admin" | "/login/tenant";

type SignOutRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok">>;

export async function completeCmsSignOut(
  request: SignOutRequest,
  navigate: (destination: LoginDestination) => void,
  destination: LoginDestination,
) {
  const response = await request("/api/auth/sign-out", {
    body: "{}",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("CMS sign-out request failed.");
  }

  navigate(destination);
}

export function SignOutControl({
  destination,
  onSignedOut,
}: {
  destination: LoginDestination;
  onSignedOut: (destination: LoginDestination) => void;
}) {
  const errorId = useId();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setError(false);
    setPending(true);

    try {
      await completeCmsSignOut(
        fetch,
        onSignedOut,
        destination,
      );
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="cms-signout">
      <Button
        aria-describedby={error ? errorId : undefined}
        className="cms-signout-button min-h-11"
        disabled={pending}
        onClick={signOut}
        type="button"
        variant="outline"
      >
        {pending ? "Mengakhiri sesi…" : "Keluar"}
      </Button>
      {error ? (
        <p className="cms-control-error" id={errorId} role="alert">
          Sesi belum dapat diakhiri. Coba lagi.
        </p>
      ) : null}
    </div>
  );
}
