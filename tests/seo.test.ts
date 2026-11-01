import { describe, expect, it, vi, afterEach } from "vitest";
import { applicationSchema, isPublicSite, resolveSiteUrl, SOCIAL_IMAGE } from "@/shared/seo/site";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import sharp from "sharp";

afterEach(() => vi.unstubAllEnvs());

describe("SEO configuration", () => {
  it("defaults to a non-indexable localhost origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveSiteUrl().href).toBe("http://localhost:3000/");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(sitemap()).toEqual([{ url: "http://localhost:3000/" }]);
  });
  it("uses the configured public origin consistently and excludes API crawling", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://habits.example.com");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
      sitemap: "https://habits.example.com/sitemap.xml",
    });
    expect(sitemap()).toEqual([{ url: "https://habits.example.com/" }]);
    expect(applicationSchema(resolveSiteUrl())).toMatchObject({
      "@type": "WebApplication",
      url: "https://habits.example.com/",
      image: "https://habits.example.com/social-cover.png",
    });
  });
  it("rejects invalid origins rather than publishing misleading canonical URLs", () => {
    for (const value of ["not a url", "ftp://example.com", "https://user:pass@example.com", "https://example.com/app", "https://example.com?x=1", "https://example.com/#fragment"]) {
      expect(() => resolveSiteUrl(value)).toThrow();
    }
    expect(isPublicSite(resolveSiteUrl("http://127.0.0.1:3000"))).toBe(false);
    expect(isPublicSite(resolveSiteUrl("http://[::1]:3000"))).toBe(false);
  });
  it("ships the exact social image dimensions declared to crawlers", async () => {
    const image = await sharp("public/social-cover.png").metadata();
    expect(image.width).toBe(SOCIAL_IMAGE.width);
    expect(image.height).toBe(SOCIAL_IMAGE.height);
    expect(image.format).toBe("png");
  });
});
