import { Award, CheckCheck, Flame, TrendingUp } from "lucide-react";
import type { HabitModel } from "../domain/habit.entity";
import { complete, insightSummary, progress, streak } from "../domain/habit.insights";
import { dateObject, shiftDate } from "@/shared/domain/calendar";
import { HabitIcon } from "./habit-icon";
import { useI18n } from "@/shared/i18n";

export function Insights({ habits, today }: { habits: HabitModel[]; today: string }) {
  const { t, locale } = useI18n();
  const summary = insightSummary(habits, today);
  const active = habits.filter(h => !h.archived);
  const heatmap = Array.from({ length: 84 }, (_, i) => {
    const day = shiftDate(today, i - 83);
    return { day, ...progress(active, day) };
  });
  return <div className="view-enter">
    <div className="page-heading"><div><p className="eyebrow">{t("PROGRESS, NOT PERFECTION")}</p><h1>{t("Look how far you’ve come.")}</h1><p className="muted">{t("Every little check-in is a vote for the person you’re becoming.")}</p></div></div>
    <div className="insight-stats">
      <div className="stat-card"><span className="stat-icon tint-sage"><CheckCheck size={20} /></span><strong>{summary.checkIns}</strong><span>{t("Days completed, all time")}</span></div>
      <div className="stat-card"><span className="stat-icon tint-peach"><Flame size={20} /></span><strong>{summary.bestStreak}<small> {t("days")}</small></strong><span>{t("Longest current streak")}</span></div>
      <div className="stat-card"><span className="stat-icon tint-lavender"><TrendingUp size={20} /></span><strong>{summary.weeklyRate}<small>%</small></strong><span>{t("Last 7 days, scheduled habits")}</span></div>
    </div>
    <section className="panel activity-panel"><div className="section-heading"><div><p className="eyebrow">{t("THE BIGGER PICTURE")}</p><h2>{t("Your consistency garden")}</h2></div><span className="subtle-label">{t("Last 12 weeks")}</span></div><p className="muted text-sm">{t("A little green, a little growth. Blank days are a chance to begin again.")}</p><div className="heatmap">{heatmap.map(d => <div key={d.day} className={`heat-cell level-${d.total === 0 ? "none" : d.percent === 100 ? 4 : d.percent >= 66 ? 3 : d.percent > 0 ? 2 : 1}`} tabIndex={0} title={`${d.day}: ${t("{completed} of {total} habits completed", { completed: d.completed, total: d.total })}`} aria-label={`${d.day}: ${t("{completed} of {total} habits completed", { completed: d.completed, total: d.total })}`} />)}</div><div className="heatmap-legend"><span>{t("Less")}</span>{[1, 2, 3, 4].map(n => <span key={n} className={`heat-cell level-${n}`} />)}<span>{t("More")}</span></div></section>
    <div className="insight-grid"><section className="panel"><div className="section-heading"><h2>{t("This week, in small steps")}</h2><TrendingUp size={20} className="muted" /></div><div className="week-chart">{summary.week.map(d => <div key={d.day} className="chart-day"><span>{d.total ? `${d.percent}%` : "—"}</span><div className="bar-track"><div style={{ height: `${d.percent}%` }} /></div><span>{dateObject(d.day).toLocaleDateString(locale, { weekday: "short" })}</span></div>)}</div></section><section className="panel"><div className="section-heading"><h2>{t("Your growing habits")}</h2><Award size={20} className="muted" /></div>{!active.length && <p className="muted py-6">{t("Create your first habit to start growing your story.")}</p>}<div className="habit-ranking">{active.map(h => <div key={h.id}><span className={`mini-symbol tint-${h.color}`}><HabitIcon category={h.category} size={18} /></span><div><strong>{h.name}</strong><span>{t("{count} days completed", { count: Object.values(h.entries).filter(e => e.count >= e.target).length })}</span></div><span className="ranking-streak"><Flame size={13} /> {streak(h, today)}</span></div>)}</div></section></div>
    {habits.some(h => complete(h, today)) && <p className="insight-note">{t("You showed up today. That’s something to be proud of.")}</p>}
  </div>;
}
