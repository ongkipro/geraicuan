import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  CMS_UI_AUDIT_ROUTE_CONTRACTS,
  UI_AUDIT_SCENARIO_CONTRACTS,
  parseUiAuditScenarioForRoute,
  uiAuditStateOwner,
} from "@/lib/ui-audit-scenario";

const repositoryRoot = process.cwd();
const forbiddenLegacyClass = /\b(?:sales|ship|ops|an|bulk)-(?:[a-z0-9_-]+)?/gi;

const expectedStatesByRoute = {
  "/app": ["first-run", "healthy-empty", "loading", "populated", "route-error", "partial-error", "stale", "invalid-query"],
  "/app/analitik": ["first-run", "healthy-empty", "loading", "populated", "route-error", "partial-error", "stale", "invalid-query"],
  "/app/analitik/export.csv": ["invalid-query", "primary-success", "route-error"],
  "/app/pengiriman": ["healthy-empty", "loading", "populated", "route-error", "invalid-query", "stale"],
  "/app/pengiriman/[shipmentId]": ["healthy-empty", "loading", "populated", "route-error", "primary-success", "stale"],
  "/app/pengiriman/baru": ["healthy-empty", "loading", "populated", "partial-error", "primary-success", "route-error"],
  "/app/impor": ["healthy-empty", "loading", "partial-error", "populated", "primary-success", "route-error"],
  "/app/impor/template.csv": ["primary-success", "route-error"],
  "/app/kontak": ["healthy-empty", "loading", "populated", "route-error", "invalid-query"],
  "/app/kontak/baru": ["loading", "populated", "partial-error", "primary-success", "route-error"],
  "/app/kontak/[contactId]": ["healthy-empty", "loading", "populated", "route-error", "partial-error", "primary-success"],
  "/app/label": ["healthy-empty", "loading", "populated", "route-error", "invalid-query"],
  "/app/label/[shipmentId]": ["healthy-empty", "loading", "populated", "route-error", "partial-error", "primary-success"],
  "/app/keuangan": ["healthy-empty", "loading", "populated", "route-error", "invalid-query", "partial-error", "primary-success", "stale"],
  "/app/pengaturan": ["first-run", "healthy-empty", "loading", "populated", "route-error", "partial-error", "primary-success"],
  "/app/anggota": ["healthy-empty", "loading", "populated", "route-error", "partial-error", "primary-success"],
  "/platform": ["healthy-empty", "loading", "populated", "route-error", "invalid-query", "stale"],
  "/platform/tenant": ["healthy-empty", "loading", "populated", "route-error", "invalid-query", "partial-error", "primary-success"],
  "/platform/tenant/[tenantId]": ["healthy-empty", "loading", "populated", "route-error", "not-found", "partial-error", "primary-success", "stale"],
  "/platform/audit": ["healthy-empty", "loading", "populated", "route-error", "invalid-query", "stale"],
} as const;

const expectedOwnerByRoute = {
  "/app": "T-38",
  "/app/analitik": "T-38",
  "/app/analitik/export.csv": "T-38",
  "/app/pengiriman": "T-39",
  "/app/pengiriman/[shipmentId]": "T-39",
  "/app/pengiriman/baru": "T-40",
  "/app/impor": "T-41",
  "/app/impor/template.csv": "T-41",
  "/app/kontak": "T-42",
  "/app/kontak/baru": "T-42",
  "/app/kontak/[contactId]": "T-42",
  "/app/label": "T-43",
  "/app/label/[shipmentId]": "T-43",
  "/app/keuangan": "T-44",
  "/app/pengaturan": "T-45",
  "/app/anggota": "T-46",
  "/platform": "T-47",
  "/platform/tenant": "T-47",
  "/platform/tenant/[tenantId]": "T-47",
  "/platform/audit": "T-47",
} as const;

const presentationExemptions = {
  physicalLabelPrefix: "label-",
  publicSalesSurface: "src/app/page.tsx",
} as const;

function sourceFiles(directory: string): string[] {
  const absoluteDirectory = join(repositoryRoot, directory);
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(absoluteDirectory, entry.name);
    const repositoryPath = relative(repositoryRoot, path);

    if (entry.isDirectory()) return sourceFiles(repositoryPath);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [repositoryPath] : [];
  });
}

function routeFromSource(source: string): string {
  return source
    .replace(/^src\/app/, "")
    .replace(/\/(?:page\.tsx|route\.ts)$/, "");
}

function resolveLocalModule(importer: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(repositoryRoot, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? join(repositoryRoot, dirname(importer), specifier)
      : null;
  if (!base) return null;

  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function jsxClassNameAudit(
  file: string,
  source = readFileSync(join(repositoryRoot, file), "utf8"),
) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const literals: string[] = [];
  const declarations = new Map<string, ts.Expression>();
  const importedIdentifiers = new Map<string, string>();
  const inspectedModules = new Set<string>();

  function importedModuleLiterals(identifier: string): string[] {
    const specifier = importedIdentifiers.get(identifier);
    const modulePath = specifier ? resolveLocalModule(file, specifier) : null;
    if (!modulePath || inspectedModules.has(modulePath)) return [];
    inspectedModules.add(modulePath);
    const values = readFileSync(modulePath, "utf8").match(forbiddenLegacyClass) ?? [];
    forbiddenLegacyClass.lastIndex = 0;
    return values;
  }

  function expressionValues(node: ts.Node, seen = new Set<string>()): string[] {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return [node.text];
    }
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return [];
      const declaration = declarations.get(node.text);
      if (declaration) return expressionValues(declaration, new Set(seen).add(node.text));
      return importedModuleLiterals(node.text);
    }
    if (ts.isTemplateExpression(node)) {
      let values = [node.head.text];
      for (const span of node.templateSpans) {
        const substitutions = expressionValues(span.expression, seen);
        values = values.flatMap((prefix) =>
          (substitutions.length > 0 ? substitutions : [""]).map(
            (substitution) => `${prefix}${substitution}${span.literal.text}`,
          ));
      }
      return values;
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const declaration = declarations.get(node.expression.text);
      if (declaration && ts.isObjectLiteralExpression(declaration)) {
        const property = declaration.properties.find((candidate) =>
          ts.isPropertyAssignment(candidate)
          && candidate.name.getText(sourceFile) === node.name.text);
        if (property && ts.isPropertyAssignment(property)) {
          return expressionValues(property.initializer, seen);
        }
      }
      return expressionValues(node.expression, seen);
    }
    if (ts.isConditionalExpression(node)) {
      return [
        ...expressionValues(node.whenTrue, seen),
        ...expressionValues(node.whenFalse, seen),
      ];
    }
    if (ts.isBinaryExpression(node)) {
      const left = expressionValues(node.left, seen);
      const right = expressionValues(node.right, seen);
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        return left.flatMap((prefix) => right.map((suffix) => `${prefix}${suffix}`));
      }
      return [...left, ...right];
    }
    const values: string[] = [];
    node.forEachChild((child) => values.push(...expressionValues(child, seen)));
    return values;
  }

  function collectBindings(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.name) importedIdentifiers.set(clause.name.text, specifier);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        importedIdentifiers.set(clause.namedBindings.name.text, specifier);
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          importedIdentifiers.set(element.name.text, specifier);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer);
    }
    node.forEachChild(collectBindings);
  }

  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node)
      && /className$/i.test(node.name.getText(sourceFile))
      && node.initializer
    ) {
      literals.push(...expressionValues(node.initializer));
      return;
    }
    node.forEachChild(visit);
  }

  collectBindings(sourceFile);
  visit(sourceFile);
  return literals;
}

describe("CMS UI audit inventory", () => {
  it("detects forbidden classes through aliases, object properties, and templates", () => {
    const source = `
      const legacy = "ship-shell";
      const prefix = "ops";
      const styles = { root: "bulk-panel" };
      export function Fixture() {
        return <>
          <div className={legacy} />
          <div className={styles.root} />
          <div className={\`${"${prefix}"}-workspace\`} />
        </>;
      }
      export function LateFixture() { return <div className={lateLegacy} />; }
      const lateLegacy = "sales-late";
    `;
    const findings = jsxClassNameAudit("src/app/app/_audit-fixture.tsx", source)
      .flatMap((className) => className.match(forbiddenLegacyClass) ?? []);

    expect(findings.sort()).toEqual([
      "bulk-panel",
      "ops-workspace",
      "sales-late",
      "ship-shell",
    ]);
  });

  it("assigns every authenticated route to one atomic owner and existing source", () => {
    const routes = CMS_UI_AUDIT_ROUTE_CONTRACTS.map(({ route }) => route);

    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.sort()).toEqual(Object.keys(expectedStatesByRoute).sort());

    for (const contract of CMS_UI_AUDIT_ROUTE_CONTRACTS) {
      expect(contract.ownerTask).toMatch(/^T-(?:3[8-9]|4[0-7])$/);
      expect(contract.ownerTask).toBe(expectedOwnerByRoute[contract.route]);
      expect(contract.roles.length).toBeGreaterThan(0);
      expect(contract.states.length).toBeGreaterThan(0);
      expect(existsSync(join(repositoryRoot, contract.source)), contract.source).toBe(true);
      expect(contract.route).toBe(routeFromSource(contract.source));
      expect(contract.states).toEqual(expectedStatesByRoute[contract.route]);
      for (const state of contract.states) {
        expect(uiAuditStateOwner(contract, state)).toEqual({
          ownerTask: contract.ownerTask,
          strategy: expect.stringMatching(
            /^(?:action-state|local-fixture|query|route-boundary|scenario)$/,
          ),
        });
      }
    }

    expect(CMS_UI_AUDIT_ROUTE_CONTRACTS.filter(({ kind }) => kind === "page"))
      .toHaveLength(18);
    expect(CMS_UI_AUDIT_ROUTE_CONTRACTS.filter(({ kind }) => kind === "endpoint"))
      .toHaveLength(2);

    const registeredPageSources = CMS_UI_AUDIT_ROUTE_CONTRACTS
      .filter(({ kind }) => kind === "page")
      .map(({ source }) => source)
      .sort();
    const actualPageSources = [
      ...sourceFiles("src/app/app"),
      ...sourceFiles("src/app/platform"),
    ].filter((file) => file.endsWith("/page.tsx")).sort();
    expect(registeredPageSources).toEqual(actualPageSources);

    const registeredEndpointSources = CMS_UI_AUDIT_ROUTE_CONTRACTS
      .filter(({ kind }) => kind === "endpoint")
      .map(({ source }) => source)
      .sort();
    const actualEndpointSources = [
      ...sourceFiles("src/app/app"),
      ...sourceFiles("src/app/platform"),
    ].filter((file) => file.endsWith("/route.ts")).sort();
    expect(registeredEndpointSources).toEqual(actualEndpointSources);
  });

  it("keeps migrated legacy presentation classes out of authenticated TypeScript surfaces", () => {
    const files = [
      ...sourceFiles("src/app/_components"),
      ...sourceFiles("src/app/app"),
      ...sourceFiles("src/app/platform"),
      ...sourceFiles("src/components/cms"),
    ];
    expect(files).not.toContain(presentationExemptions.publicSalesSurface);
    expect(forbiddenLegacyClass.test(presentationExemptions.physicalLabelPrefix)).toBe(false);
    forbiddenLegacyClass.lastIndex = 0;
    const findings = files.flatMap((file) => {
      const matches = jsxClassNameAudit(file).flatMap((className) =>
        className.match(forbiddenLegacyClass) ?? []);
      return matches.map((match) => `${file}: ${match}`);
    });

    expect(findings).toEqual([]);
  });

  it("keeps T-47 platform UI audit scenarios deterministic, read-only, and route-bound", () => {
    const expectedPlatformScenarios = {
      "platform-audit-empty": ["/platform/audit", "healthy-empty"],
      "platform-audit-error": ["/platform/audit", "route-error"],
      "platform-audit-invalid-query": ["/platform/audit", "invalid-query"],
      "platform-audit-paginated": ["/platform/audit", "populated"],
      "platform-audit-populated": ["/platform/audit", "populated"],
      "platform-audit-redacted": ["/platform/audit", "populated"],
      "platform-audit-stale": ["/platform/audit", "stale"],
      "platform-audit-stream": ["/platform/audit", "loading"],
      "platform-overview-empty": ["/platform", "healthy-empty"],
      "platform-overview-error": ["/platform", "route-error"],
      "platform-overview-invalid-query": ["/platform", "invalid-query"],
      "platform-overview-populated": ["/platform", "populated"],
      "platform-overview-stale": ["/platform", "stale"],
      "platform-overview-stream": ["/platform", "loading"],
      "platform-tenant-detail-error": ["/platform/tenant/[tenantId]", "route-error"],
      "platform-tenant-detail-lifecycle-error": ["/platform/tenant/[tenantId]", "partial-error"],
      "platform-tenant-detail-lifecycle-success": ["/platform/tenant/[tenantId]", "primary-success"],
      "platform-tenant-detail-many-outlets": ["/platform/tenant/[tenantId]", "populated"],
      "platform-tenant-detail-not-found": ["/platform/tenant/[tenantId]", "not-found"],
      "platform-tenant-detail-one-outlet": ["/platform/tenant/[tenantId]", "populated"],
      "platform-tenant-detail-stale": ["/platform/tenant/[tenantId]", "stale"],
      "platform-tenant-detail-stream": ["/platform/tenant/[tenantId]", "loading"],
      "platform-tenant-detail-zero-outlets": ["/platform/tenant/[tenantId]", "healthy-empty"],
      "platform-tenant-empty": ["/platform/tenant", "healthy-empty"],
      "platform-tenant-error": ["/platform/tenant", "route-error"],
      "platform-tenant-invalid-query": ["/platform/tenant", "invalid-query"],
      "platform-tenant-paginated": ["/platform/tenant", "populated"],
      "platform-tenant-populated": ["/platform/tenant", "populated"],
      "platform-tenant-provision-error": ["/platform/tenant", "partial-error"],
      "platform-tenant-provision-success": ["/platform/tenant", "primary-success"],
      "platform-tenant-stream": ["/platform/tenant", "loading"],
    } as const;

    const platformScenarios = Object.fromEntries(
      Object.entries(UI_AUDIT_SCENARIO_CONTRACTS)
        .filter(([scenario]) => scenario.startsWith("platform-"))
        .map(([scenario, contract]) => [
          scenario,
          [contract.route, contract.state],
        ]),
    );

    expect(platformScenarios).toEqual(expectedPlatformScenarios);

    for (const [scenario, [route]] of Object.entries(expectedPlatformScenarios)) {
      const contract = UI_AUDIT_SCENARIO_CONTRACTS[
        scenario as keyof typeof UI_AUDIT_SCENARIO_CONTRACTS
      ];
      expect(contract.mode).toBe("read-only");
      expect(parseUiAuditScenarioForRoute(scenario, route, "development"))
        .toBe(scenario);
      expect(parseUiAuditScenarioForRoute(scenario, route, "production"))
        .toBeNull();
      expect(parseUiAuditScenarioForRoute(scenario, "/app", "development"))
        .toBeNull();
    }
  });

  it("keeps Mengantar error audit states development-only and non-mutating", () => {
    const expectedSettingsScenarios = {
      "settings-empty": "healthy-empty",
      "settings-error": "route-error",
      "settings-first-run": "first-run",
      "settings-many": "populated",
      "settings-private-auth-error": "partial-error",
      "settings-private-attention": "partial-error",
      "settings-provider-error": "partial-error",
      "settings-stream": "loading",
    } as const;
    const settingsScenarios = Object.fromEntries(
      Object.entries(UI_AUDIT_SCENARIO_CONTRACTS)
        .filter(([scenario]) => scenario.startsWith("settings-"))
        .map(([scenario, contract]) => [scenario, contract.state]),
    );

    expect(settingsScenarios).toEqual(expectedSettingsScenarios);
    for (const scenario of Object.keys(expectedSettingsScenarios)) {
      const contract = UI_AUDIT_SCENARIO_CONTRACTS[
        scenario as keyof typeof UI_AUDIT_SCENARIO_CONTRACTS
      ];
      expect(contract.mode).toBe("read-only");
      expect(parseUiAuditScenarioForRoute(scenario, "/app/pengaturan", "development"))
        .toBe(scenario);
      expect(parseUiAuditScenarioForRoute(scenario, "/app/pengaturan", "production"))
        .toBeNull();
    }
  });

  it("limits every audit-contract import to its route-bound read-only page consumers", () => {
    const allowedImporters = new Set([
      "src/app/app/analitik/page.tsx",
      "src/app/app/anggota/page.tsx",
      "src/app/app/page.tsx",
      "src/app/app/impor/page.tsx",
      "src/app/app/keuangan/page.tsx",
      "src/app/app/kontak/page.tsx",
      "src/app/app/pengaturan/page.tsx",
      "src/app/app/label/page.tsx",
      "src/app/app/label/[shipmentId]/page.tsx",
      "src/app/app/pengiriman/page.tsx",
      "src/app/app/pengiriman/baru/page.tsx",
      "src/app/app/pengiriman/[shipmentId]/page.tsx",
      "src/app/platform/_components/monitoring-view.tsx",
    ]);
    const findings: string[] = [];

    function auditSpecifiers(file: string): string[] {
      const source = readFileSync(join(repositoryRoot, file), "utf8");
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const specifiers: string[] = [];
      function visit(node: ts.Node) {
        const specifier = (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          && node.moduleSpecifier
          && ts.isStringLiteral(node.moduleSpecifier)
        ) ? node.moduleSpecifier.text : null;
        if (specifier) specifiers.push(specifier);
        if (
          ts.isCallExpression(node)
          && node.arguments.length === 1
          && ts.isStringLiteral(node.arguments[0])
          && (node.expression.kind === ts.SyntaxKind.ImportKeyword
            || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
        ) {
          specifiers.push(node.arguments[0].text);
        }
        node.forEachChild(visit);
      }
      visit(sourceFile);
      return specifiers;
    }

    for (const file of sourceFiles("src")) {
      for (const specifier of auditSpecifiers(file)) {
        if (specifier.includes("ui-audit-scenario") && !allowedImporters.has(file)) {
          findings.push(`${file}: ${specifier}`);
        }
      }
    }

    expect(findings).toEqual([]);

    for (const [file, route] of [
      ["src/app/app/page.tsx", "/app"],
      ["src/app/app/analitik/page.tsx", "/app/analitik"],
      ["src/app/app/anggota/page.tsx", "/app/anggota"],
      ["src/app/app/impor/page.tsx", "/app/impor"],
      ["src/app/app/keuangan/page.tsx", "/app/keuangan"],
      ["src/app/app/kontak/page.tsx", "/app/kontak"],
      ["src/app/app/pengaturan/page.tsx", "/app/pengaturan"],
      ["src/app/app/label/page.tsx", "/app/label"],
      ["src/app/app/label/[shipmentId]/page.tsx", "/app/label/[shipmentId]"],
      ["src/app/app/pengiriman/page.tsx", "/app/pengiriman"],
      ["src/app/app/pengiriman/baru/page.tsx", "/app/pengiriman/baru"],
      ["src/app/app/pengiriman/[shipmentId]/page.tsx", "/app/pengiriman/[shipmentId]"],
    ] as const) {
      const source = readFileSync(join(repositoryRoot, file), "utf8");
      expect(source).toContain("parseUiAuditScenarioForRoute(");
      expect(source).toContain(`"${route}"`);
      expect(source).not.toMatch(/\bparseUiAuditScenario\s*\(/);
    }

    const auditSource = readFileSync(
      join(repositoryRoot, "src/lib/ui-audit-scenario.ts"),
      "utf8",
    );
    expect(auditSource.match(/(?:import|export)[^;]+from\s+["'][^"']+["']/g) ?? [])
      .toEqual([]);
    expect(auditSource.match(/^import\s+["']([^"']+)["'];$/gm) ?? [])
      .toEqual(['import "server-only";']);
  });
});
