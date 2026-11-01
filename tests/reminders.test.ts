import { describe, expect, it } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import { Habit, type HabitDetails } from "@/habits/domain/habit.entity";
import { dueReminders, parsePreferences, zonedClock, type PushPreferences } from "@/notifications/domain/reminder";
import { deviceId, parseSubscription } from "@/notifications/infrastructure/web-push";

const details: HabitDetails = { name: "Private habit", description: "", category: "Wellbeing", color: "sage", period: "Morning", target: 1, unit: "time", days: [0, 1, 2, 3, 4, 5, 6] };
const habit = Habit.create("7c9e6679-7425-40de-944b-e07fc1f90ae7", details, "test", "2026-01-01");
const prefs: PushPreferences = { timezone: "America/Denver", habitTimes: { [habit.id.value]: "09:00" }, quotes: true, quoteTime: "09:00" };

describe("Reminder planning", () => {
  it("plans private habit nudges and daily encouragement in the selected timezone", () => {
    const now = new Date("2026-11-01T16:04:00Z");
    const events = dueReminders("device", "user", prefs, [habit.toPrimitives()], now, 0);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ key: `2026-11-01-habit-${habit.id.value}`, dueAt: Date.parse("2026-11-01T16:00:00Z") });
    expect(events.some(e => e.body.includes("Private habit"))).toBe(false);
    expect(dueReminders("device", "user", prefs, [habit.toPrimitives()], new Date("2026-11-01T16:10:00Z"), 0)).toEqual([]);
  });
  it("uses the saved device language for private reminder and encouragement copy", () => {
    const now = new Date("2026-11-01T16:04:00Z");
    const events = dueReminders("device", "user", { ...prefs, language: "es" }, [habit.toPrimitives()], now, 0);
    expect(events[0]).toMatchObject({ title: "Un pequeño momento para ti", body: "Uno de tus hábitos programados te está esperando. Abre Simply Habits para registrarlo." });
    expect(events[1].title).toBe("Pequeños pasos. Buenos días.");
    expect(events[1].body).toMatch(/^(Un pequeño paso|No necesitas|Vuelve a empezar|La constancia|Respira|Tus hábitos|Pequeños pasos)/);
    expect(events.some(event => event.body.includes("Private habit"))).toBe(false);
  });
  it("suppresses completed, archived, unscheduled and not-yet-created habits", () => {
    const completed = Habit.fromPrimitives(habit.toPrimitives());
    completed.checkIn("2026-11-01", 1, "test", "2026-11-01");
    const now = new Date("2026-11-01T16:00:00Z");
    const onlyHabits = { ...prefs, quotes: false };
    expect(dueReminders("d", "u", onlyHabits, [completed.toPrimitives()], now, 0)).toEqual([]);
    expect(dueReminders("d", "u", onlyHabits, [{ ...habit.toPrimitives(), archived: true }], now, 0)).toEqual([]);
    expect(dueReminders("d", "u", onlyHabits, [{ ...habit.toPrimitives(), days: [1] }], now, 0)).toEqual([]);
    expect(dueReminders("d", "u", onlyHabits, [{ ...habit.toPrimitives(), created_on: "2026-11-02" }], now, 0)).toEqual([]);
    expect(dueReminders("d", "u", prefs, [habit.toPrimitives()], now, now.getTime() + 1)).toEqual([]);
  });
  it("handles midnight recovery and both sides of DST fallback with the same delivery key", () => {
    const midnight = { timezone: "UTC", habitTimes: {}, quotes: true, quoteTime: "23:59" };
    const events = dueReminders("d", "u", midnight, [], new Date("2026-11-02T00:03:00Z"), 0);
    expect(events[0].key).toBe("2026-11-01-encouragement");
    const fallback = { ...prefs, habitTimes: {}, quoteTime: "01:30" };
    const first = dueReminders("d", "u", fallback, [], new Date("2026-11-01T07:30:00Z"), 0);
    const second = dueReminders("d", "u", fallback, [], new Date("2026-11-01T08:30:00Z"), 0);
    expect(first[0].key).toBe(second[0].key);
    expect(zonedClock(new Date("2026-03-08T09:05:00Z"), "America/Denver").time).toBe("03:05");
  });
  it("validates timezone, time and habit identifiers", () => {
    expect(parsePreferences(prefs)).toEqual(prefs);
    expect(() => parsePreferences({ ...prefs, timezone: "Not/AZone" })).toThrow();
    expect(() => parsePreferences({ ...prefs, quoteTime: "24:00" })).toThrow();
    expect(() => parsePreferences({ ...prefs, habitTimes: { nope: "10:00" } })).toThrow();
    expect(() => parsePreferences({ ...prefs, quotes: "yes" })).toThrow();
    expect(() => parsePreferences({ ...prefs, language: "fr" })).toThrow();
    expect(parsePreferences({ ...prefs, language: "es" }).language).toBe("es");
  });
});

describe("Push subscription validation", () => {
  const key = createECDH("prime256v1");
  key.generateKeys();
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint", keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
  it("accepts supported HTTPS push services and stable device IDs", () => {
    expect(parseSubscription(subscription)).toEqual(subscription);
    expect(deviceId(subscription.endpoint)).toHaveLength(64);
    expect(deviceId(subscription.endpoint)).toBe(deviceId(subscription.endpoint));
  });
  it("rejects arbitrary destinations, credentials, ports and malformed keys", () => {
    for (const endpoint of ["http://fcm.googleapis.com/test", "https://127.0.0.1/test", "https://example.com/test", "https://fcm.googleapis.com.evil.example/test", "https://user:pass@fcm.googleapis.com/test", "https://fcm.googleapis.com:8443/test"]) {
      expect(() => parseSubscription({ ...subscription, endpoint })).toThrow();
    }
    expect(() => parseSubscription({ ...subscription, keys: { p256dh: "abc", auth: "xyz" } })).toThrow();
  });
});
