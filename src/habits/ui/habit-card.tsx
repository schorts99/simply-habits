"use client";

import { Check, Flame, Minus, MoreHorizontal, Plus, X } from "lucide-react";
import type { HabitModel } from "../domain/habit.entity";
import type { CheckInChange } from "../check-in/check-in.command";
import { complete, streak } from "../domain/habit.insights";
import { shiftDate, weekday } from "@/shared/domain/calendar";
import { HabitIcon } from "./habit-icon";
import { useI18n } from "@/shared/i18n";

export function HabitCard({ habit, day, today, busy, onChange, onEdit }: {
  habit: HabitModel; day: string; today: string; busy: boolean; onChange(change: CheckInChange): void; onEdit(): void;
}) {
  const { t, locale } = useI18n();
  const entry = habit.entries[day];
  const count = entry?.count ?? 0, target = entry?.target ?? habit.target;
  const done = complete(habit, day);
  const quit = habit.kind === "quit";
  const outcome = entry?.outcome ?? "unknown";
  const run = streak(habit, today);
  return <article className={`habit-card ${done ? "is-complete" : ""}`}>
    <div className="flex items-start gap-4">
      <div className={`habit-symbol tint-${habit.color}`}><HabitIcon category={habit.category} /></div>
      <div className="min-w-0 flex-1"><p className="card-category">{t(habit.category)} <span>·</span> {t(habit.period)}{quit && <> <span>·</span> {t("Quit a habit")}</>}</p><h3>{habit.name}</h3><p className="habit-description">{habit.description || (quit ? t("One day at a time. A lapse is a chance to begin again.") : t("{target} {unit} of something good.", { target, unit: habit.unit }))}</p></div>
      <button className="icon-button edit-button" disabled={busy} aria-label={t("Edit {name}", { name: habit.name })} onClick={onEdit}><MoreHorizontal size={20} /></button>
    </div>
    {quit ? <p className="habit-progress" role="status">{t(outcome === "success" ? "Success recorded" : outcome === "lapse" ? "Lapse recorded" : "Not recorded")}</p> : <><div className="habit-progress"><span><strong>{count}</strong><span className="muted"> / {target} {habit.unit}</span></span>{done ? <span className="done-label"><Check size={13} /> {t("All done")}</span> : <span className="muted text-xs">{Math.round(count / target * 100)}%</span>}</div>
    <div className="progress-track"><div className={`progress-fill fill-${habit.color}`} style={{ width: `${Math.min(100, count / target * 100)}%` }} /></div></>}
    <div className="card-bottom">
      <div className="habit-week" aria-label={t("Last seven days")}>{Array.from({ length: 7 }, (_, i) => shiftDate(day, i - 6)).map(date => {
        const checked = complete(habit, date);
        const due = date >= habit.created_on && habit.days.includes(weekday(date));
        const label = checked ? "complete" : !due ? "not scheduled" : quit ? habit.entries[date]?.outcome === "lapse" ? "Lapse recorded" : "Not recorded" : "not complete";
        return <span key={date} title={`${date}: ${t(label)}`} aria-label={`${date}: ${t(label)}`} className={checked ? "checked" : !due ? "not-scheduled" : ""}>{checked ? <Check size={10} /> : quit && habit.entries[date]?.outcome === "lapse" ? <X size={10} /> : new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</span>;
      })}</div>
      {quit ? <div className="check-controls flex-wrap">
        <button className={`check-button ${done ? "done" : ""}`} disabled={busy} aria-pressed={done} aria-label={t("Record success for {name}", { name: habit.name })} onClick={() => onChange("success")}>{t("Success")}</button>
        <button className="text-button" disabled={busy} aria-pressed={outcome === "lapse"} aria-label={t("Record lapse for {name}", { name: habit.name })} onClick={() => onChange("lapse")}>{t("Lapse")}</button>
        {outcome !== "unknown" && <button className="text-button" disabled={busy} aria-label={t("Undo outcome for {name}", { name: habit.name })} onClick={() => onChange("unknown")}>{t("Undo")}</button>}
      </div> : <div className="check-controls">{count > 0 && !done && <button className="decrement" disabled={busy} aria-label={t("Undo one {unit} for {name}", { unit: habit.unit, name: habit.name })} onClick={() => onChange(-1)}><Minus size={15} /></button>}<button className={`check-button ${done ? "done" : ""}`} disabled={busy} aria-label={t(done ? "Undo check-in for {name}" : "Check in {name}", { name: habit.name })} onClick={() => onChange(done ? -1 : 1)}>{done ? <Check size={18} /> : <Plus size={18} />}{t(done ? "Done" : "Check in")}</button></div>}
    </div>
    {run > 0 && <p className="streak-line"><Flame size={13} /> {t("{count} scheduled-day streak", { count: run })} <span>{t("· Keep your spark going")}</span></p>}
  </article>;
}
