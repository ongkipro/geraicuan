import { describe, expect, it } from "vitest";

import {
  applyCharacterClassEdit,
  CHARACTER_CLASS_HINTS,
  characterClassError,
  normalizeFieldText,
  partyNameClass,
  sanitize,
  validate,
  type CharacterClass,
} from "@/lib/field-character-classes";

/** T-196: each class accepts what real Indonesian data needs and refuses the rest. */
const CASES: Record<CharacterClass, { accept: string[]; reject: string[] }> = {
  ADDRESS: {
    accept: [
      "Jl. Pajajaran No. 88",
      "Blok C2/5",
      "RT 03/RW 07",
      "Perum Bumi Bekasi Baru Blok C2 No. 5",
      "Ruko #12 (belakang pasar), Kav: 5",
      "Gg. Jend'ral Sudirman",
      "Jalan Kaliurang Km 5-6",
      // T-199: the iOS apostrophe and everyday punctuation found in real addresses and CSV exports.
      "Jl. Ma\u2019ruf No. 3",
      "Blok C&D",
      "km 5+200",
      "Jl. A; No. 5",
      "Blok @5",
      "Ruko \"Sinar Jaya\" Lt_2",
      "Jl. Mawar No. 5 – belakang masjid",
      "12",
      "Jl. Café\u0301",
    ],
    reject: [
      "Jl. Mawar\nNo. 5", "Rumah 🏠 No. 5", "Jl. Mawar ❤️", "Jl. Mawar\u200B No. 5",
      // T-199: flags, skin tones, ZWJ sequences, variation selectors and keycaps.
      "Jl. Mawar 🇮🇩", "Jl. Mawar \u{1F1EE}", "Jl. Mawar \u{1F3FD}", "Jl. Mawar 👍🏽", "Jl. Mawar 👨\u200D👩\u200D👧", "Jl. Mawar\uFE0F", "Blok 1\uFE0F\u20E3",
      // T-199: combining marks with no base, and punctuation with no letter or digit.
      "\u0301\u0301\u0301", "\u0301Jl. Mawar", "-- / --",
    ],
  },
  BUSINESS_NAME: {
    accept: ["Grosir Aksesoris HP 99", "Toko 88", "Kopi Senja & Co.", "Dapur Sambal Bu Tini", "Toko ABC\u00AE", "Merek\u2122 No. 1"],
    reject: [
      "Toko\u202E88", "Toko\u200D88", "Toko\u000088", "Toko\n88", "Toko 88 😀", "Toko ❤️", "Toko 1\uFE0F\u20E3",
      // T-199: flag halves and skin-tone modifiers are emoji too.
      "Toko 🇮🇩", "Toko \u{1F1EE}", "Toko \u{1F3FD}", "Toko 👍🏽", "Toko 88\uFE0E",
    ],
  },
  FREE_TEXT: {
    accept: ["Kaos 2 pcs", "Kain batik tulis Pekalongan 2 m", "Mohon telepon penerima sebelum diantar."],
    reject: ["Kaos\u00AD2", "Kaos\t2 pcs", "Kaos\u2066 2"],
  },
  NUMERIC_INTEGER: {
    accept: ["0", "1250", "100000", ""],
    reject: ["1,5", "1.000", "12a", "-5", " 12", "１２", "1e3"],
  },
  PERSON_NAME: {
    accept: ["I Made Suardana", "Siti Nur'aini", "R.A. Kartini", "Siti Nur\u2019aini", "Rudi Hartono Sitorus", "Anak Agung Gde-Putra", "Nguyễn Văn An", "محمد", "Siti Ma\u2019ruf", "Jose\u0301"],
    reject: [
      "Budi 2", "Budi2", "Rina_Kartika", "Joko@toko", "Siti 😊", "Putri\u200BWulandari", "Ahmad\n", "Dewi #1", "Ani ٣",
      // T-199: emoji parts and combining marks with no base letter.
      "Siti 🇮🇩", "Siti \u{1F3FD}", "Siti\u200DAminah", "Siti\uFE0F",
      "\u0301\u0301\u0301", "\u0301Siti", "' . -",
    ],
  },
  PHONE: {
    accept: ["081234567890", "+6281234567890", "6281234567890", "0812 3456 7890", "0812-3456-7890"],
    reject: ["0812abc", "++62812", "0812+345", "O81234567890", "0812.3456.7890"],
  },
  RUPIAH: {
    accept: ["1250000", "1.250.000", "25.000", "0"],
    reject: ["Rp 25.000", "25,000", "25.00", "1.2500", "25000,50", "25k"],
  },
};

describe("field character classes (T-196)", () => {
  for (const [kind, { accept, reject }] of Object.entries(CASES) as Array<[CharacterClass, (typeof CASES)[CharacterClass]]>) {
    describe(kind, () => {
      it.each(accept)("accepts %j", (value) => {
        expect(validate(kind, value)).toBe(true);
        expect(characterClassError(kind, "Isian", value)).toBeNull();
      });
      it.each(reject)("rejects %j with an Indonesian message", (value) => {
        expect(validate(kind, value)).toBe(false);
        expect(characterClassError(kind, "Isian", value)).toMatch(/^Isian (hanya boleh|tidak boleh)/);
      });
    });
  }

  it("names a sender by the store rule and a recipient by the person rule (owner decision)", () => {
    expect(partyNameClass({ isSender: true })).toBe("BUSINESS_NAME");
    expect(partyNameClass({ isSender: false })).toBe("PERSON_NAME");
    expect(validate(partyNameClass({ isSender: true }), "Toko 88")).toBe(true);
    expect(validate(partyNameClass({ isSender: false }), "Budi 2")).toBe(false);
    expect(CHARACTER_CLASS_HINTS.PERSON_NAME).toBe("Hanya huruf; tanda . ' - , boleh.");
  });

  it("names what a person name may contain", () => {
    expect(characterClassError("PERSON_NAME", "Nama penerima", "Budi 2")).toBe(
      "Nama penerima hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung.",
    );
    expect(characterClassError("NUMERIC_INTEGER", "Berat paket", "1kg")).toBe("Berat paket hanya boleh berisi angka.");
  });

  it("sanitizes typed or pasted text into the class", () => {
    expect(sanitize("NUMERIC_INTEGER", "Rp 1.250.000,-")).toBe("1250000");
    expect(sanitize("RUPIAH", "25k")).toBe("25");
    expect(sanitize("PHONE", "+62 812-3456+7890abc")).toBe("+6281234567890");
    expect(sanitize("PHONE", "0812+")).toBe("0812");
    expect(sanitize("PERSON_NAME", "Budi 2 Santoso!")).toBe("Budi  Santoso");
    expect(sanitize("PERSON_NAME", "Siti Nur'aini")).toBe("Siti Nur'aini");
    expect(sanitize("ADDRESS", "Jl. Mawar\nNo. 5 🏠")).toBe("Jl. Mawar No. 5 ");
    expect(sanitize("ADDRESS", "Jl. Mawar ❤️")).toBe("Jl. Mawar ");
    expect(sanitize("BUSINESS_NAME", "Toko\u202E 88")).toBe("Toko 88");
    expect(sanitize("BUSINESS_NAME", "Toko 88 😀")).toBe("Toko 88 ");
    for (const [kind, { accept }] of Object.entries(CASES) as Array<[CharacterClass, (typeof CASES)[CharacterClass]]>) {
      for (const value of accept) {
        // Server-tolerated phone separators and rupiah grouping are typed without them.
        if (kind === "PHONE" || kind === "RUPIAH") continue;
        expect(sanitize(kind, value), `${kind} ${value}`).toBe(value);
      }
    }
  });

  it("reads every space separator as a plain space, on the client and the server (T-199)", () => {
    // A non-breaking space pasted from a chat keeps the word boundary instead of vanishing.
    expect(sanitize("PERSON_NAME", "Siti\u00A0Aminah")).toBe("Siti Aminah");
    expect(sanitize("ADDRESS", "Jl.\u202FMawar\u3000No. 5")).toBe("Jl. Mawar No. 5");
    expect(applyCharacterClassEdit("PERSON_NAME", "Siti", "Siti\u00A0Aminah")).toEqual({ caret: 11, rejected: false, value: "Siti Aminah" });
    // The server reader normalises, collapses and trims with the same normaliser.
    expect(normalizeFieldText("\u00A0 Siti\u00A0\u00A0 Aminah\u2007")).toBe("Siti Aminah");
    expect(validate("PERSON_NAME", normalizeFieldText("Siti\u00A0Aminah"))).toBe(true);
  });

  it("drops a whole emoji cluster, never leaving an orphan modifier or flag half (T-199)", () => {
    for (const kind of ["ADDRESS", "BUSINESS_NAME", "PERSON_NAME"] as const) {
      for (const emoji of ["👍🏽", "🇮🇩", "👨\u200D👩\u200D👧", "❤️", "1\uFE0F\u20E3", "\u{1F3FD}", "\u{1F1EE}"]) {
        const cleaned = sanitize(kind, `Siti ${emoji} Aminah`);
        expect(cleaned, `${kind} ${emoji}`).toBe("Siti  Aminah");
      }
    }
    expect(applyCharacterClassEdit("BUSINESS_NAME", "Toko ", "Toko 👍🏽")).toEqual({ caret: 5, rejected: true, value: "Toko " });
    // A combining mark with no base character is refused while typing, and kept after a letter.
    expect(sanitize("PERSON_NAME", "\u0301\u0301\u0301")).toBe("");
    expect(applyCharacterClassEdit("ADDRESS", "", "\u0301")).toMatchObject({ rejected: true, value: "" });
    expect(applyCharacterClassEdit("PERSON_NAME", "Jose", "Jose\u0301")).toMatchObject({ rejected: false, value: "Jose\u0301" });
  });

  it("cleans only the inserted text and keeps the caret after it", () => {
    expect(applyCharacterClassEdit("NUMERIC_INTEGER", "12", "12a")).toEqual({ caret: 2, rejected: true, value: "12" });
    expect(applyCharacterClassEdit("NUMERIC_INTEGER", "1200", "12x3400")).toEqual({ caret: 4, rejected: true, value: "123400" });
    expect(applyCharacterClassEdit("PHONE", "0812", "+0812")).toMatchObject({ rejected: false, value: "+0812" });
    expect(applyCharacterClassEdit("PHONE", "+0812", "++0812")).toMatchObject({ rejected: true, value: "+0812" });
    // A stored name that predates the rule is never rewritten by an unrelated edit.
    expect(applyCharacterClassEdit("PERSON_NAME", "Budi 2", "Budi 2a")).toEqual({ caret: 7, rejected: false, value: "Budi 2a" });
    expect(applyCharacterClassEdit("PERSON_NAME", "Budi 2", "Budi ")).toMatchObject({ rejected: false, value: "Budi " });
    // A line break is normalised to a space, not reported as refused.
    expect(applyCharacterClassEdit("ADDRESS", "Jl. Mawar", "Jl. Mawar\n")).toMatchObject({ rejected: false, value: "Jl. Mawar " });
    // Never split an emoji's surrogate pair into a lone half.
    const edit = applyCharacterClassEdit("FREE_TEXT", "a😀", "a😁");
    expect(edit.value).toBe("a😁");
    expect(edit.rejected).toBe(false);
  });

  it("finds the T-189 seed contacts, owners and stores compliant", async () => {
    const { readFile } = await import("node:fs/promises");
    const seed = await readFile(new URL("../scripts/seed-local-dev-users.mjs", import.meta.url), "utf8");
    const contactBlock = seed.slice(seed.indexOf("const contactDefinitions = ["), seed.indexOf("const contacts = contactDefinitions"));
    const contactNames = [...contactBlock.matchAll(/^\s*\[\d+, "([^"]+)"/gm)].map((match) => match[1]);
    const addressPairs = [...contactBlock.matchAll(/\["([^"]+)", "([^"]+)", "[A-Za-z]+"\]/g)];
    const owners = [...seed.matchAll(/ownerName: "([^"]+)"/g)].map((match) => match[1]);
    const stores = [...seed.matchAll(/storeName: "([^"]+)"/g)].map((match) => match[1]);
    const contents = [...seed.matchAll(/\{ content: "([^"]+)"/g)].map((match) => match[1]);
    expect(contactNames.length).toBeGreaterThan(20);
    expect(addressPairs.length).toBeGreaterThan(20);
    expect(owners.length).toBeGreaterThan(2);
    for (const name of [...contactNames, ...owners]) expect(validate("PERSON_NAME", name), name).toBe(true);
    for (const [, label, street] of addressPairs) {
      expect(validate("BUSINESS_NAME", label), label).toBe(true);
      expect(validate("ADDRESS", street), street).toBe(true);
    }
    for (const value of [...stores, ...contents]) expect(validate("FREE_TEXT", value), value).toBe(true);
  });
});
