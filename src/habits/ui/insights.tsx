import { useState } from "react";
import { Award, CheckCheck, Flame, TrendingUp } from "lucide-react";
import type { HabitModel } from "../domain/habit.entity";
import { complete, insightSummary, progress, scheduled, streak } from "../domain/habit.insights";
import { dateObject, shiftDate } from "@/shared/domain/calendar";
import { HabitIcon } from "./habit-icon";
import { useI18n } from "@/shared/i18n";

export function Insights({ habits, today, onSelectDay, onCreate }: { habits: HabitModel[]; today: string; onSelectDay(day: string): void; onCreate(): void }) {
  const { t, locale } = useI18n();
  const [selectedHabit, setSelectedHabit] = useState("");
  const [selectedDay, setSelectedDay] = useState(today);
  const available = habits.filter(h => !h.archived);
  const scoped = selectedHabit && available.some(h => h.id === selectedHabit) ? habits.filter(h => h.id === selectedHabit) : habits;
  const summary = insightSummary(scoped, today);
  const active = scoped.filter(h => !h.archived);
  const hasHistory = scoped.some(h => Object.keys(h.entries).length > 0);
  const selectedProgress = progress(active, selectedDay);
  const dayLabel = dateObject(selectedDay).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const heatmap = Array.from({ length: 84 }, (_, i) => {
    const day = shiftDate(today, i - 83);
    return { day, ...progress(active, day) };
  });
  return <div className="view-enter">
    <div className="page-heading"><div><p className="eyebrow">{t("PROGRESS, NOT PERFECTION")}</p><h1>{t("Look how far you’ve come.")}</h1><p className="muted">{t("Every little check-in is a vote for the person you’re becoming.")}</p></div></div>
    {available.length > 0 && <label className="field insight-filter">{t("Progress for")}<select value={selectedHabit} onChange={event => setSelectedHabit(event.target.value)}><option value="">{t("All habits")}</option>{available.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>}
    {!active.length || !hasHistory ? <section className="empty-state"><div className="empty-icon"><TrendingUp size={26} /></div><h2>{t(!active.length ? "Make room for your first habit." : "Your story starts with a check-in.")}</h2><p>{t(!active.length ? "Create a habit or restore one in Settings. Your progress will grow here." : "Record a small step today. Your weekly patterns and personal insights will appear as you go.")}</p><button className="button primary" onClick={!active.length ? onCreate : () => onSelectDay(today)}>{t(!active.length ? "New habit" : "Go to today")}</button></section> : <>
    <div className="insight-stats">
      <div className="stat-card"><span className="stat-icon tint-sage"><CheckCheck size={20} /></span><strong>{summary.checkIns}</strong><span>{t("Days completed, all time")}</span></div>
      <div className="stat-card"><span className="stat-icon tint-peach"><Flame size={20} /></span><strong>{summary.bestStreak}<small> {t("days")}</small></strong><span>{t("Longest current streak")}</span></div>
      <div className="stat-card"><span className="stat-icon tint-lavender"><TrendingUp size={20} /></span><strong>{summary.weeklyRate}<small>%</small></strong><span>{t("Last 7 days, scheduled habits")}</span></div>
    </div>
    {active.some(h => h.kind === "quit") && <section className="panel mb-6">
      <h2>{t("Quit habits: last seven days")}</h2>
      <p className="muted text-sm">{t("Unrecorded days are unknown, not successes or lapses. Completion rates count successes across all scheduled days.")}</p>
      {active.filter(h => h.kind === "quit").map(h => {
        const days = summary.week.map(d => d.day).filter(day => scheduled(h, day));
        const successes = days.filter(day => h.entries[day]?.outcome === "success").length;
        const lapses = days.filter(day => h.entries[day]?.outcome === "lapse").length;
        return <p key={h.id} className="mt-3"><strong>{h.name}</strong>: {t("{successes} successes · {lapses} lapses · {unknown} unrecorded", { successes, lapses, unknown: days.length - successes - lapses })}</p>;
      })}
    </section>}
    <section className="panel activity-panel"><div className="section-heading"><div><p className="eyebrow">{t("THE BIGGER PICTURE")}</p><h2>{t("Your consistency garden")}</h2></div><span className="subtle-label">{t("Last 12 weeks")}</span></div><p className="muted text-sm">{t("Choose a day to see its details.")}</p><div className="heatmap">{heatmap.map(d => <button key={d.day} type="button" className={`heat-cell level-${d.total === 0 ? "none" : d.percent === 100 ? 4 : d.percent >= 66 ? 3 : d.percent > 0 ? 2 : 1}`} aria-pressed={selectedDay === d.day} onClick={() => setSelectedDay(d.day)} title={`${d.day}: ${t("{completed} of {total} habits completed", { completed: d.completed, total: d.total })}`} aria-label={`${d.day}: ${t("{completed} of {total} habits completed", { completed: d.completed, total: d.total })}`} />)}</div><div className="heatmap-legend"><span>{t("Less")}</span>{[1, 2, 3, 4].map(n => <span key={n} className={`heat-cell level-${n}`} />)}<span>{t("More")}</span></div>
      <div className="day-detail" aria-live="polite"><h3>{dayLabel}</h3><p>{t("{completed} of {total} habits completed", { completed: selectedProgress.completed, total: selectedProgress.total })}</p>
        {active.filter(h => scheduled(h, selectedDay)).map(h => <p key={h.id}><strong>{h.name}</strong>: {h.kind === "quit" ? t(h.entries[selectedDay]?.outcome === "success" ? "Success recorded" : h.entries[selectedDay]?.outcome === "lapse" ? "Lapse recorded" : "Not recorded") : `${h.entries[selectedDay]?.count ?? 0} / ${h.entries[selectedDay]?.target ?? h.target} ${h.unit}`}</p>)}
        <button className="text-button" onClick={() => onSelectDay(selectedDay)}>{t("View this day")}</button>
      </div>
    </section>
    <div className="insight-grid"><section className="panel"><div className="section-heading"><h2>{t("This week, in small steps")}</h2><TrendingUp size={20} className="muted" /></div><div className="week-chart">{summary.week.map(d => <button key={d.day} type="button" className="chart-day" aria-pressed={selectedDay === d.day} aria-label={`${d.day}: ${t("{completed} of {total} habits completed", { completed: d.completed, total: d.total })}`} onClick={() => setSelectedDay(d.day)}><span>{d.total ? `${d.percent}%` : "—"}</span><span className="bar-track"><span style={{ height: `${d.percent}%` }} /></span><span>{dateObject(d.day).toLocaleDateString(locale, { weekday: "short" })}</span></button>)}</div></section><section className="panel"><div className="section-heading"><h2>{t("Your growing habits")}</h2><Award size={20} className="muted" /></div><div className="habit-ranking">{active.map(h => <div key={h.id}><span className={`mini-symbol tint-${h.color}`}><HabitIcon category={h.category} size={18} /></span><div><button className="text-button" aria-pressed={selectedHabit === h.id} onClick={() => setSelectedHabit(h.id)}>{h.name}</button><span>{t("{count} days completed", { count: Object.keys(h.entries).filter(day => complete(h, day)).length })}</span></div><span className="ranking-streak"><Flame size={13} /> {streak(h, today)}</span></div>)}</div></section></div>
    {scoped.some(h => complete(h, today)) && <p className="insight-note">{t("You showed up today. That’s something to be proud of.")}</p>}
    </>}
  </div>;
}
