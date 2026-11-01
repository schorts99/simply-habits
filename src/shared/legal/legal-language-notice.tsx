"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation preserves offline access through the service worker. */

import { useI18n } from "@/shared/i18n";
import { ShieldCheck } from "lucide-react";
import { ArrowLeft } from "lucide-react";

export function LegalLanguageNotice() {
  const { language, t } = useI18n();
  return language === "es"
    ? <p className="configuration-note" role="note">{t("The policy text is currently available in English. Spanish policy translations are not available yet.")}</p>
    : null;
}

export function LegalIntro({ title, summary, effectiveDate, draft }: {
  title: string; summary: string; effectiveDate: string | null; draft: boolean;
}) {
  const { t } = useI18n();
  return <>
    <p className="eyebrow">{t("YOUR HABITS, YOUR TRUST")}</p>
    <h1>{t(title)}</h1>
    <p className="legal-summary">{t(summary)}</p>
    <p className="legal-date">{effectiveDate ? t("Effective date: {date}", { date: effectiveDate }) : t("Draft prepared November 1, 2026 · Effective date not yet set")}</p>
    {draft && <aside className="legal-draft" role="note"><ShieldCheck size={20} /><div><strong>{t("Pre-launch draft — not a finalized policy")}</strong><p>{t("The operator, public contact email, and effective date must be configured before launch. The operator must review these pages for its actual deployment, business practices, and applicable law.")}</p></div></aside>}
  </>;
}

export function LegalBackLink() {
  const { t } = useI18n();
  return <a className="text-button" href="/"><ArrowLeft size={16} /> {t("Back to habits")}</a>;
}
