export const SITE_NAME = "Simply Habits";
export const SITE_TITLE = "Simply Habits — Offline Habit Tracker";
export const SITE_DESCRIPTION = "Build lasting habits with a gentle, offline-first habit tracker. Track daily goals, celebrate streaks, explore your progress, and optionally sync across devices.";
export const SOCIAL_IMAGE = {
  url: "/social-cover.png",
  width: 1200,
  height: 630,
  alt: "Simply Habits — Small steps. Good days. A friendly cat beside a habit checklist on a cream and sage background.",
};

export function resolveSiteUrl(value = process.env.NEXT_PUBLIC_SITE_URL): URL {
  const url = new URL(value || "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTP(S) origin, without credentials, a path, query, or fragment.");
  }
  return url;
}

export function isPublicSite(url: URL): boolean {
  return !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function applicationSchema(url: URL) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": new URL("/#app", url).href,
    name: SITE_NAME,
    url: url.href,
    description: SITE_DESCRIPTION,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern browser with JavaScript and IndexedDB.",
    image: new URL(SOCIAL_IMAGE.url, url).href,
    featureList: [
      "Offline habit tracking",
      "Daily goals and selected weekday schedules",
      "Historical check-ins and scheduled-day streaks",
      "Progress insights",
      "Optional authenticated cloud sync",
      "Installable progressive web app",
    ],
  };
}
