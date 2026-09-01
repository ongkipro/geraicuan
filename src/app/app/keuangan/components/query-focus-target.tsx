"use client";

import { useEffect } from "react";

export function QueryFocusTarget({ targetId }: { targetId: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center" });
  }, [targetId]);
  return null;
}
