"use client";

import { useEffect, useState } from "react";
import type { HabitModel } from "../domain/habit.entity";
import { MAX_BACKUP_BYTES, parseBackup, type BackupPreview } from "../restore-backup/backup";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/application/habit-runtime";

export function DataSettings({ signedIn, disabled, deletionPending, habits, onPreview, onRestore, onClear, onDeleteAccount, onExport }: {
  signedIn: boolean; disabled: boolean;
  deletionPending: boolean;
  habits: HabitModel[];
  onPreview(habits: HabitModel[]): Promise<BackupPreview>;
  onRestore(habits: HabitModel[]): Promise<void>;
  onClear(): Promise<void>;
  onDeleteAccount(): Promise<void>;
  onExport(): void;
}) {
  const { t } = useI18n();
  const [backup, setBackup] = useState<HabitModel[] | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirm, setConfirm] = useState<"local" | "account" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (backup) {
      void onPreview(backup).then(result => { if (!cancelled) setPreview(result); }).catch(error => {
        console.error("Backup preview failed:", error);
        if (!cancelled) { setPreview(null); setError(errorMessage(error)); }
      });
    }
    return () => { cancelled = true; };
  }, [backup, habits, onPreview]);
  async function read(file?: File) {
    setBackup(null); setPreview(null); setError(null); setMessage(null);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 20 MB limit.");
      setBackup(parseBackup(await file.text()));
    } catch (error) { console.error("Backup validation failed:", error); setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function perform(action: "restore" | "local" | "account") {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (action === "restore" && backup) {
        await onRestore(backup); setBackup(null);
        setMessage("Backup merged. Newer edits and permanent deletions were preserved.");
      } else if (action === "local") {
        await onClear(); setMessage("Local guest habits cleared. Cloud data and other local account vaults were not changed.");
      } else if (action === "account") {
        await onDeleteAccount(); setMessage("Account deletion queued. Cleanup continues on the server; keep this device open to clear its local account copy when finished.");
      }
      setConfirm(null); setText("");
    } catch (error) { console.error("Data action failed:", error); setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="panel settings-panel">
    <h2>{t("Backups and data controls")}</h2>
    <p className="muted mt-3 mb-4">{t("Export a backup before deleting data. Restoring merges habits and preserves newer edits; it never replaces your whole vault.")}</p>
    <button className="button secondary mb-4" disabled={busy || disabled} onClick={onExport}>{t("Download backup")}</button>
    <label className="field">{t("Choose JSON backup")}<input type="file" accept=".json,application/json" disabled={busy || disabled || deletionPending} onChange={event => { void read(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {backup && <div className="configuration-note"><div><p>{t("Ready to merge {count} habits into the current vault.", { count: backup.length })}</p>
      {preview ? <><p>{t("{added} new · {merged} merged · {unchanged} unchanged · {blocked} deletion-blocked", { added: preview.added, merged: preview.merged, unchanged: preview.unchanged, blocked: preview.blocked })}</p>
        <ul>{preview.items.slice(0, 20).map((item, index) => <li key={index}>{item.name}: {t(item.outcome)}</li>)}</ul>
        {preview.items.length > 20 && <p>{t("Showing the first 20 habits. Counts include the entire backup.")}</p>}
        <p>{t("This preview reflects current local data. Restore rechecks merges atomically; later cloud changes may affect the final result.")}</p></> : <p role="status">{t("Preparing backup preview...")}</p>}
      <button className="button primary mt-3" disabled={busy || disabled || deletionPending || !preview} onClick={() => { void perform("restore"); }}>{t("Restore backup")}</button><button className="text-button ml-4" disabled={busy} onClick={() => { setBackup(null); setPreview(null); }}>{t("Cancel")}</button></div></div>}
    <div className="archive-area">
      <p>{t("Clearing local habits only clears this device’s guest vault. Sign out first to avoid losing unsynced account changes.")}</p>
      <button className="text-button danger" disabled={busy || disabled || signedIn} onClick={() => { setConfirm("local"); setText(""); }}>{t("Clear local habits")}</button>
      {signedIn && <><p className="mt-4">{t("Account deletion removes cloud habits, push subscriptions and the Firebase account, plus this device’s account vault. It does not delete your Google account, guest habits, exports, or copies on other devices.")}</p><button className="text-button danger" disabled={busy || disabled || deletionPending} onClick={() => { setConfirm("account"); setText(""); }}>{t("Delete account and cloud data")}</button></>}
    </div>
    {confirm && <div className="configuration-note"><div>
      <p>{t(confirm === "local" ? "This permanently clears local guest habits and their pending changes." : "This is permanent. Google will ask you to sign in again. Partial failures are reported; retry or contact support if deletion does not finish.")}</p>
      {confirm === "local" && <p>{t("Resetting the guest vault also removes its deletion markers; old backups may then restore deleted guest habits.")}</p>}
      <label className="field mt-3">{t("Type DELETE to confirm")}<input value={text} disabled={busy} autoComplete="off" onChange={event => setText(event.target.value)} /></label>
      <button className="button secondary" disabled={text !== "DELETE" || busy || disabled || deletionPending} onClick={() => { void perform(confirm); }}>{t("Confirm deletion")}</button>
      <button className="text-button ml-4" disabled={busy} onClick={() => setConfirm(null)}>{t("Cancel")}</button>
    </div></div>}
    {error && <p className="form-error mt-4" role="alert">{t(error)}</p>}
    {message && <p className="configuration-note" role="status">{t(message)}</p>}
  </section>;
}
