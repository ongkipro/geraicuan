"use client";

import { useEffect } from "react";

export function HashFocusTarget({ targetId }: { targetId: string }) {
  useEffect(() => {
    const moveToTarget = () => {
      if (decodeURIComponent(window.location.hash.slice(1)) !== targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    };
    const frame = window.requestAnimationFrame(moveToTarget);
    window.addEventListener("hashchange", moveToTarget);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", moveToTarget);
    };
  }, [targetId]);

  return null;
}
