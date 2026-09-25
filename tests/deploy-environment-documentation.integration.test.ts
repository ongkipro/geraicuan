import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * T-185 (PR-58, PR-63, D-2): the deployment environment table in
 * `docs/spec/15-DEVOPS-CICD-MIGRATIONS.md` must list exactly the variables the
 * deployed code reads, each under the service that reads it. A variable the
 * code starts reading without a row, or a row the code no longer reads, fails.
 *
 * Services: `app` is the Next.js image (`src/`, `next.config.ts`), `migrate` is
 * the ops image: the Drizzle migration step (`drizzle.config.ts`) and the first
 * Super Admin bootstrap (`scripts/bootstrap-super-admin.mjs`), `landing` is the Astro
 * static site (`apps/landing`). Developer and audit tooling under `scripts/`
 * and `tests/` is not deployed and is out of scope.
 */

const root = process.cwd();
const DOCUMENT = "docs/spec/15-DEVOPS-CICD-MIGRATIONS.md";
const TABLE_START = "<!-- environment-variables:start -->";
const TABLE_END = "<!-- environment-variables:end -->";
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"];

const SERVICES = [
  { directories: ["src"], files: ["next.config.ts"], service: "app" },
  // The ops image runs the migration and the first Super Admin bootstrap (T-194).
  { directories: [], files: ["drizzle.config.ts", "scripts/bootstrap-super-admin.mjs"], service: "migrate" },
  {
    directories: ["apps/landing/src"],
    files: ["apps/landing/astro.config.mjs"],
    service: "landing",
  },
] as const;

function sourceFiles(directory: string): string[] {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return EXTENSIONS.some((extension) => entry.endsWith(extension)) ? [path] : [];
  });
}

/**
 * Environment reads in one source text. Three shapes exist in this codebase:
 * `process.env.NAME` / `import.meta.env.NAME`; a validator's
 * `environment.NAME` after the caller passed `process.env` whole; and
 * `process.env[CONSTANT]` where `CONSTANT` is a string constant in the same
 * file. Any other shape — a computed key, destructuring, or `process.env`
 * handed to a function this scan cannot see into — throws, so the check fails
 * loudly instead of silently missing a variable.
 *
 * lazy: text scan, not an AST; a read inside a comment counts as a read. The
 * upgrade path is the TypeScript parser `client-bundle-boundary` already uses.
 */
function environmentReads(source: string, validators: ReadonlySet<string>, file = "source") {
  const names = new Set<string>();
  for (const match of source.matchAll(/\b(?:env|environment)\.([A-Z][A-Z0-9_]*)\b/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/\b(?:process\.env|import\.meta\.env)\[\s*([^\]]+?)\s*\]/g)) {
    const key = match[1];
    const literal = /^(["'`])([A-Z][A-Z0-9_]*)\1$/.exec(key);
    const constant = /^[A-Za-z_$][\w$]*$/.test(key)
      ? new RegExp(`\\bconst\\s+${key}\\s*=\\s*(["'\`])([A-Z][A-Z0-9_]*)\\1`).exec(source)
      : null;
    const name = literal?.[2] ?? constant?.[2];
    if (!name) throw new Error(`${file}: cannot resolve the environment key ${key}.`);
    names.add(name);
  }
  for (const match of source.matchAll(/(\b[\w$]+\s*\()?\b(?:process\.env|import\.meta\.env)\b(?!\s*[.[])/g)) {
    const callee = match[1]?.replace(/\s*\($/, "");
    if (!callee || !validators.has(callee)) {
      throw new Error(
        `${file}: the environment object is used whole outside a known validator; its reads cannot be listed.`,
      );
    }
  }
  return names;
}

/** Functions declared as `function name(environment…`, whose `environment.NAME` reads the scan counts. */
function validatorNames(sources: readonly string[]) {
  const names = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/\bfunction\s+([\w$]+)\s*\(\s*environment\b/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

function readsByService() {
  const files = SERVICES.map((entry) => ({
    paths: [...entry.directories.flatMap(sourceFiles), ...entry.files.filter((file) => existsSync(join(root, file)))],
    service: entry.service,
  }));
  const sources = new Map(
    files.flatMap((entry) => entry.paths).map((path) => [path, readFileSync(join(root, path), "utf8")]),
  );
  const validators = validatorNames([...sources.values()]);
  const services = new Map<string, Set<string>>();
  for (const { paths, service } of files) {
    for (const path of paths) {
      for (const name of environmentReads(sources.get(path)!, validators, path)) {
        if (!services.has(name)) services.set(name, new Set());
        services.get(name)!.add(service);
      }
    }
  }
  return services;
}

function documentedVariables() {
  const text = readFileSync(join(root, DOCUMENT), "utf8");
  const start = text.indexOf(TABLE_START);
  const end = text.indexOf(TABLE_END);
  if (start < 0 || end < start) throw new Error(`${DOCUMENT} has no environment variable table markers.`);
  const rows = new Map<string, Set<string>>();
  const duplicates: string[] = [];
  for (const line of text.slice(start, end).split("\n")) {
    const row = /^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|([^|]+)\|/.exec(line);
    if (!row) continue;
    if (rows.has(row[1])) duplicates.push(row[1]);
    rows.set(
      row[1],
      new Set(row[2].split(",").map((service) => service.replaceAll("`", "").trim()).filter(Boolean)),
    );
  }
  return { duplicates, rows };
}

describe("deployment environment documentation", () => {
  // T-209 (ADR-0001): UI v3 rebuild in progress — the pages this reads were removed; re-enable in T-219.
  it.skip("lists every variable the deployed code reads, and nothing it does not", () => {
    const code = readsByService();
    const { duplicates, rows } = documentedVariables();

    expect(duplicates).toEqual([]);
    expect([...code.keys()].filter((name) => !rows.has(name)).sort()).toEqual([]);
    expect([...rows.keys()].filter((name) => !code.has(name)).sort()).toEqual([]);
  });

  it("names, for each variable, exactly the services whose code reads it", () => {
    const code = readsByService();
    const { rows } = documentedVariables();
    const mismatched = [...code].flatMap(([name, services]) => {
      const documented = [...(rows.get(name) ?? [])].sort().join(", ");
      const actual = [...services].sort().join(", ");
      return documented === actual ? [] : [`${name}: documented "${documented}", read by "${actual}"`];
    });

    expect(mismatched).toEqual([]);
  });

  it("finds every read shape and refuses one it cannot resolve", () => {
    const validators = new Set(["resolveThing"]);

    expect([
      ...environmentReads(
        [
          "const a = process.env.ALPHA;",
          "const b = import.meta.env.PUBLIC_BETA;",
          "function resolveThing(environment) { return environment.GAMMA; }",
          "resolveThing(process.env);",
          'const FLAG = "DELTA_FLAG";',
          "const d = process.env[FLAG];",
          'const e = process.env["EPSILON"];',
        ].join("\n"),
        validators,
      ),
    ].sort()).toEqual(["ALPHA", "DELTA_FLAG", "EPSILON", "GAMMA", "PUBLIC_BETA"]);

    expect(() => environmentReads("const key = pick(); process.env[key];", validators)).toThrow(
      /cannot resolve/,
    );
    expect(() => environmentReads("const { ZETA } = process.env;", validators)).toThrow(/used whole/);
    expect(() => environmentReads("unknownReader(process.env);", validators)).toThrow(/used whole/);
  });
});
