"use client";

import { useState } from "react";
import { Check, Flame, Minus, MoreHorizontal, Plus, X } from "lucide-react";
import type { HabitModel } from "../domain/habit.entity";
import type { CheckInChange } from "../check-in/check-in.command";
import { complete, streak } from "../domain/habit.insights";
import { shiftDate, weekday } from "@/shared/domain/calendar";
import { HabitIcon } from "./habit-icon";
import { useI18n } from "@/shared/i18n";

export function HabitCard({ habit, day, today, busy, onChange, onEdit, onSelectDay }: {
  habit: HabitModel; day: string; today: string; busy: boolean; onChange(change: CheckInChange): Promise<boolean>; onEdit(): void; onSelectDay(day: string): void;
}) {
  const { t, locale } = useI18n();
  const [editingCount, setEditingCount] = useState(false);
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
        const description = t("View {date}: {status}", { date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00`)), status: t(label) });
        return <button type="button" key={date} title={description} aria-label={description} disabled={busy || date < habit.created_on} className={checked ? "checked" : !due ? "not-scheduled" : ""} onClick={() => onSelectDay(date)}><span>{checked ? <Check size={14} /> : quit && habit.entries[date]?.outcome === "lapse" ? <X size={14} /> : new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</span></button>;
      })}</div>
      {quit ? <div className="check-controls flex-wrap">
        <button className={`check-button ${done ? "done" : ""}`} disabled={busy} aria-pressed={done} aria-label={t("Record success for {name}", { name: habit.name })} onClick={() => { void onChange("success"); }}>{t("Success")}</button>
        <button className="text-button" disabled={busy} aria-pressed={outcome === "lapse"} aria-label={t("Record lapse for {name}", { name: habit.name })} onClick={() => { void onChange("lapse"); }}>{t("Lapse")}</button>
        {outcome !== "unknown" && <button className="text-button" disabled={busy} aria-label={t("Undo outcome for {name}", { name: habit.name })} onClick={() => { void onChange("unknown"); }}>{t("Undo")}</button>}
      </div> : <div className="check-controls">{count > 0 && !done && <button className="decrement" disabled={busy} aria-label={t("Undo one {unit} for {name}", { unit: habit.unit, name: habit.name })} onClick={() => { void onChange(-1); }}><Minus size={15} /></button>}<button className={`check-button ${done ? "done" : ""}`} disabled={busy} aria-label={t(done ? "Undo check-in for {name}" : "Check in {name}", { name: habit.name })} onClick={() => { void onChange(done ? -1 : 1); }}>{done ? <Check size={18} /> : <Plus size={18} />}{t(done ? "Done" : "Check in")}</button></div>}
    </div>
    {!quit && target > 1 && (editingCount ? <form className="quantity-form" onSubmit={async event => {
      event.preventDefault();
      const count = Number(new FormData(event.currentTarget).get("count"));
      if (await onChange({ count })) setEditingCount(false);
    }}>
      <label className="field">{t("Total for {date}", { date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00`)) })}<input name="count" type="number" min={0} max={target} step={1} required defaultValue={count} autoFocus disabled={busy} /></label>
      <span className="muted">{t("of {target} {unit}", { target, unit: habit.unit })}</span>
      <button className="button primary" disabled={busy} type="submit">{t("Save total")}</button>
      <button className="text-button" disabled={busy} type="button" onClick={() => setEditingCount(false)}>{t("Cancel")}</button>
    </form> : <button className="text-button quantity-toggle" disabled={busy} aria-label={t("Set total for {name}", { name: habit.name })} onClick={() => setEditingCount(true)}>{t("Set total")}</button>)}
    {run > 0 && <p className="streak-line"><Flame size={13} /> {t("{count} scheduled-day streak", { count: run })} <span>{t("· Keep your spark going")}</span></p>}
  </article>;
}
