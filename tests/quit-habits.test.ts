import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { Habit, HabitChanged, InvalidHabit, parseHabit, type HabitDetails } from "@/habits/domain/habit.entity";
import { complete, recorded, progress, streak, insightSummary } from "@/habits/domain/habit.insights";
import { mergeHabits } from "@/sync/domain/merge-habits";
import { parseBackup } from "@/habits/restore-backup/backup";
import { IndexedDBHabitRepository } from "@/habits/infrastructure/indexed-db-habit.repository";
import { createHabitsModule } from "@/habits/bootstrap";
import { CreateHabit } from "@/habits/create-habit/create-habit.command";
import { CheckInHabit } from "@/habits/check-in/check-in.command";
import { RestoreBackup } from "@/habits/restore-backup/restore-backup.command";
import { dueReminders } from "@/notifications/domain/reminder";

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const details: HabitDetails = { kind: "quit", name: "Less scrolling", description: "", category: "Focus", color: "sage", period: "Evening", target: 1, unit: "day", days: [0, 1, 2, 3, 4, 5, 6] };
const start = "2026-10-26", today = "2026-11-01";
const create = () => Habit.create(id, details, "c", start);

describe("Quit habits", () => {
  it("records explicit success/lapse/unknown outcomes and emits events without automatic success", () => {
    const h = create();
    expect(complete(h.toPrimitives(), today)).toBe(false);
    expect(recorded(h.toPrimitives(), today)).toBe(false);
    h.recordOutcome(today, "success", "c", today);
    expect(complete(h.toPrimitives(), today)).toBe(true);
    h.recordOutcome(today, "lapse", "c", today);
    expect(complete(h.toPrimitives(), today)).toBe(false);
    expect(recorded(h.toPrimitives(), today)).toBe(true);
    h.recordOutcome(today, "unknown", "c", today);
    expect(recorded(h.toPrimitives(), today)).toBe(false);
    expect(h.toPrimitives().entries[today]).toMatchObject({ outcome: "unknown", count: 0, target: 1 });
    expect(Habit.fromPrimitives(h.toPrimitives()).toPrimitives()).toEqual(h.toPrimitives());
    expect(h.pullDomainEvents()).toHaveLength(4);
    expect(h.pullDomainEvents()).toEqual([]);
  });

  it("rejects wrong types, invalid outcomes and invalid dates, and preserves immutable habit type", () => {
    const h = create();
    expect(() => h.checkIn(today, 1, "c", today)).toThrow("success or lapse");
    expect(() => h.recordOutcome("2026-11-02", "success", "c", today)).toThrow("future");
    expect(() => h.recordOutcome("2026-02-30", "success", "c", today)).toThrow(InvalidHabit);
    expect(() => h.recordOutcome("2026-10-25", "success", "c", today)).toThrow(InvalidHabit);
    expect(() => h.edit({ ...details, kind: "build" }, "c")).toThrow("change its type");
    expect(() => Habit.create(id, { ...details, target: 2 }, "c")).toThrow("daily outcome");
    expect(() => parseHabit({ ...h.toPrimitives(), kind: "invalid" })).toThrow("habit type");
    for (const entry of [{ count: 0, target: 1 }, { count: 0, target: 1, outcome: "success" }, { count: 1, target: 1, outcome: "lapse" }]) {
      expect(() => parseHabit({ ...h.toPrimitives(), entries: { [today]: { ...entry, updated_at: h.toPrimitives().updated_at } } })).toThrow("outcome");
    }
    h.setArchived(true, "c");
    expect(() => h.recordOutcome(today, "success", "c", today)).toThrow("scheduled");
    h.setArchived(false, "c");
    h.delete("c");
    expect(() => h.recordOutcome(today, "success", "c", today)).toThrow("deleted");
    expect(parseHabit(h.toPrimitives()).deleted).toBe(true);
    const build = Habit.create(id, { ...details, kind: undefined }, "c", start);
    expect(() => build.recordOutcome(today, "success", "c", today)).toThrow("Only quit");
    expect(() => parseHabit({ ...build.toPrimitives(), entries: { [today]: { count: 1, target: 1, outcome: "success", updated_at: build.toPrimitives().updated_at } } })).toThrow("history");
  });

  it("breaks streaks on lapses and historical unknown days, skips rest days, and only counts successes", () => {
    const h = Habit.create(id, { ...details, days: [1, 3, 5] }, "c", start);
    for (const day of ["2026-10-26", "2026-10-28", "2026-10-30"]) h.recordOutcome(day, "success", "c", today);
    expect(streak(h.toPrimitives(), today)).toBe(3);
    h.recordOutcome("2026-10-30", "unknown", "c", today);
    expect(streak(h.toPrimitives(), today)).toBe(0);
    h.recordOutcome("2026-10-30", "lapse", "c", today);
    expect(streak(h.toPrimitives(), "2026-10-30")).toBe(0);
    expect(insightSummary([h.toPrimitives()], today).checkIns).toBe(2);
    expect(progress([h.toPrimitives()], "2026-10-30")).toEqual({ total: 1, completed: 0, percent: 0 });
    expect(progress([h.toPrimitives()], "2026-10-31").total).toBe(0);
  });

  it("preserves timestamped undo and newer lapses across sync/backup, with deterministic ties", () => {
    const h = create();
    h.recordOutcome(today, "success", "c", today);
    const stale = h.toPrimitives();
    h.recordOutcome(today, "lapse", "c", today);
    expect(mergeHabits(stale, h.toPrimitives()).entries[today].outcome).toBe("lapse");
    h.recordOutcome(today, "unknown", "c", today);
    for (const merged of [mergeHabits(stale, h.toPrimitives()), mergeHabits(h.toPrimitives(), stale)]) expect(merged.entries[today].outcome).toBe("unknown");
    const tied = { ...stale, entries: { [today]: { ...stale.entries[today], count: 0, outcome: "lapse" as const } } };
    expect(mergeHabits(stale, tied)).toEqual(mergeHabits(tied, stale));
    expect(parseBackup(JSON.stringify({ app: "Simply Habits", version: 1, habits: [h.toPrimitives()] }))).toEqual([h.toPrimitives()]);
    const build = Habit.create(id, { ...details, kind: undefined }, "c", start).toPrimitives();
    expect(() => mergeHabits(build, stale)).toThrow("different types");
  });

  it("persists outcome commands, events, outbox and backup undo atomically through IndexedDB", async () => {
    const namespace = crypto.randomUUID();
    const repo = new IndexedDBHabitRepository(namespace);
    const events: HabitChanged[] = [];
    const container = createHabitsModule(repo, async event => { if (event instanceof HabitChanged) events.push(event); });
    try {
      await container.commandBus.dispatch(new CreateHabit("c", { id, details }));
      const day = (await repo.find(id))!.toPrimitives().created_on;
      await container.commandBus.dispatch(new CheckInHabit("c", { id, day, outcome: "success" }));
      const stale = (await repo.find(id))!.toPrimitives();
      await container.commandBus.dispatch(new CheckInHabit("c", { id, day, outcome: "unknown" }));
      await container.commandBus.dispatch(new RestoreBackup("c", { habits: [stale] }));
      expect((await repo.find(id))!.toPrimitives().entries[day].outcome).toBe("unknown");
      expect((await repo.pending())[0].entries[day].outcome).toBe("unknown");
      expect(events).toHaveLength(3);
    } finally { await container.close(); await repo.close(); }
    const reopened = new IndexedDBHabitRepository(namespace);
    try { expect(Object.values((await reopened.find(id))!.toPrimitives().entries)[0].outcome).toBe("unknown"); }
    finally { await reopened.close(); }
  });

  it("reminds only on scheduled, unrecorded quit days; success and lapse both suppress delivery", () => {
    const h = create();
    const now = new Date("2026-11-01T18:00:00Z");
    const preferences = { timezone: "UTC", habitTimes: { [id]: "18:00" }, quotes: false, quoteTime: "09:00" };
    const due = () => dueReminders("device", "user", preferences, [h.toPrimitives()], now, 0);
    expect(due()).toHaveLength(1);
    h.recordOutcome(today, "lapse", "c", today);
    expect(due()).toEqual([]);
    h.recordOutcome(today, "success", "c", today);
    expect(due()).toEqual([]);
    h.recordOutcome(today, "unknown", "c", today);
    expect(due()).toHaveLength(1);
    h.setArchived(true, "c");
    expect(due()).toEqual([]);
  });
});
