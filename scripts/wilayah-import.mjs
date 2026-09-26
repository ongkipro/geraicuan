// T-245 (DATA-22, spec 15 DEP step): load the vendored wilayah reference into `wilayah_areas`.
//
//   DATABASE_URL=<migration/owner role> npm run wilayah:import
//
// Runs after `db:migrate` (0067). Offline: reads data/wilayah/ only. Refuses before writing when a
// vendored file's checksum, a published count, or any row rule differs; then replaces the rows in
// ONE transaction and asserts the row count and a content fingerprint before COMMIT. Idempotent:
// a re-run with the same data reports 0 added / 0 changed / 0 removed. Never run it as the
// runtime role (it has SELECT only, so it would fail anyway).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import pg from "pg";

import { buildWilayahRows, replaceWilayahRows, wilayahRowFingerprintLine } from "../src/lib/wilayah.ts";

export const DEFAULT_WILAYAH_DIRECTORY = fileURLToPath(new URL("../data/wilayah/", import.meta.url));

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function parseTsv(buffer, file) {
  const text = buffer.toString("utf8");
  if (!text.endsWith("\n")) throw new Error(`${file} is truncated.`);
  return text.slice(0, -1).split("\n").map((line, index) => {
    const fields = line.split("\t");
    if (fields.length !== 2) throw new Error(`${file} line ${index + 1} is malformed.`);
    return [fields[0], fields[1]];
  });
}

/** Reads and checksum-verifies the vendored files; throws before any parsing on a mismatch. */
export async function readVendoredWilayah(directory = DEFAULT_WILAYAH_DIRECTORY) {
  const source = JSON.parse(await readFile(join(directory, "SOURCE.json"), "utf8"));
  const read = async (file) => {
    const packed = await readFile(join(directory, file));
    const expected = source.files?.[file];
    if (!expected || sha256(packed) !== expected.sha256) throw new Error(`${file} does not match its SOURCE.json checksum.`);
    const content = gunzipSync(packed);
    if (sha256(content) !== expected.contentSha256) throw new Error(`${file} content does not match its SOURCE.json checksum.`);
    const rows = parseTsv(content, file);
    if (rows.length !== expected.lines) throw new Error(`${file} has ${rows.length} lines, SOURCE.json says ${expected.lines}.`);
    return rows;
  };
  return { names: await read("wilayah.tsv.gz"), postal: await read("kodepos.tsv.gz"), source };
}

export function wilayahFingerprint(rows) {
  return createHash("md5").update(rows.map(wilayahRowFingerprintLine).join("\n")).digest("hex");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL (the migration/owner role) is required.");
  if (databaseUrl === process.env.APP_DATABASE_URL) throw new Error("Run the import with the migration role, not the runtime role.");
  const directory = process.argv[2] ?? DEFAULT_WILAYAH_DIRECTORY;

  const started = performance.now();
  const { names, postal, source } = await readVendoredWilayah(directory);
  const { report, rows } = buildWilayahRows(names, postal, source.datasetVersion, source.expected);
  const md5 = wilayahFingerprint(rows);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await replaceWilayahRows(client, rows, md5);
    // Fresh planner statistics for the trigram index (outside the load transaction).
    await client.query("ANALYZE wilayah_areas");
    const { rows: [size] } = await client.query(`
      SELECT pg_total_relation_size('wilayah_areas') AS total_bytes,
        pg_relation_size('wilayah_areas') AS heap_bytes,
        pg_relation_size('wilayah_areas_search_trgm_idx') AS trgm_bytes`);
    console.log(JSON.stringify({
      datasetVersion: source.datasetVersion,
      ...report,
      ...result,
      heapBytes: Number(size.heap_bytes),
      trgmIndexBytes: Number(size.trgm_bytes),
      totalBytes: Number(size.total_bytes),
      durationMs: Math.round(performance.now() - started),
    }));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
