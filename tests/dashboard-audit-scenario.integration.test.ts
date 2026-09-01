import { describe, expect, it } from "vitest";

import {
  UI_AUDIT_SCENARIO_CONTRACTS,
  parseUiAuditScenario,
  parseUiAuditScenarioForRoute,
} from "@/lib/ui-audit-scenario";

describe("dashboard UI audit scenario", () => {
  it("accepts only the development allowlist and fails closed in production", () => {
    expect(parseUiAuditScenario("dashboard-action-error", "development"))
      .toBe("dashboard-action-error");
    expect(parseUiAuditScenario("dashboard-stale", "test"))
      .toBeNull();
    expect(parseUiAuditScenario("dashboard-stale, dashboard-action-error", "development"))
      .toBeNull();
    expect(parseUiAuditScenario("unknown", "development")).toBeNull();
    expect(parseUiAuditScenario("dashboard-action-error", "production"))
      .toBeNull();
    expect(parseUiAuditScenario("analytics-stream", "production"))
      .toBeNull();
    expect(parseUiAuditScenario("analytics-first-run", "development"))
      .toBe("analytics-first-run");
    expect(parseUiAuditScenario("analytics-page-error", "development"))
      .toBe("analytics-page-error");
    expect(parseUiAuditScenario("analytics-page-error", "production"))
      .toBeNull();
    expect(parseUiAuditScenario("dashboard-period-demo", "development"))
      .toBe("dashboard-period-demo");
    expect(parseUiAuditScenario("dashboard-period-error", "development"))
      .toBe("dashboard-period-error");
    expect(parseUiAuditScenario("dashboard-first-run", "development"))
      .toBe("dashboard-first-run");
    expect(parseUiAuditScenario("dashboard-page-error", "development"))
      .toBe("dashboard-page-error");
    expect(parseUiAuditScenario("dashboard-stream", "development"))
      .toBe("dashboard-stream");
    expect(parseUiAuditScenario("dashboard-period-demo", "production"))
      .toBeNull();
  });

  it("binds each scenario to one route and keeps every scenario read-only", () => {
    for (const [scenario, contract] of Object.entries(UI_AUDIT_SCENARIO_CONTRACTS)) {
      expect(contract.mode).toBe("read-only");
      expect(parseUiAuditScenarioForRoute(scenario, contract.route, "development"))
        .toBe(scenario);
      expect(parseUiAuditScenarioForRoute(scenario, contract.route, "production"))
        .toBeNull();
    }

    expect(parseUiAuditScenarioForRoute(
      "analytics-first-run",
      "/app",
      "development",
    )).toBeNull();
    expect(parseUiAuditScenarioForRoute(
      "dashboard-stale",
      "/app/analitik",
      "development",
    )).toBeNull();
  });
});
