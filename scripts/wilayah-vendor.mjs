// T-245 (DATA-22): refresh the vendored wilayah reference from pinned upstream checkouts.
//
//   node scripts/wilayah-vendor.mjs <cahyadsn/wilayah checkout> <cahyadsn/wilayah_kodepos checkout> "<decree text>"
//
// Converts `db/wilayah.sql` (every level, code + name) and `json/wilayah_kodepos.min.json`
// (level-4 code → kode pos) into two compact gzip TSV files under data/wilayah/, copies both MIT
// licences, and writes SOURCE.json with the upstream commits, the upstream file checksums, the
// vendored file checksums and the published counts. `npm run wilayah:import` refuses data whose
// checksums or counts differ. Offline: it reads local checkouts only.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { buildWilayahRows } from "../src/lib/wilayah.ts";

const [wilayahRoot, kodeposRoot, decree] = process.argv.slice(2);
if (!wilayahRoot || !kodeposRoot || !decree) {
  throw new Error("usage: wilayah-vendor.mjs <wilayah checkout> <wilayah_kodepos checkout> <decree text>");
}
const target = fileURLToPath(new URL("../data/wilayah/", import.meta.url));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const commitOf = (root) => execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const wilayahSql = await readFile(join(wilayahRoot, "db/wilayah.sql"));
const kodeposJson = await readFile(join(kodeposRoot, "json/wilayah_kodepos.min.json"));

const names = [];
for (const match of wilayahSql.toString("utf8").matchAll(/\('([0-9.]+)',\s*'((?:[^']|'')*)'\)/g)) {
  names.push([match[1], match[2].replace(/''/g, "'")]);
}
const postal = Object.entries(JSON.parse(kodeposJson.toString("utf8")));

const wilayahCommit = commitOf(wilayahRoot);
const kodeposCommit = commitOf(kodeposRoot);
const decreeNumber = decree.match(/300\.2\.2-(\d+)/)?.[1] ?? "unknown";
const datasetVersion = `kepmendagri-${decreeNumber}+wilayah@${wilayahCommit.slice(0, 7)}+kodepos@${kodeposCommit.slice(0, 7)}`;

// Validate before writing anything: the same rules the import applies.
const { report } = buildWilayahRows(names, postal, datasetVersion);

const wilayahTsv = Buffer.from(`${names.map(([code, name]) => `${code}\t${name}`).join("\n")}\n`, "utf8");
const kodeposTsv = Buffer.from(`${postal.map(([code, zip]) => `${code}\t${zip}`).join("\n")}\n`, "utf8");
const wilayahGz = gzipSync(wilayahTsv, { level: 9 });
const kodeposGz = gzipSync(kodeposTsv, { level: 9 });

await mkdir(target, { recursive: true });
await writeFile(join(target, "wilayah.tsv.gz"), wilayahGz);
await writeFile(join(target, "kodepos.tsv.gz"), kodeposGz);
await copyFile(join(wilayahRoot, "LICENSE"), join(target, "LICENSE-wilayah.txt"));
await copyFile(join(kodeposRoot, "LICENSE"), join(target, "LICENSE-wilayah_kodepos.txt"));

const source = {
  datasetVersion,
  decree,
  note: "Suggestion data only (D-32): a Mengantar area id from a live provider search remains the sole destination authority. Kode pos is an upstream hint, never authority.",
  sources: [
    {
      repository: "https://github.com/cahyadsn/wilayah",
      commit: wilayahCommit,
      path: "db/wilayah.sql",
      sha256: sha256(wilayahSql),
      licence: "MIT, Copyright (c) 2017-2025 Cahya DSN (LICENSE-wilayah.txt)",
    },
    {
      repository: "https://github.com/cahyadsn/wilayah_kodepos",
      commit: kodeposCommit,
      path: "json/wilayah_kodepos.min.json",
      sha256: sha256(kodeposJson),
      licence: "MIT, Copyright (c) 2024 Cahya DSN (LICENSE-wilayah_kodepos.txt)",
    },
  ],
  files: {
    "wilayah.tsv.gz": { sha256: sha256(wilayahGz), contentSha256: sha256(wilayahTsv), lines: names.length },
    "kodepos.tsv.gz": { sha256: sha256(kodeposGz), contentSha256: sha256(kodeposTsv), lines: postal.length },
  },
  expected: {
    provinces: report.provinces,
    regencies: report.regencies,
    districts: report.districts,
    villages: report.villages,
  },
  villagesWithoutPostal: report.villagesWithoutPostal,
};
await writeFile(join(target, "SOURCE.json"), `${JSON.stringify(source, null, 2)}\n`);
console.log(JSON.stringify({ datasetVersion, ...report }));
