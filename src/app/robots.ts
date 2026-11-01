import type { MetadataRoute } from "next";
import { isPublicSite, resolveSiteUrl } from "@/shared/seo/site";

export default function robots(): MetadataRoute.Robots {
  const site = resolveSiteUrl();
  return {
    rules: isPublicSite(site)
      ? { userAgent: "*", allow: "/", disallow: ["/api/"] }
      : { userAgent: "*", disallow: "/" },
    ...(isPublicSite(site) ? { sitemap: new URL("/sitemap.xml", site).href } : {}),
  };
}
