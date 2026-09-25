import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { platformCmsNavigation, tenantCmsNavigation } from "@/lib/cms-shell-navigation";

/**
 * T-199: docs/spec/18-SYSTEM-MAP.md states its inventory as numbers and lists.
 * Each is recounted here from the filesystem and the navigation registry, so a
 * page, action, boundary or menu item added without updating the map fails.
 */
const root = process.cwd();
const map = readFileSync(join(root, "docs/spec/18-SYSTEM-MAP.md"), "utf8");

function walk(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const path = join(directory, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

const appFiles = walk("src/app").map((file) => relative(root, join(root, file))).sort();
const named = (name: string) => appFiles.filter((file) => file.endsWith(`/${name}`));
const pages = named("page.tsx");
const routeHandlers = named("route.ts");
const isTenant = (file: string) => file.startsWith("src/app/app/");
const isPlatform = (file: string) => file.startsWith("src/app/platform/");
const serverActionFiles = walk("src").filter((file) => /\.tsx?$/.test(file))
  .filter((file) => /^\s*["']use server["'];?\s*$/m.test(readFileSync(join(root, file), "utf8")))
  .sort();
const serverActions = serverActionFiles.flatMap((file) =>
  [...readFileSync(join(root, file), "utf8").matchAll(/^export async function (\w+)/gm)].map((match) => match[1]));

/** The text of one `## N.` section, up to the next `## ` heading. */
function section(number: number) {
  const start = map.search(new RegExp(`^## ${number}\\. `, "m"));
  expect(start, `section ${number}`).toBeGreaterThanOrEqual(0);
  const rest = map.slice(start + 1);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

function stated(pattern: RegExp, text = map) {
  const match = pattern.exec(text);
  expect(match, String(pattern)).not.toBeNull();
  return Number(match![1]);
}

function tableRows(text: string) {
  return text.split("\n").filter((line) => /^\| (?!-)/.test(line)).slice(1);
}

describe("docs/spec/18 inventory matches the repository (T-199)", () => {
  it("counts pages and route handlers, and lists each source file", () => {
    expect(stated(/\*\*(\d+) `page\.tsx` files\*\*/)).toBe(pages.length);
    expect(stated(/(\d+) Public & Authentication pages/)).toBe(pages.filter((file) => !isTenant(file) && !isPlatform(file)).length);
    expect(stated(/(\d+) Authenticated Tenant CMS pages/)).toBe(pages.filter(isTenant).length);
    expect(stated(/(\d+) Authenticated Platform CMS pages/)).toBe(pages.filter(isPlatform).length);
    expect(stated(/^## 4\. .*[(\s](\d+) Routes\)/m)).toBe(pages.filter((file) => !isTenant(file) && !isPlatform(file)).length);
    expect(stated(/^## 5\. .*[(\s](\d+) Routes\)/m)).toBe(pages.filter(isTenant).length);
    expect(stated(/^## 6\. .*[(\s](\d+) Routes\)/m)).toBe(pages.filter(isPlatform).length);
    expect(stated(/Verify Page Count \(Must equal (\d+)\)/)).toBe(pages.length);
    for (const file of pages) expect(map, file).toContain(`\`${file}\``);

    expect(stated(/\*\*(\d+) `route\.ts` Route Handlers\*\*/)).toBe(routeHandlers.length);
    expect(stated(/^## 8\. .*[(\s](\d+) Endpoints\)/m)).toBe(routeHandlers.length);
    expect(stated(/Verify Route Handler Count \(Must equal (\d+)\)/)).toBe(routeHandlers.length);
    for (const file of routeHandlers) expect(map, file).toContain(`\`${file}\``);
  });

  it("counts Server Action files and actions, one mutation-map row per exported action", () => {
    expect(stated(/\*\*(\d+) files declaring Server Actions\*\*/)).toBe(serverActionFiles.length);
    expect(stated(/exporting (\d+) Server Actions/)).toBe(serverActions.length);
    expect(stated(/^## 9\. .*\((\d+) Server Action Files/m)).toBe(serverActionFiles.length);
    expect(stated(/^## 9\. .*Files, (\d+) Actions\)/m)).toBe(serverActions.length);
    expect(stated(/Verify Server Action Files Count \(Must equal (\d+)\)/)).toBe(serverActionFiles.length);
    const rows = tableRows(section(9)).map((line) => /^\| `(\w+)` \| `([^`]+)`/.exec(line)?.slice(1, 3));
    expect(rows.map((row) => row?.[0]).sort()).toEqual([...serverActions].sort());
    for (const row of rows) {
      const [name, file] = row!;
      expect(readFileSync(join(root, file), "utf8"), `${name} in ${file}`).toMatch(new RegExp(`^export async function ${name}\\b`, "m"));
    }
    expect(stated(/\*\*(\d+) repository and data-layer modules\*\* in `src\/db\/`/)).toBe(readdirSync(join(root, "src/db")).length);
  });

  it("counts and lists every layout, loading, error and not-found boundary", () => {
    const layouts = named("layout.tsx");
    const loading = named("loading.tsx");
    const errors = named("error.tsx");
    const notFound = named("not-found.tsx");
    expect(stated(/\*\*(\d+) `layout\.tsx` files\*\*/)).toBe(layouts.length);
    expect(stated(/\*\*(\d+) `loading\.tsx`\*\*/)).toBe(loading.length);
    expect(stated(/\*\*(\d+) `error\.tsx`\*\*/)).toBe(errors.length);
    expect(stated(/\*\*(\d+) `not-found\.tsx`\*\*/)).toBe(notFound.length);

    const boundaries = section(10);
    expect(stated(/\*\*Layouts \((\d+)\)\*\*/, boundaries)).toBe(layouts.length);
    for (const file of layouts) expect(boundaries, file).toContain(`\`${file}\``);
    expect(stated(/\*\*Tenant Loading Boundaries \((\d+)\)\*\*/, boundaries)).toBe(loading.filter(isTenant).length);
    const loadingLine = boundaries.split("\n").find((line) => line.includes("**Tenant Loading Boundaries"))!;
    for (const file of loading.filter(isTenant)) {
      const short = file === "src/app/app/loading.tsx" ? file : file.slice("src/app/app/".length);
      expect(loadingLine, file).toContain(`\`${short}\``);
    }
    expect(stated(/\*\*Tenant Error Boundaries \((\d+)\)\*\*/, boundaries)).toBe(errors.filter(isTenant).length);
    // Error boundaries sit beside the tenant loading boundaries, except the v3 settings sub-pages,
    // which share `pengaturan/error.tsx` inside the settings frame (T-217; map Section 10).
    const loadingDirs = loading.filter(isTenant).map((file) => file.replace(/loading\.tsx$/, ""));
    const errorDirs = errors.filter(isTenant).map((file) => file.replace(/error\.tsx$/, ""));
    expect(errorDirs.filter((dir) => !loadingDirs.includes(dir))).toEqual([]);
    expect(errors).toContain("src/app/app/pengaturan/error.tsx");
    for (const dir of loadingDirs.filter((dir) => !errorDirs.includes(dir))) {
      expect(dir, dir).toMatch(/^src\/app\/app\/pengaturan\/[^/]+\/$/);
    }
    expect(stated(/\*\*Platform Boundaries \((\d+)\)\*\*/, boundaries)).toBe(
      loading.filter(isPlatform).length + errors.filter(isPlatform).length,
    );
    for (const file of [...loading, ...errors].filter(isPlatform)) expect(boundaries, file).toContain(`\`${file}\``);
    expect(stated(/\*\*Dedicated Not-Found Boundaries \((\d+)\)\*\*/, boundaries)).toBe(notFound.length);
    for (const file of notFound) expect(boundaries, file).toContain(`\`${file}\``);
    // A boundary the map names must exist.
    for (const [, file] of boundaries.matchAll(/`(src\/app\/[^`]*(?:loading|error|not-found|layout)\.tsx)`/g)) {
      expect(appFiles, file).toContain(file);
    }
  });

  it("lists the tenant and platform menus in registry order from cms-shell-navigation.ts", () => {
    const shell = section(3);
    const tenantItems = tenantCmsNavigation("TENANT_ADMIN", "/app").flatMap((group) => group.items);
    expect(stated(/\*\*(\d+) navigation items\*\*/, shell)).toBe(tenantItems.length);
    const tenantBlock = shell.slice(shell.indexOf("### Tenant Navigation Registry"), shell.indexOf("### Platform Navigation Registry"));
    expect(tenantBlock).toContain("(`src/lib/cms-shell-navigation.ts`)");
    const tenantRows = tableRows(tenantBlock).map((line) => line.split("|").map((cell) => cell.trim()));
    expect(tenantRows.map((cells) => [cells[3], cells[4].replace(/`/g, "")])).toEqual(
      tenantItems.map((item) => [item.label, item.href]),
    );
    const platformBlock = shell.slice(shell.indexOf("### Platform Navigation Registry"));
    expect(platformBlock).toMatch(/^### Platform Navigation Registry \(`src\/lib\/cms-shell-navigation\.ts`/);
    const platformItems = platformCmsNavigation("/platform").flatMap((group) => group.items);
    expect(tableRows(platformBlock).map((line) => line.split("|").map((cell) => cell.trim())).map((cells) => [cells[1].replace(/\*/g, ""), cells[2].replace(/`/g, "")]))
      .toEqual(platformItems.map((item) => [item.label, item.href]));
  });

  it("labels every route row with the map's own maturity vocabulary", () => {
    const vocabulary = [...section(1).matchAll(/^\| \*\*([A-Z-]+)\*\* \|/gm)].map((match) => match[1]);
    expect(vocabulary).toEqual(["COMMITTED", "WORKTREE", "RELEASE-GATED", "CLOSED"]);
    const routeRows = [4, 5, 6, 8].flatMap((number) => tableRows(section(number)))
      .filter((line) => /^\| `\/[^`]*` \|/.test(line));
    expect(routeRows.length).toBe(pages.length + routeHandlers.length + 1); // + the /app/kontak redirect row
    for (const line of routeRows) {
      const cells = line.split("|").map((cell) => cell.trim());
      expect(vocabulary, line.slice(0, 60)).toContain(cells[cells.length - 2]);
    }
  });
});

describe("docs/spec/19 metric attribute (T-199)", () => {
  it("never renders the retired data-metric spelling", () => {
    const retired = ["data-metric", ""].join("=");
    const retiredSelector = ["[data-metric", "]"].join("");
    // T-209 removed scripts/ui-audit; v3 renders no metric attribute, so only the retired spelling is checked.
    const files = [...walk("src"), ...walk("tests")]
      .filter((file) => /\.(?:tsx?|mjs|sh)$/.test(file));
    const offenders = files.filter((file) => {
      const text = readFileSync(join(root, file), "utf8");
      return text.includes(retired) || text.includes(retiredSelector) || text.includes(["'data-metric", "'"].join(""));
    });
    expect(offenders).toEqual([]);
  });
});
