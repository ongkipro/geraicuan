"use client";

import type { MouseEvent, ReactNode } from "react";

type SkipLinkProps = {
  children: ReactNode;
  className: string;
  targetId: string;
};

export function SkipLink({ children, className, targetId }: SkipLinkProps) {
  function moveFocusToMain(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    target.focus();
    target.scrollIntoView({ block: "start" });
  }

  return (
    <a className={className} href={`#${targetId}`} onClick={moveFocusToMain}>
      {children}
    </a>
  );
}
