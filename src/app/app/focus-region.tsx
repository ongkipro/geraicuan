"use client";

import { useEffect, useRef, type ReactNode } from "react";

type FocusRegionProps = {
  children: ReactNode;
  className: string;
  role: "status";
};

export function FocusRegion({ children, className, role }: FocusRegionProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return <section className={className} ref={ref} role={role} tabIndex={-1}>{children}</section>;
}
