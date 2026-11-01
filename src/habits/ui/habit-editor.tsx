"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { CATEGORIES, COLORS, PERIODS, type HabitDetails, type HabitModel } from "../domain/habit.entity";
import { errorMessage } from "@/shared/application/habit-runtime";
import { useI18n } from "@/shared/i18n";

export const defaultDetails: HabitDetails = {
  name: "", description: "", category: "Wellbeing", color: "sage", period: "Morning", target: 1, unit: "time", days: [0, 1, 2, 3, 4, 5, 6],
};
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HabitEditor({ habit, onClose, onSave, onArchive, onDelete }: {
  habit: HabitModel | null;
  onClose(): void;
  onSave(details: HabitDetails): Promise<void>;
  onArchive(): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<HabitDetails>(habit ?? defaultDetails);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try { await onSave(details); onClose(); }
    catch (error) { setError(t(errorMessage(error))); }
    finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true);
    try { await onArchive(); onClose(); }
    catch (error) { setError(t(errorMessage(error))); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { await onDelete(); onClose(); }
    catch (error) { setError(t(errorMessage(error))); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="habit-dialog" aria-labelledby="editor-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClick={event => { if (event.target === dialog.current && !busy) onClose(); }}>
    <form onSubmit={submit} className="editor-content">
      <div className="editor-header flex items-start justify-between gap-4">
        <div><p className="eyebrow">{t("MAKE ROOM FOR GOOD")}</p><h2 id="editor-title">{t(habit ? "A little fine-tuning" : "Your next small step")}</h2></div>
        <button type="button" className="icon-button" aria-label={t("Close habit editor")} onClick={onClose} disabled={busy}><X size={20} /></button>
      </div>
      <div className="editor-fields">
      <p className="muted mb-6">{t("Keep it small. Make it yours. Show up again tomorrow.")}</p>
      <label className="field">{t("Habit name")}<input autoFocus required maxLength={80} placeholder={t("e.g. Take a mindful walk")} value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} /></label>
      <label className="field">{t("A little why")} <span className="optional">{t("(optional)")}</span><input maxLength={240} placeholder={t("What will this make space for?")} value={details.description} onChange={e => setDetails({ ...details, description: e.target.value })} /></label>
      <div className="editor-field-row grid grid-cols-2 gap-4">
        <label className="field">{t("Category")}<select value={details.category} onChange={e => { const category = CATEGORIES.find(c => c === e.target.value); if (category) setDetails({ ...details, category }); }}>{CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}</select></label>
        <label className="field">{t("Time of day")}<select value={details.period} onChange={e => { const period = PERIODS.find(p => p === e.target.value); if (period) setDetails({ ...details, period }); }}>{PERIODS.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></label>
      </div>
      <div className="editor-field-row grid grid-cols-[1fr_2fr] gap-4">
        <label className="field">{t("Daily target")}<input type="number" min={1} max={1000} required value={details.target} onChange={e => setDetails({ ...details, target: Number(e.target.value) })} /></label>
        <label className="field">{t("Unit")}<input required maxLength={24} placeholder={t("glasses, pages, minutes...")} value={details.unit} onChange={e => setDetails({ ...details, unit: e.target.value })} /></label>
      </div>
      <fieldset className="field"><legend>{t("Repeat on")}</legend><div className="day-options">{[1, 2, 3, 4, 5, 6, 0].map(day => <button type="button" key={day} aria-pressed={details.days.includes(day)} className={details.days.includes(day) ? "selected" : ""} onClick={() => setDetails({ ...details, days: details.days.includes(day) ? details.days.filter(d => d !== day) : [...details.days, day].sort() })}>{t(weekdays[day])}</button>)}</div></fieldset>
      <fieldset className="field"><legend>{t("A splash of color")}</legend><div className="flex gap-3">{COLORS.map(color => <button key={color} type="button" className={`color-option tint-${color}`} aria-label={t(`${color} color`)} aria-pressed={details.color === color} onClick={() => setDetails({ ...details, color })}>{details.color === color && <Check size={18} />}</button>)}</div></fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      {habit && <div className="archive-area">{confirmArchive ? <><p>{t("Your history stays safe. You can restore this habit in Settings.")}</p><button type="button" className="text-button danger" disabled={busy} onClick={archive}>{t("Yes, archive this habit")}</button><button type="button" className="text-button ml-4" onClick={() => setConfirmArchive(false)}>{t("Keep it")}</button></> : <button type="button" className="text-button danger" onClick={() => setConfirmArchive(true)}>{t("Archive habit")}</button>}</div>}
      {habit && <div className="archive-area">{confirmDelete ? <><p>{t("Export first. Deleting removes this habit’s content and history. A minimal deletion marker prevents old devices or backups from bringing it back.")}</p><button type="button" className="text-button danger" disabled={busy} onClick={remove}>{t("Yes, permanently delete")}</button><button type="button" className="text-button ml-4" disabled={busy} onClick={() => setConfirmDelete(false)}>{t("Cancel")}</button></> : <button type="button" className="text-button danger" disabled={busy} onClick={() => setConfirmDelete(true)}>{t("Delete habit permanently")}</button>}</div>}
      </div>
      <div className="editor-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t("Cancel")}</button><button type="submit" className="button primary" disabled={busy}>{t(busy ? "Saving..." : habit ? "Save changes" : "Create habit")}</button></div>
    </form>
  </dialog>;
}
