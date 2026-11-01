import type { Metadata, Viewport } from "next";
import { isPublicSite, resolveSiteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SOCIAL_IMAGE } from "@/shared/seo/site";
import "./globals.css";
import { ThemeObserver } from "@/shared/theme";

const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: isPublicSite(siteUrl), follow: isPublicSite(siteUrl) },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["es_ES"],
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Simply Habits" },
  icons: { icon: "/brand.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#52664b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initializeTheme = `try{var t=localStorage.getItem("simply-habits.theme");var d=t==="light"||t==="dark"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=d}catch{document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}`;
  return <html lang="en" data-theme="light" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: initializeTheme }} /></head><body><ThemeObserver />{children}</body></html>;
}
