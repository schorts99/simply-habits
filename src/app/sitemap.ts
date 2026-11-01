import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/shared/seo/site";
import { legalConfig } from "@/shared/legal/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = resolveSiteUrl();
  const paths = legalConfig().ready ? ["/", "/privacy", "/terms"] : ["/"];
  return paths.map(path => ({ url: new URL(path, site).href }));
}
