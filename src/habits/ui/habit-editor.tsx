"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { CATEGORIES, COLORS, PERIODS, type HabitDetails, type HabitModel } from "../domain/habit.entity";
import { errorMessage } from "@/shared/application/habit-runtime";

export const defaultDetails: HabitDetails = {
  name: "", description: "", category: "Wellbeing", color: "sage", period: "Morning", target: 1, unit: "time", days: [0, 1, 2, 3, 4, 5, 6],
};
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HabitEditor({ habit, onClose, onSave, onArchive }: {
  habit: HabitModel | null;
  onClose(): void;
  onSave(details: HabitDetails): Promise<void>;
  onArchive(): Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<HabitDetails>(habit ?? defaultDetails);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try { await onSave(details); onClose(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true);
    try { await onArchive(); onClose(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="habit-dialog" aria-labelledby="editor-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClick={event => { if (event.target === dialog.current && !busy) onClose(); }}>
    <form onSubmit={submit} className="editor-content">
      <div className="flex items-start justify-between gap-4">
        <div><p className="eyebrow">MAKE ROOM FOR GOOD</p><h2 id="editor-title">{habit ? "A little fine-tuning" : "Your next small step"}</h2></div>
        <button type="button" className="icon-button" aria-label="Close habit editor" onClick={onClose} disabled={busy}><X size={20} /></button>
      </div>
      <p className="muted mb-6">Keep it small. Make it yours. Show up again tomorrow.</p>
      <label className="field">Habit name<input autoFocus required maxLength={80} placeholder="e.g. Take a mindful walk" value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} /></label>
      <label className="field">A little why <span className="optional">(optional)</span><input maxLength={240} placeholder="What will this make space for?" value={details.description} onChange={e => setDetails({ ...details, description: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">Category<select value={details.category} onChange={e => { const category = CATEGORIES.find(c => c === e.target.value); if (category) setDetails({ ...details, category }); }}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Time of day<select value={details.period} onChange={e => { const period = PERIODS.find(p => p === e.target.value); if (period) setDetails({ ...details, period }); }}>{PERIODS.map(p => <option key={p}>{p}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-[1fr_2fr] gap-4">
        <label className="field">Daily target<input type="number" min={1} max={1000} required value={details.target} onChange={e => setDetails({ ...details, target: Number(e.target.value) })} /></label>
        <label className="field">Unit<input required maxLength={24} placeholder="glasses, pages, minutes..." value={details.unit} onChange={e => setDetails({ ...details, unit: e.target.value })} /></label>
      </div>
      <fieldset className="field"><legend>Repeat on</legend><div className="day-options">{[1, 2, 3, 4, 5, 6, 0].map(day => <button type="button" key={day} aria-pressed={details.days.includes(day)} className={details.days.includes(day) ? "selected" : ""} onClick={() => setDetails({ ...details, days: details.days.includes(day) ? details.days.filter(d => d !== day) : [...details.days, day].sort() })}>{weekdays[day]}</button>)}</div></fieldset>
      <fieldset className="field"><legend>A splash of color</legend><div className="flex gap-3">{COLORS.map(color => <button key={color} type="button" className={`color-option tint-${color}`} aria-label={`${color} color`} aria-pressed={details.color === color} onClick={() => setDetails({ ...details, color })}>{details.color === color && <Check size={18} />}</button>)}</div></fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="editor-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{busy ? "Saving..." : habit ? "Save changes" : "Create habit"}</button></div>
      {habit && <div className="archive-area">{confirmArchive ? <><p>Your history stays safe. You can restore this habit in Settings.</p><button type="button" className="text-button danger" disabled={busy} onClick={archive}>Yes, archive this habit</button><button type="button" className="text-button ml-4" onClick={() => setConfirmArchive(false)}>Keep it</button></> : <button type="button" className="text-button danger" onClick={() => setConfirmArchive(true)}>Archive habit</button>}</div>}
    </form>
  </dialog>;
}
