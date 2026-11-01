import type { Metadata } from "next";
import { SOCIAL_IMAGE } from "@/shared/seo/site";
import { isCalendarDate } from "@/shared/domain/calendar";

export function legalConfig() {
  const operator = process.env.LEGAL_OPERATOR_NAME?.trim() || "";
  const email = process.env.LEGAL_CONTACT_EMAIL?.trim() || "";
  const effectiveDate = process.env.LEGAL_EFFECTIVE_DATE?.trim() || "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("LEGAL_CONTACT_EMAIL must be a valid public contact email.");
  if (effectiveDate && !isCalendarDate(effectiveDate)) throw new Error("LEGAL_EFFECTIVE_DATE must be a valid YYYY-MM-DD date.");
  return {
    operator: operator || "[Operator name — required before launch]",
    email: email || null,
    effectiveDate: effectiveDate || null,
    ready: !!(operator && email && effectiveDate),
  };
}

export function legalMetadata(title: string, description: string, path: string): Metadata {
  const configured = legalConfig().ready;
  return {
    title,
    description,
    alternates: { canonical: path },
    ...(!configured ? { robots: { index: false, follow: false } } : {}),
    openGraph: { title: `${title} | Simply Habits`, description, url: path, type: "website", images: [SOCIAL_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} | Simply Habits`, description, images: [SOCIAL_IMAGE] },
  };
}
