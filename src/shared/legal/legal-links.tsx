"use client";
import { useI18n } from "@/shared/i18n";

// Document navigation lets the service worker serve legal HTML offline without an RSC request.
export function LegalLinks() {
  const { t } = useI18n();
  return <nav className="legal-links" aria-label={t("Legal information")}><a href="/privacy">{t("Privacy Policy")}</a><a href="/terms">{t("Terms of Service")}</a></nav>;
}
