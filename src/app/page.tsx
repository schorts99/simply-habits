import { HabitApp } from "@/habits/ui/habit-app";
import { applicationSchema, resolveSiteUrl } from "@/shared/seo/site";

export default function Home() {
  const schema = JSON.stringify(applicationSchema(resolveSiteUrl())).replace(/</g, "\\u003c");
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
    <HabitApp />
    <noscript>
      <section className="no-script">
        <h2>Your habits, a little closer.</h2>
        <p>Simply Habits needs JavaScript to save habits on this device, track check-ins offline, and show your progress. Enable JavaScript to start your first habit.</p>
      </section>
    </noscript>
  </>;
}
