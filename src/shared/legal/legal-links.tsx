// Document navigation lets the service worker serve legal HTML offline without an RSC request.
export function LegalLinks() {
  return <nav className="legal-links" aria-label="Legal information"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></nav>;
}
