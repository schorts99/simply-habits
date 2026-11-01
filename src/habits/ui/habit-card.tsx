"use client";

import { Check, Flame, Minus, MoreHorizontal, Plus } from "lucide-react";
import type { HabitModel } from "../domain/habit.entity";
import { complete, streak } from "../domain/habit.insights";
import { shiftDate, weekday } from "@/shared/domain/calendar";
import { HabitIcon } from "./habit-icon";
import { useI18n } from "@/shared/i18n";

export function HabitCard({ habit, day, today, busy, onChange, onEdit }: {
  habit: HabitModel; day: string; today: string; busy: boolean; onChange(delta: number): void; onEdit(): void;
}) {
  const { t, locale } = useI18n();
  const entry = habit.entries[day];
  const count = entry?.count ?? 0, target = entry?.target ?? habit.target;
  const done = complete(habit, day);
  const run = streak(habit, today);
  return <article className={`habit-card ${done ? "is-complete" : ""}`}>
    <div className="flex items-start gap-4">
      <div className={`habit-symbol tint-${habit.color}`}><HabitIcon category={habit.category} /></div>
      <div className="min-w-0 flex-1"><p className="card-category">{t(habit.category)} <span>·</span> {t(habit.period)}</p><h3>{habit.name}</h3><p className="habit-description">{habit.description || t("{target} {unit} of something good.", { target, unit: habit.unit })}</p></div>
      <button className="icon-button edit-button" disabled={busy} aria-label={t("Edit {name}", { name: habit.name })} onClick={onEdit}><MoreHorizontal size={20} /></button>
    </div>
    <div className="habit-progress"><span><strong>{count}</strong><span className="muted"> / {target} {habit.unit}</span></span>{done ? <span className="done-label"><Check size={13} /> {t("All done")}</span> : <span className="muted text-xs">{Math.round(count / target * 100)}%</span>}</div>
    <div className="progress-track"><div className={`progress-fill fill-${habit.color}`} style={{ width: `${Math.min(100, count / target * 100)}%` }} /></div>
    <div className="card-bottom">
      <div className="habit-week" aria-label={t("Last seven days")}>{Array.from({ length: 7 }, (_, i) => shiftDate(day, i - 6)).map(date => {
        const checked = complete(habit, date);
        const due = date >= habit.created_on && habit.days.includes(weekday(date));
        const label = checked ? "complete" : due ? "not complete" : "not scheduled";
        return <span key={date} title={`${date}: ${t(label)}`} className={checked ? "checked" : !due ? "not-scheduled" : ""}>{checked ? <Check size={10} /> : new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</span>;
      })}</div>
      <div className="check-controls">{count > 0 && !done && <button className="decrement" disabled={busy} aria-label={t("Undo one {unit} for {name}", { unit: habit.unit, name: habit.name })} onClick={() => onChange(-1)}><Minus size={15} /></button>}<button className={`check-button ${done ? "done" : ""}`} disabled={busy} aria-label={t(done ? "Undo check-in for {name}" : "Check in {name}", { name: habit.name })} onClick={() => onChange(done ? -1 : 1)}>{done ? <Check size={18} /> : <Plus size={18} />}{t(done ? "Done" : "Check in")}</button></div>
    </div>
    {run > 0 && <p className="streak-line"><Flame size={13} /> {t("{count} scheduled-day streak", { count: run })} <span>{t("· Keep your spark going")}</span></p>}
  </article>;
}
