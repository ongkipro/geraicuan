/**
 * T-196: which characters each kind of form field accepts.
 *
 * One module for both sides. The client input lock (`CharacterClassInput`)
 * uses `sanitizeInsertion` so a forbidden character never lands in the field;
 * every Server Action and the CSV import apply `validate` / `characterClassError`
 * because a client lock is bypassable. `validate` never rewrites a value:
 * stored data that breaks a rule (a digit in an old contact name) is refused
 * on save with a message, not silently changed.
 */

export type CharacterClass =
  | "ADDRESS"
  | "BUSINESS_NAME"
  | "FREE_TEXT"
  | "NUMERIC_INTEGER"
  | "PERSON_NAME"
  | "PHONE"
  /** Whole rupiah. Typed as digits only; the server also accepts `1.250.000` grouping. */
  | "RUPIAH";

/**
 * T-199: every code point that only ever belongs to an emoji — pictographs
 * (©, ® and ™ stay usable in a store name), regional-indicator flag halves,
 * skin-tone modifiers, variation selectors, the keycap mark, the zero-width
 * joiner that glues emoji sequences, and tag characters (subdivision flags).
 */
const EMOJI = String.raw`(?:(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE00-\uFE0F\u20E3\u200D\u{E0020}-\u{E007F}])`;
/**
 * A grapheme cluster that is an emoji: it starts with an emoji part, or a
 * keycap or emoji-presentation selector turns its base into one (1️⃣, ©️).
 * A stray modifier or joiner on a plain base (a space, a letter) is not.
 */
const EMOJI_CLUSTER = new RegExp(String.raw`^${EMOJI}|[\u20E3\uFE0F]`, "u");

/** One accepted character per text class; emoji are excluded before this is consulted. */
const ADDRESS_CHARACTER = String.raw`[\p{L}\p{M}\p{N}\p{P} +=°~]`;
const PERSON_NAME_CHARACTER = String.raw`[\p{L}\p{M} .'\u2019,-]`;

/**
 * Whole-value patterns: the server authority. `PHONE` also tolerates the
 * spaces, dashes and parentheses `normalizePartyPhone` strips (`0812-3456 7890`),
 * because that normaliser stays the phone authority; it still refuses a letter.
 * A person name needs a letter and an address a letter or digit, and neither may
 * start with a combining mark that has no base character (T-199).
 */
export const FIELD_CHARACTER_PATTERNS: Readonly<Record<CharacterClass, RegExp>> = {
  ADDRESS: new RegExp(String.raw`^(?:(?!\p{M})(?=.*[\p{L}\p{N}])(?:(?!${EMOJI})${ADDRESS_CHARACTER})+)?$`, "u"),
  BUSINESS_NAME: new RegExp(String.raw`^(?:(?!${EMOJI})[^\p{Cc}\p{Cf}])*$`, "u"),
  FREE_TEXT: /^[^\p{Cc}\p{Cf}]*$/u,
  NUMERIC_INTEGER: /^[0-9]*$/,
  PERSON_NAME: new RegExp(String.raw`^(?:(?!\p{M})(?=.*\p{L})(?:(?!${EMOJI})${PERSON_NAME_CHARACTER})+)?$`, "u"),
  PHONE: /^\+?[0-9 ()-]*$/,
  RUPIAH: /^(?:[0-9]*|[0-9]{1,3}(?:\.[0-9]{3})+)$/,
};

/** Single-character acceptance used while typing or pasting. */
const ALLOWED_CHARACTER: Readonly<Record<CharacterClass, RegExp>> = {
  ADDRESS: new RegExp(`^(?!${EMOJI})${ADDRESS_CHARACTER}$`, "u"),
  BUSINESS_NAME: new RegExp(`^(?!${EMOJI})[^\\p{Cc}\\p{Cf}]$`, "u"),
  FREE_TEXT: /^[^\p{Cc}\p{Cf}]$/u,
  NUMERIC_INTEGER: /^[0-9]$/,
  PERSON_NAME: new RegExp(`^(?!${EMOJI})${PERSON_NAME_CHARACTER}$`, "u"),
  PHONE: /^[0-9]$/,
  RUPIAH: /^[0-9]$/,
};

/** Classes that refuse emoji; their sanitiser drops a whole grapheme cluster, never half of one. */
const EMOJI_FREE_CLASSES: ReadonlySet<CharacterClass> = new Set(["ADDRESS", "BUSINESS_NAME", "PERSON_NAME"]);
/** Classes whose value may not start with a combining mark. */
const BASE_REQUIRED_CLASSES: ReadonlySet<CharacterClass> = new Set(["ADDRESS", "PERSON_NAME"]);
const COMBINING_MARK = /^\p{M}$/u;
const SPACE_SEPARATORS = /\p{Zs}/gu;
const graphemes = new Intl.Segmenter("id", { granularity: "grapheme" });

/**
 * T-199: the one space normaliser. A non-breaking, narrow, ideographic or any
 * other `\p{Zs}` space becomes a plain space, so "Siti\u00A0Aminah" pasted from
 * a chat or exported in a CSV keeps its word boundary on both sides.
 */
export function normalizeSpaceSeparators(value: string) {
  return value.replace(SPACE_SEPARATORS, " ");
}

/**
 * Server-side reading of a submitted text value: space separators become a
 * plain space, runs of spaces collapse to one, and the ends are trimmed.
 */
export function normalizeFieldText(value: string) {
  return normalizeSpaceSeparators(value).replace(/ {2,}/g, " ").trim();
}

const LINE_BREAKS = /[\r\n\t]+/g;

const TEXT_CLASSES: ReadonlySet<CharacterClass> = new Set([
  "ADDRESS",
  "BUSINESS_NAME",
  "FREE_TEXT",
  "PERSON_NAME",
]);

/** The short hint shown under a field when a keystroke or paste was refused. */
export const CHARACTER_CLASS_HINTS: Readonly<Record<CharacterClass, string>> = {
  ADDRESS: "Alamat hanya boleh huruf, angka, spasi, dan tanda baca; emoji tidak dapat dipakai.",
  BUSINESS_NAME: "Emoji dan karakter tersembunyi tidak dapat dipakai.",
  FREE_TEXT: "Karakter tersembunyi tidak dapat dipakai.",
  NUMERIC_INTEGER: "Hanya angka.",
  PERSON_NAME: "Hanya huruf; tanda . ' - , boleh.",
  PHONE: "Hanya angka, boleh diawali +.",
  RUPIAH: "Hanya angka.",
};

const ERROR_SUFFIX: Readonly<Record<CharacterClass, string>> = {
  ADDRESS: "hanya boleh berisi huruf, angka, spasi, dan tanda baca, tanpa emoji.",
  BUSINESS_NAME: "tidak boleh memuat emoji, karakter kontrol, atau karakter tersembunyi.",
  FREE_TEXT: "tidak boleh memuat karakter kontrol atau karakter tersembunyi.",
  NUMERIC_INTEGER: "hanya boleh berisi angka.",
  PERSON_NAME: "hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung.",
  PHONE: "hanya boleh berisi angka, boleh diawali +.",
  RUPIAH: "hanya boleh berisi angka.",
};

/**
 * T-196 owner decision: a sender may be a store ("Toko 88"), so a sender name
 * takes digits; a recipient is a person. A contact holding both roles follows
 * the sender rule, because it must still be usable as a sender.
 */
export function partyNameClass({ isSender }: { isSender: boolean }): CharacterClass {
  return isSender ? "BUSINESS_NAME" : "PERSON_NAME";
}

export function validate(kind: CharacterClass, value: string) {
  return FIELD_CHARACTER_PATTERNS[kind].test(value);
}

/** `null` when `value` fits `kind`; otherwise the Indonesian field error, e.g. "Nama penerima hanya boleh berisi huruf, …". */
export function characterClassError(kind: CharacterClass, label: string, value: string) {
  return validate(kind, value) ? null : `${label} ${ERROR_SUFFIX[kind]}`;
}

/** Text classes turn line breaks and tabs, and every other space separator, into a plain space. */
function normalizeInsertedText(kind: CharacterClass, inserted: string) {
  return TEXT_CLASSES.has(kind) ? normalizeSpaceSeparators(inserted.replace(LINE_BREAKS, " ")) : inserted;
}

/**
 * Cleans text being inserted between `before` and `after`. Line breaks, tabs and
 * non-breaking or other `\p{Zs}` spaces in a text field become a plain space
 * instead of vanishing, so pasted text keeps its word boundaries; a phone keeps
 * a `+` only as its first character. In a class that refuses emoji a whole
 * grapheme cluster holding any emoji part is dropped, so 👍🏽 or 🇮🇩 never
 * leaves an orphan modifier or flag half behind; and a person name or address
 * never starts with a combining mark.
 */
export function sanitizeInsertion(kind: CharacterClass, before: string, inserted: string, after = "") {
  const source = normalizeInsertedText(kind, inserted);
  let result = "";
  for (const { segment } of graphemes.segment(source)) {
    // The per-character check below then drops a stray modifier on a plain base.
    if (EMOJI_FREE_CLASSES.has(kind) && EMOJI_CLUSTER.test(segment)) continue;
    for (const character of segment) {
      if (
        kind === "PHONE"
        && character === "+"
        && before === ""
        && result === ""
        && !after.startsWith("+")
      ) {
        result += character;
      } else if (
        BASE_REQUIRED_CLASSES.has(kind)
        && before === ""
        && result === ""
        && COMBINING_MARK.test(character)
      ) {
        continue;
      } else if (ALLOWED_CHARACTER[kind].test(character)) {
        result += character;
      }
    }
  }
  return result;
}

export function sanitize(kind: CharacterClass, value: string) {
  return sanitizeInsertion(kind, "", value);
}

export type CharacterClassEdit = {
  /** Caret position after the cleaned insertion. */
  caret: number;
  rejected: boolean;
  value: string;
};

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number) {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Applies the class to one edit: only the text that changed between `previous`
 * and `next` is cleaned. Characters already in the field — a stored name that
 * predates this rule — are left exactly as they are for the server to judge.
 */
export function applyCharacterClassEdit(
  kind: CharacterClass,
  previous: string,
  next: string,
): CharacterClassEdit {
  let prefix = 0;
  const limit = Math.min(previous.length, next.length);
  while (prefix < limit && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < limit - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  // Never split a surrogate pair between the kept and the inserted text.
  if (prefix > 0 && isHighSurrogate(next.charCodeAt(prefix - 1))) prefix -= 1;
  if (suffix > 0 && isLowSurrogate(next.charCodeAt(next.length - suffix))) suffix -= 1;

  const before = next.slice(0, prefix);
  const after = next.slice(next.length - suffix);
  const inserted = next.slice(prefix, next.length - suffix);
  const cleaned = sanitizeInsertion(kind, before, inserted, after);
  // A line break or a non-breaking space turned into a space is a normalisation, not a refusal.
  const expected = normalizeInsertedText(kind, inserted);
  return {
    caret: prefix + cleaned.length,
    rejected: cleaned !== expected,
    value: `${before}${cleaned}${after}`,
  };
}
