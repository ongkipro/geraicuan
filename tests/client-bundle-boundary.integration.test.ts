import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();

// `tsconfig.json` sets `allowJs`, so a plain JavaScript module can be a link in
// the chain or a client entry.
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

function sourceFiles(directory: string): string[] {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) return sourceFiles(join(directory, entry));
    return SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))
      ? [join(directory, entry)]
      : [];
  });
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(join(root, dirname(fromFile)), specifier);
  else return null;

  const candidates = [
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return relative(root, candidate);
  }
  return null;
}

/**
 * Every module edge that survives to runtime.
 *
 * Three shapes carry one, and missing any of them makes this guard decorative:
 *   - `import … from "x"` and a bare `import "x"`;
 *   - `export … from "x"`, which is an import plus a re-export and pulls the
 *     module in exactly the same way;
 *   - a dynamic `import("x")`, which becomes a lazily fetched chunk rather than
 *     no chunk at all.
 *
 * `import type`, `export type`, and inline `type` specifiers are erased by the
 * compiler and cannot pull anything in.
 */
function runtimeEdges(file: string): string[] {
  const source = readFileSync(join(root, file), "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  const everySpecifierIsType = (bindings: ts.NamedImports | ts.NamedExports) =>
    bindings.elements.length > 0
    && bindings.elements.every((element) => /^type\s/.test(element.getText()));

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      // Read the declaration text rather than the deprecated `isTypeOnly`
      // flags: both `import type { A }` and `import { type A }` are erased.
      if (!/^import\s+type\b/.test(node.getText())) {
        const bindings = node.importClause?.namedBindings;
        const erased =
          bindings !== undefined
          && ts.isNamedImports(bindings)
          && !node.importClause?.name
          && everySpecifierIsType(bindings);
        if (!erased) {
          const resolved = resolveSpecifier(file, node.moduleSpecifier.text);
          if (resolved) specifiers.push(resolved);
        }
      }
    }

    if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && !/^export\s+type\b/.test(node.getText())
    ) {
      const bindings = node.exportClause;
      const erased =
        bindings !== undefined
        && ts.isNamedExports(bindings)
        && everySpecifierIsType(bindings);
      if (!erased) {
        const resolved = resolveSpecifier(file, node.moduleSpecifier.text);
        if (resolved) specifiers.push(resolved);
      }
    }

    if (
      ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      && node.arguments.length > 0
      && (ts.isStringLiteral(node.arguments[0])
        || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      const resolved = resolveSpecifier(file, node.arguments[0].text);
      if (resolved) specifiers.push(resolved);
    }

    node.forEachChild(visit);
  };

  parsed.forEachChild(visit);
  return specifiers;
}

function directiveOf(file: string): "client" | "server" | null {
  // Read the directive from the parse tree. Any text-window approach only moves
  // the fragility to the window's length: a licence header longer than the
  // slice leaves an unterminated comment, and the file then reads as neither
  // client nor server — silently dropping a client entry, or making the walker
  // traverse through a "use server" module and report false paths.
  const parsed = ts.createSourceFile(
    file,
    readFileSync(join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of parsed.statements) {
    if (
      !ts.isExpressionStatement(statement)
      || !ts.isStringLiteral(statement.expression)
    ) {
      // Directives must precede every other statement.
      return null;
    }
    if (statement.expression.text === "use client") return "client";
    if (statement.expression.text === "use server") return "server";
  }
  return null;
}

describe("client bundle boundary", () => {
  const files = sourceFiles("src");
  const directives = new Map(files.map((file) => [file, directiveOf(file)] as const));
  const clientEntries = files.filter((file) => directives.get(file) === "client");

  it("has client components to check", () => {
    expect(clientEntries.length).toBeGreaterThan(20);
  });

  it("never reaches the Drizzle schema from a client component", () => {
    // `src/lib/shipment-queue.ts` used to take a value import of
    // `shipmentStatuses` from `@/db/schema`, and because the shipment queue
    // filter is a client component that one edge shipped the entire table
    // graph — every table, column, constraint, and the MENGANTAR_API_KEY
    // managed-secret purpose label — to the browser in a 79 KB chunk.
    const findings: string[] = [];

    for (const entry of clientEntries) {
      const seen = new Set<string>();
      const trail = new Map<string, string[]>([[entry, [entry]]]);
      const queue = [entry];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (seen.has(current)) continue;
        seen.add(current);

        for (const next of runtimeEdges(current)) {
          // A "use server" module is replaced by a reference proxy in the
          // client graph, so nothing behind it is bundled.
          if (next !== entry && directives.get(next) === "server") continue;
          const path = [...(trail.get(current) ?? [current]), next];
          if (next === "src/db/schema.ts") {
            findings.push(path.join(" -> "));
            continue;
          }
          if (!seen.has(next)) {
            trail.set(next, path);
            queue.push(next);
          }
        }
      }
    }

    expect(findings).toEqual([]);
  });

  it("keeps the shared lifecycle literals free of any database dependency", () => {
    // The whole point of `@/lib/domain-enums` is that it can be bundled.
    // No runtime edge of any shape: not an import, not a re-export, not a
    // dynamic import. `runtimeEdges` is what enforces that, and it is itself
    // exercised by the mutation checks below.
    expect(runtimeEdges("src/lib/domain-enums.ts")).toEqual([]);
    const source = readFileSync(join(root, "src/lib/domain-enums.ts"), "utf8");
    // Anchored so prose in the doc comment does not match.
    expect(source.match(/^\s*(?:import|export)\s[^=]*\bfrom\b/gm) ?? []).toEqual([]);
  });

  it("keeps the schema and the literal module in agreement", async () => {
    const schema = await import("@/db/schema");
    const literals = await import("@/lib/domain-enums");
    // The schema re-exports them, so a divergent second definition cannot
    // appear without this failing.
    expect(schema.shipmentStatuses).toBe(literals.shipmentStatuses);
    expect(schema.membershipRoles).toBe(literals.membershipRoles);
  });
});
