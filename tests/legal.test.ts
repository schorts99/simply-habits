import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legalConfig, legalMetadata } from "@/shared/legal/config";
import sitemap from "@/app/sitemap";

beforeEach(() => {
  vi.stubEnv("LEGAL_OPERATOR_NAME", "");
  vi.stubEnv("LEGAL_CONTACT_EMAIL", "");
  vi.stubEnv("LEGAL_EFFECTIVE_DATE", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://habits.example.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("Legal publication configuration", () => {
  it("keeps incomplete policies explicitly drafted and non-indexable", () => {
    expect(legalConfig()).toMatchObject({ ready: false, email: null, effectiveDate: null });
    expect(legalConfig().operator).toContain("required before launch");
    expect(legalMetadata("Privacy Policy", "Description", "/privacy")).toMatchObject({
      alternates: { canonical: "/privacy" }, robots: { index: false, follow: false },
      openGraph: { url: "/privacy" },
    });
    expect(sitemap()).toEqual([{ url: "https://habits.example.com/" }]);
  });
  it("adds finalized pages with page-specific canonical and sharing metadata", () => {
    vi.stubEnv("LEGAL_OPERATOR_NAME", "Example operator");
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "privacy@example.com");
    vi.stubEnv("LEGAL_EFFECTIVE_DATE", "2026-11-01");
    expect(legalConfig()).toEqual({ operator: "Example operator", email: "privacy@example.com", effectiveDate: "2026-11-01", ready: true });
    expect(sitemap()).toEqual([
      { url: "https://habits.example.com/" },
      { url: "https://habits.example.com/privacy" },
      { url: "https://habits.example.com/terms" },
    ]);
    const metadata = legalMetadata("Terms of Service", "Description", "/terms");
    expect(metadata.robots).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({ title: "Terms of Service | Simply Habits", url: "/terms" });
  });
  it("rejects invalid contact/date settings instead of hiding configuration mistakes", () => {
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "not-an-email");
    expect(() => legalConfig()).toThrow("LEGAL_CONTACT_EMAIL");
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "support@example.com");
    for (const date of ["2026-02-30", "2026/11/01", "not-a-date"]) {
      vi.stubEnv("LEGAL_EFFECTIVE_DATE", date);
      expect(() => legalConfig()).toThrow();
    }
  });
});
