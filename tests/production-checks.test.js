import { describe, expect, it } from "vitest";
import { productionChecks } from "../scripts/check-production.mjs";

describe("Production configuration checks", () => {
  it("rejects missing configuration and local or malformed deployment origins", () => {
    expect(productionChecks({}).every(check => !check.ok)).toBe(true);
    for (const origin of ["http://example.test", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://test.localhost", "https://user:password@example.test", "https://example.test/path", "https://example.test?query"]) {
      expect(productionChecks({ NEXT_PUBLIC_SITE_URL: origin })[0].ok).toBe(false);
    }
    expect(productionChecks({ NEXT_PUBLIC_SITE_URL: "https://habits.example.test" })[0].ok).toBe(true);
  });
  it("rejects invalid dates and weak scheduler secrets without revealing values", () => {
    const checks = productionChecks({ LEGAL_EFFECTIVE_DATE: "2026-02-30", CRON_SECRET: "short", VAPID_PRIVATE_KEY: "secret-invalid" });
    expect(checks.find(check => check.name === "Legal effective date").ok).toBe(false);
    expect(checks.find(check => check.name.startsWith("CRON_SECRET")).ok).toBe(false);
    expect(JSON.stringify(checks)).not.toContain("secret-invalid");
  });
});
