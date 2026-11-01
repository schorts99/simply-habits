"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Bell, LoaderCircle } from "lucide-react";
import { errorMessage } from "@/shared/application/habit-runtime";
import type { HabitModel } from "@/habits/domain/habit.entity";
import { parsePreferences, type PushPreferences } from "../domain/reminder";
import { browserDeviceId, disableDevice, enableDevice, existingSubscription, notificationRequest, supportsPush, vapidPublicKey } from "../application/device-client";
import { useI18n } from "@/shared/i18n";

export function NotificationSettings({ user, habits, online, pending }: { user: User | null; habits: HabitModel[]; online: boolean; pending: number }) {
  const { t, language } = useI18n();
  const [preferences, setPreferences] = useState<PushPreferences>({ timezone: "UTC", habitTimes: {}, quotes: false, quoteTime: "09:00", language: "en" });
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const supported = supportsPush();
      setSupported(supported);
      setPreferences(previous => ({ ...previous, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
      if (!supported || !user || !vapidPublicKey) return;
      const subscription = await existingSubscription();
      if (!subscription) return;
      const data = await notificationRequest(user, `/api/notifications?device=${await browserDeviceId(subscription.endpoint)}`, "GET");
      if (!cancelled && data && typeof data === "object" && "preferences" in data && data.preferences) {
        setPreferences(parsePreferences(data.preferences));
        setEnabled(Notification.permission === "granted");
      }
    }).catch(error => {
      console.error("Loading notification settings failed:", error);
      if (!cancelled) setError(errorMessage(error));
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [user]);
  async function perform(action: "save" | "disable" | "test") {
    if (!user) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (action === "disable") {
        await disableDevice(user); setEnabled(false); setMessage(t("Notifications are off on this device."));
      } else if (action === "test") {
        const subscription = await existingSubscription();
        if (!subscription) throw new Error(t("Enable notifications first."));
        await notificationRequest(user, "/api/notifications/test", "POST", { device: await browserDeviceId(subscription.endpoint) });
        setMessage(t("Your push service accepted the test. Delivery depends on browser and system notification settings."));
      } else {
        // Permission must be requested directly from this user gesture, before token/network awaits.
        if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") throw new Error(t("Notification permission was not granted. You can change it in your browser settings."));
        const activeIds = new Set(habits.filter(h => !h.archived).map(h => h.id));
        const clean = { ...preferences, language, habitTimes: Object.fromEntries(Object.entries(preferences.habitTimes).filter(([id]) => activeIds.has(id))) };
        await enableDevice(user, clean);
        setPreferences(clean); setEnabled(true);
        setMessage(t("Saved for this device. Reminders use your selected timezone and the latest cloud-synced progress."));
      }
    } catch (error) { console.error("Notification action failed:", error); setError(t(errorMessage(error))); }
    finally { setBusy(false); }
  }
  const canUse = loaded && supported && !!user && !!vapidPublicKey;
  return <section className="panel settings-panel">
    <div className="settings-heading"><span className="settings-symbol tint-lavender"><Bell size={24} /></span><div><h2>{t("A gentle nudge")}</h2><p className="muted">{t("Opt-in reminders, even when the app is closed.")}</p></div></div>
    <p>{t("Choose one reminder time per habit and an optional daily encouragement. Notifications keep habit names private on your lock screen.")}</p>
    {!user && <p className="configuration-note">{t("Connect with Google above to schedule Web Push reminders.")}</p>}
    {!vapidPublicKey && <p className="configuration-note">{t("Web Push needs VAPID keys and a server scheduler. See the project README for deployment setup.")}</p>}
    {loaded && !supported && <p className="configuration-note">{t("Web Push is unavailable in this browser. On iPhone/iPad, use an installed home-screen app on iOS 16.4 or newer. HTTPS is required on deployed sites.")}</p>}
    {canUse && <div className="reminder-options">
      <label className="field">{t("Reminder timezone")}<input value={preferences.timezone} maxLength={100} onChange={e => setPreferences({ ...preferences, timezone: e.target.value })} /><span className="settings-hint">{t("IANA timezone, such as America/Denver. Daylight saving is handled automatically. Update this when you travel.")}</span></label>
      {habits.filter(h => !h.archived).map(h => <div className="reminder-row" key={h.id}>
        <label><input type="checkbox" checked={!!preferences.habitTimes[h.id]} onChange={e => {
          const habitTimes = { ...preferences.habitTimes };
          if (e.target.checked) habitTimes[h.id] = "09:00"; else delete habitTimes[h.id];
          setPreferences({ ...preferences, habitTimes });
        }} /> {h.name}</label>
        <input aria-label={t("Reminder time for {name}", { name: h.name })} type="time" disabled={!preferences.habitTimes[h.id]} value={preferences.habitTimes[h.id] ?? "09:00"} onChange={e => setPreferences({ ...preferences, habitTimes: { ...preferences.habitTimes, [h.id]: e.target.value } })} />
      </div>)}
      <div className="reminder-row"><label><input type="checkbox" checked={preferences.quotes} onChange={e => setPreferences({ ...preferences, quotes: e.target.checked })} /> {t("Daily encouragement")}</label><input type="time" aria-label={t("Daily encouragement time")} disabled={!preferences.quotes} value={preferences.quoteTime} onChange={e => setPreferences({ ...preferences, quoteTime: e.target.value })} /></div>
      {pending > 0 && <p className="settings-hint">{t("Sync your pending habits before saving reminders. Offline check-ins cannot suppress a reminder until they sync.")}</p>}
      <div className="flex flex-wrap gap-3 mt-5"><button className="button primary" disabled={busy || !online || pending > 0} onClick={() => { void perform("save"); }}>{busy ? <LoaderCircle size={16} className="spin" /> : <Bell size={16} />}{t(enabled ? "Save reminder settings" : "Enable notifications")}</button>{enabled && <><button className="button secondary" disabled={busy || !online} onClick={() => { void perform("test"); }}>{t("Send test")}</button><button className="text-button" disabled={busy || !online} onClick={() => { void perform("disable"); }}>{t("Turn off on this device")}</button></>}</div>
      <p className="settings-hint">{t("Reminders run on scheduled weekdays and skip completed or archived habits. Delivery is usually within five minutes, not exact-time guaranteed. Each device has separate preferences. Signing out unsubscribes this device.")}</p>
      {enabled && <p className="settings-hint">{t("Save reminder settings to update the language used by push notifications.")}</p>}
    </div>}
    {error && <p className="form-error mt-4" role="alert">{error}</p>}
    {message && <p className="configuration-note" role="status">{message}</p>}
  </section>;
}
