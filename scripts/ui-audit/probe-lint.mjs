// Three separate edits shipped a probe that could not run, each discovered only
// when a sweep died half an hour in: a backtick inside the template literal
// (which ends it), and single backslashes in regular expressions (which the
// template swallows, so /\d/ reaches the browser as /d/). Both are invisible to
// a reader and fatal at runtime, so they are checked here, for every exported
// probe template in the file - not only the first one added.
import { readFileSync } from "node:fs";
import * as probes from "./probe.mjs";

const src = readFileSync(new URL("./probe.mjs", import.meta.url), "utf8").split("\n");
const starts = src
  .map((line, i) => ({ line, i }))
  .filter(({ line }) => /^export const \w+ = `/.test(line));
const problems = [];
let totalLines = 0;

for (const { i: start } of starts) {
  const end = src.indexOf("})())`;", start);
  if (end === -1) { problems.push(`line ${start + 1}: template never closes with })())\`;`); continue; }
  totalLines += end - start;
  for (let i = start + 1; i < end; i++) {
    if (src[i].includes("`")) problems.push(`line ${i + 1}: backtick inside the template ends it early`);
    if (/[^\\]\\[dswDSWbB](?![a-zA-Z])/.test(src[i]) && !src[i].trim().startsWith("//")) {
      problems.push(`line ${i + 1}: single-escaped regex class, the template will swallow it: ${src[i].trim().slice(0, 70)}`);
    }
  }
}

for (const [name, value] of Object.entries(probes)) {
  if (typeof value !== "string") continue;
  try { new Function(`return ${value}`); } catch (error) { problems.push(`${name} does not compile: ${error.message}`); }
}

if (problems.length) {
  console.log("PROBE LINT FAILURES:");
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
console.log(`probe lint clean (${starts.length} template(s), ${totalLines} template lines)`);
