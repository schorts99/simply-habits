import { DomainEvent } from "@schorts/shared-kernel/domain-events";
import type { HabitModel } from "@/habits/domain/habit.entity";
import { HabitId } from "@/habits/domain/habit.entity";
import { complete, scheduled } from "@/habits/domain/habit.insights";

export type PushPreferences = {
  timezone: string;
  habitTimes: Record<string, string>;
  quotes: boolean;
  quoteTime: string;
  language?: "en" | "es";
};
export const QUOTES = [
  "A small step still moves you forward. Make room for one good thing today.",
  "You don't need a perfect day to give yourself a little care.",
  "Begin again, gently. Your next little win is waiting.",
  "Consistency grows one small choice at a time. Today counts, too.",
  "Take a breath. A little progress is enough to be proud of.",
  "Your habits are here to support you, not to measure your worth.",
  "Small steps. Good days. Keep showing up in your own way.",
];
const SPANISH_QUOTES = [
  "Un pequeño paso también te acerca a tu meta. Haz espacio para algo bueno hoy.",
  "No necesitas un día perfecto para cuidarte un poco.",
  "Vuelve a empezar con calma. Tu próximo pequeño logro te espera.",
  "La constancia crece con cada pequeña decisión. Hoy también cuenta.",
  "Respira. Un poco de progreso ya es motivo de orgullo.",
  "Tus hábitos están aquí para apoyarte, no para medir tu valor.",
  "Pequeños pasos. Buenos días. Sigue adelante a tu manera.",
];
export const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function parsePreferences(value: unknown): PushPreferences {
  if (!value || typeof value !== "object" || !("timezone" in value) || typeof value.timezone !== "string" || value.timezone.length > 100 || !("habitTimes" in value) || !value.habitTimes || typeof value.habitTimes !== "object" || Array.isArray(value.habitTimes) || !("quotes" in value) || typeof value.quotes !== "boolean" || !("quoteTime" in value) || !validTime(value.quoteTime)) throw new Error("Invalid reminder preferences.");
  const language = Object.getOwnPropertyDescriptor(value, "language")?.value;
  if (language !== undefined && language !== "en" && language !== "es") throw new Error("Invalid reminder language.");
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); }
  catch { throw new Error("Choose a valid IANA timezone."); }
  const habitTimes: Record<string, string> = {};
  if (Object.keys(value.habitTimes).length > 100) throw new Error("Use at most 100 habit reminders per device.");
  for (const [id, time] of Object.entries(value.habitTimes)) {
    if (!new HabitId(id).isValid || !validTime(time)) throw new Error("Choose a valid habit and reminder time.");
    habitTimes[id] = time;
  }
  return { timezone: value.timezone, habitTimes, quotes: value.quotes, quoteTime: value.quoteTime, ...(language === "en" || language === "es" ? { language } : {}) };
}
export function zonedClock(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return { day: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}
export type ReminderPayload = { deviceId: string; uid: string; key: string; title: string; body: string; dueAt: number };
export class ReminderDue extends DomainEvent<ReminderPayload> {
  static readonly NAME = "notifications.reminder_due";
  getEventName(): string { return ReminderDue.NAME; }
}
export function dueReminders(deviceId: string, uid: string, preferences: PushPreferences, habits: HabitModel[], now: Date, enabledAt: number): ReminderPayload[] {
  const events = new Map<string, ReminderPayload>();
  // A 10-minute recovery window tolerates a missed five-minute scheduler tick.
  for (let minute = 9; minute >= 0; minute--) {
    const slot = new Date(Math.floor(now.getTime() / 60_000) * 60_000 - minute * 60_000);
    if (slot.getTime() < enabledAt) continue;
    const clock = zonedClock(slot, preferences.timezone);
    for (const habit of habits) {
      if (preferences.habitTimes[habit.id] !== clock.time || !scheduled(habit, clock.day) || complete(habit, clock.day)) continue;
      const key = `${clock.day}-habit-${habit.id}`;
      const spanish = preferences.language === "es";
      events.set(key, { deviceId, uid, key, dueAt: slot.getTime(), title: spanish ? "Un pequeño momento para ti" : "A little moment for you", body: spanish ? "Uno de tus hábitos programados te está esperando. Abre Simply Habits para registrarlo." : "One of your scheduled habits is waiting. Open Simply Habits to check in." });
    }
    if (preferences.quotes && preferences.quoteTime === clock.time) {
      const key = `${clock.day}-encouragement`;
      const index = Math.floor(Date.parse(`${clock.day}T12:00:00Z`) / 86_400_000) % QUOTES.length;
      const spanish = preferences.language === "es";
      events.set(key, { deviceId, uid, key, dueAt: slot.getTime(), title: spanish ? "Pequeños pasos. Buenos días." : "Small steps. Good days.", body: spanish ? SPANISH_QUOTES[index] : QUOTES[index] });
    }
  }
  return [...events.values()];
}
