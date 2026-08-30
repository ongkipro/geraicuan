"use client";

import { useEffect, useRef, type ReactNode } from "react";

type AlertRegionProps = {
  children: ReactNode;
  className: string;
  id?: string;
};

export function AlertRegion({ children, className, id }: AlertRegionProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <section className={className} id={id} ref={ref} role="alert" tabIndex={-1}>
      {children}
    </section>
  );
}
