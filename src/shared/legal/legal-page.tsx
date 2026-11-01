/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation preserves offline access through the service worker. */
import Image from "next/image";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { legalConfig } from "./config";
import { LegalLinks } from "./legal-links";

export function LegalContact() {
  const config = legalConfig();
  return config.email
    ? <a href={`mailto:${config.email}`}>{config.email}</a>
    : <strong>[Public support/privacy email — required before launch]</strong>;
}

export function LegalPage({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  const config = legalConfig();
  return <div className="legal-shell">
    <header className="legal-header"><a href="/" className="legal-brand"><Image src="/brand.svg" alt="" width={38} height={38} priority /><span>simply habits.</span></a><a className="text-button" href="/"><ArrowLeft size={16} /> Back to habits</a></header>
    <main className="legal-document">
      <p className="eyebrow">YOUR HABITS, YOUR TRUST</p><h1>{title}</h1><p className="legal-summary">{summary}</p>
      <p className="legal-date">{config.effectiveDate ? `Effective date: ${config.effectiveDate}` : "Draft prepared November 1, 2026 · Effective date not yet set"}</p>
      {!config.ready && <aside className="legal-draft" role="note"><ShieldCheck size={20} /><div><strong>Pre-launch draft — not a finalized policy</strong><p>The operator, public contact email, and effective date must be configured before launch. The operator must review these pages for its actual deployment, business practices, and applicable law.</p></div></aside>}
      <div className="legal-content">{children}</div>
    </main>
    <footer className="legal-footer"><span>Simply Habits · Little by little.</span><LegalLinks /></footer>
  </div>;
}
