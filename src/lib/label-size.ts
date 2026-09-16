/**
 * T-176 thermal label sizes. 10 × 15 cm is the default: a 10 × 10 cm package label
 * above a 10 × 5 cm sender stub, cut apart at exactly 100 mm. 10 × 10 cm prints the
 * package label alone.
 */
export const LABEL_SIZES = {
  "10x15": { heightMm: 150, name: "10 × 15 cm", pageName: "label-100x150", withStub: true },
  "10x10": { heightMm: 100, name: "10 × 10 cm", pageName: "label-100x100", withStub: false },
} as const;

export type LabelSize = keyof typeof LABEL_SIZES;

export const DEFAULT_LABEL_SIZE: LabelSize = "10x15";

/** Where the cut line sits, measured from the top of the sheet. */
export const LABEL_CUT_MM = 100;

/**
 * Legibility floor for a 203 dpi thermal head (8 dots per mm, 1 dot = 0.125 mm).
 * Asserted in the browser by `scripts/ui-audit/thermal-label.mjs`.
 */
export const THERMAL = {
  /** No text on the sheet below 7 pt (≈2.47 mm em, ≈19.7 dots). */
  minFontPt: 7,
  /** Code 128 narrow module: 2 dots. */
  barcodeModuleMm: 0.25,
  /** Nothing within 2 mm of the cut line on either side except the line itself. */
  cutKeepOutMm: 2,
  /** Cut line: 2 CSS px dashed (0.53 mm, 4 dots); Chrome snaps borders to whole px. */
  cutRulePx: 2,
  /** Bar heights: the package label is scanned at arm's length, the stub at a counter. */
  packageBarHeightMm: 10,
  stubBarHeightMm: 9,
  /** Printable width inside the 3 mm side padding. */
  contentWidthMm: 94,
} as const;

export function parseLabelSize(value: unknown): LabelSize {
  return value === "10x15" || value === "10x10" ? value : DEFAULT_LABEL_SIZE;
}

export function labelSizeStorageKey(operatorId: string) {
  return `geraicuan.label-size.${operatorId}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Storage can be absent, blocked or throwing (private mode, disabled site data). */
export function readStoredLabelSize(storage: () => StorageLike | undefined, operatorId: string): LabelSize {
  try {
    return parseLabelSize(storage()?.getItem(labelSizeStorageKey(operatorId)));
  } catch {
    return DEFAULT_LABEL_SIZE;
  }
}

export function writeStoredLabelSize(storage: () => StorageLike | undefined, operatorId: string, size: LabelSize) {
  try {
    storage()?.setItem(labelSizeStorageKey(operatorId), size);
  } catch {
    // The choice still applies for this page; it just is not remembered.
  }
}
