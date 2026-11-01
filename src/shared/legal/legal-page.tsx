/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation preserves offline access through the service worker. */
import Image from "next/image";
import { legalConfig } from "./config";
import { LegalLinks } from "./legal-links";
import { LegalBackLink, LegalIntro, LegalContent, LegalTagline } from "./legal-language-notice";
import { LanguageSelector } from "@/shared/ui/language-selector";

export function LegalContact() {
  const config = legalConfig();
  return config.email
    ? <a href={`mailto:${config.email}`}>{config.email}</a>
    : <strong>[Public support/privacy email — required before launch]</strong>;
}

export function LegalPage({ title, summary, children, spanish }: { title: string; summary: string; children: React.ReactNode; spanish: React.ReactNode }) {
  const config = legalConfig();
  return <div className="legal-shell">
    <header className="legal-header"><a href="/" className="legal-brand"><Image src="/brand.svg" alt="" width={38} height={38} priority /><span>simply habits.</span></a><LanguageSelector compact /><LegalBackLink /></header>
    <main className="legal-document">
      <LegalIntro title={title} summary={summary} effectiveDate={config.effectiveDate} draft={!config.ready} />
      <LegalContent spanish={spanish}>{children}</LegalContent>
    </main>
    <footer className="legal-footer"><LegalTagline /><LegalLinks /></footer>
  </div>;
}
