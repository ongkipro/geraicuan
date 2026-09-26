"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_LABEL_SIZE, type LabelSize } from "@/lib/label-size";

/**
 * T-243: what a printed label needs of the gerai brand — the authenticated logo URL, the
 * catatan resi and the gerai's default label size. The label, batch and Informasi label
 * pages provide it from their tenant transaction (`loadPrintBrand`). An invoice does not
 * read it: it prints the logo version recorded at issuance (T-247);
 * without a provider nothing is added, so the sheets print exactly as before T-243.
 */
export type GeraiBrand = {
  defaultLabelSize: LabelSize;
  logoSrc: string | null;
  note: string | null;
};

export const NO_GERAI_BRAND: GeraiBrand = { defaultLabelSize: DEFAULT_LABEL_SIZE, logoSrc: null, note: null };

const GeraiBrandContext = createContext<GeraiBrand>(NO_GERAI_BRAND);

export function GeraiBrandProvider({ children, value }: { children?: ReactNode; value: GeraiBrand }) {
  return <GeraiBrandContext.Provider value={value}>{children}</GeraiBrandContext.Provider>;
}

export function useGeraiBrand() {
  return useContext(GeraiBrandContext);
}
