import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Habit, InvalidHabit, parseHabit, type HabitDetails, HabitChanged } from "@/habits/domain/habit.entity";
import { complete, insightSummary, progress, streak } from "@/habits/domain/habit.insights";
import { localDate, shiftDate } from "@/shared/domain/calendar";
import { IndexedDBHabitRepository } from "@/habits/infrastructure/indexed-db-habit.repository";
import { createHabitsModule } from "@/habits/bootstrap";
import { CreateHabit } from "@/habits/create-habit/create-habit.command";
import { CheckInHabit } from "@/habits/check-in/check-in.command";
import { EditHabit } from "@/habits/edit-habit/edit-habit.command";
import { ListHabits } from "@/habits/list-habits/list-habits.query";
import { mergeHabits, sameHabit } from "@/sync/domain/merge-habits";
import { DeleteHabit } from "@/habits/delete-habit/delete-habit.command";
import { RestoreBackup } from "@/habits/restore-backup/restore-backup.command";
import { parseBackup, previewBackup } from "@/habits/restore-backup/backup";
import { HabitRuntime } from "@/shared/application/habit-runtime";

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const details: HabitDetails = { name: "A little water", description: "", category: "Wellbeing", color: "sage", period: "Morning", target: 2, unit: "glasses", days: [0, 1, 2, 3, 4, 5, 6] };
afterEach(() => vi.useRealTimers());

describe("Habit entity", () => {
  it("guards names, targets, IDs and schedules", () => {
    expect(() => Habit.create(id, { ...details, name: " " }, "c")).toThrow(InvalidHabit);
    expect(() => Habit.create(id, { ...details, target: 0 }, "c")).toThrow(InvalidHabit);
    expect(() => Habit.create(id, { ...details, days: [] }, "c")).toThrow(InvalidHabit);
    expect(() => Habit.create("not-an-id", details, "c")).toThrow(InvalidHabit);
    expect(() => Habit.create(id, { ...details, days: [1, 1] }, "c")).toThrow(InvalidHabit);
  });
  it("supports increments, undo, historical target snapshots and domain events", () => {
    const habit = Habit.create(id, details, "c");
    const today = localDate();
    habit.checkIn(today, 1, "c");
    habit.edit({ ...details, target: 8 }, "c");
    habit.checkIn(today, 1, "c");
    expect(complete(habit.toPrimitives(), today)).toBe(true);
    expect(habit.toPrimitives().entries[today].target).toBe(2);
    expect(() => habit.checkIn(today, 1, "c")).toThrow("limit");
    habit.checkIn(today, -1, "c");
    expect(complete(habit.toPrimitives(), today)).toBe(false);
    expect(habit.pullDomainEvents().every(e => e instanceof HabitChanged)).toBe(true);
    expect(habit.pullDomainEvents()).toEqual([]);
  });
  it("rejects future days, impossible dates, and archived check-ins", () => {
    const habit = Habit.create(id, details, "c");
    expect(() => habit.checkIn(shiftDate(localDate(), 1), 1, "c")).toThrow("future");
    expect(() => habit.checkIn("2026-02-30", 1, "c")).toThrow(InvalidHabit);
    habit.setArchived(true, "c");
    expect(() => habit.checkIn(localDate(), 1, "c")).toThrow("scheduled");
    habit.setArchived(false, "c");
    habit.checkIn(localDate(), 1, "c");
    expect(habit.toPrimitives().entries[localDate()].count).toBe(1);
  });
  it("round-trips without events and rejects malformed cloud primitives", () => {
    const model = Habit.create(id, details, "c").toPrimitives();
    const restored = Habit.fromPrimitives(model);
    expect(restored.toPrimitives()).toEqual(model);
    expect(restored.pullDomainEvents()).toEqual([]);
    expect(() => parseHabit({ ...model, target: "2" })).toThrow(InvalidHabit);
    expect(() => parseHabit({ ...model, entries: { [localDate()]: { count: 999, target: 2, updated_at: model.updated_at } } })).toThrow(InvalidHabit);
  });
});

describe("Calendar-correct insights", () => {
  it("formats calendar days locally and shifts over month boundaries", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(localDate(new Date(2026, 9, 31, 23, 59))).toBe("2026-10-31");
  });
  it("skips unscheduled days in streaks and counts only completed daily goals", () => {
    const h = Habit.create(id, { ...details, target: 1, days: [1, 3, 5] }, "c", "2026-10-26");
    for (const day of ["2026-10-26", "2026-10-28", "2026-10-30"]) h.checkIn(day, 1, "c", "2026-11-01");
    expect(streak(h.toPrimitives(), "2026-11-01")).toBe(3);
    expect(progress([h.toPrimitives()], "2026-10-31").total).toBe(0);
    expect(insightSummary([h.toPrimitives()], "2026-11-01").weeklyRate).toBe(100);
    expect(streak(h.toPrimitives(), "2026-11-03")).toBe(0);
  });
});

describe("CQRS and atomic IndexedDB outbox", () => {
  it("upgrades schema 1 without losing habits or unsynced work and persists deletion metadata", async () => {
    const namespace = crypto.randomUUID();
    const model = Habit.create(id, details, "c").toPrimitives();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(`simply-habits-v1-${namespace}`, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore("habits", { keyPath: "id" });
        open.result.createObjectStore("outbox", { keyPath: "id" });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["habits", "outbox"], "readwrite");
      tx.objectStore("habits").put(model); tx.objectStore("outbox").put(model);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
    const repo = new IndexedDBHabitRepository(namespace);
    try {
      expect((await repo.find(id))?.toPrimitives()).toEqual(model);
      expect(await repo.pending()).toEqual([model]);
      expect(await repo.deletionPending()).toBe(false);
      await repo.setDeletionPending(true);
    } finally { await repo.close(); }
    const reopened = new IndexedDBHabitRepository(namespace);
    try { expect(await reopened.deletionPending()).toBe(true); expect(await reopened.all()).toHaveLength(1); }
    finally { await reopened.close(); }
  });
  it("persists through the buses, publishes side effects, survives reopen and clears acknowledged work", async () => {
    const namespace = crypto.randomUUID();
    const repo = new IndexedDBHabitRepository(namespace);
    const events: string[] = [];
    const container = createHabitsModule(repo, async e => { events.push(e.getPayload().action); });
    await container.commandBus.dispatch(new CreateHabit("c", { id, details }));
    await container.commandBus.dispatch(new CheckInHabit("c", { id, day: localDate(), delta: 1 }));
    await container.commandBus.dispatch(new EditHabit("c", { id, archived: true }));
    expect(events).toEqual(["created", "checked-in", "archived"]);
    expect(await container.queryBus.dispatch(new ListHabits("c", {}))).toHaveLength(1);
    const pending = await repo.pending();
    expect(pending).toHaveLength(1);
    await container.close(); await repo.close();
    const reopened = new IndexedDBHabitRepository(namespace);
    expect((await reopened.find(id))?.toPrimitives().archived).toBe(true);
    expect(await reopened.pending()).toHaveLength(1);
    await reopened.reconcile(pending);
    expect(await reopened.pending()).toEqual([]);
    await reopened.close();
  });
  it("preserves a check-in made while an older sync request was in flight", async () => {
    const repo = new IndexedDBHabitRepository(crypto.randomUUID());
    const habit = Habit.create(id, details, "c");
    await repo.save(habit);
    const old = habit.toPrimitives();
    habit.checkIn(localDate(), 1, "c");
    await repo.save(habit);
    await repo.reconcile([old]);
    expect((await repo.find(id))?.toPrimitives().entries[localDate()].count).toBe(1);
    expect(await repo.pending()).toHaveLength(1);
    await repo.close();
  });
  it("keeps user vaults isolated", async () => {
    const a = new IndexedDBHabitRepository(crypto.randomUUID()), b = new IndexedDBHabitRepository(crypto.randomUUID());
    await a.save(Habit.create(id, details, "c"));
    expect(await b.all()).toEqual([]);
    await a.close(); await b.close();
  });
});

describe("Cloud merge", () => {
  it("merges independent days, converges in both directions, and retains undo tombstones", () => {
    const habit = Habit.create(id, details, "c", "2026-10-01").toPrimitives();
    const a = { ...habit, entries: { "2026-10-30": { count: 2, target: 2, updated_at: "2026-10-30T12:00:00.000Z" } } };
    const b = { ...habit, entries: { "2026-10-31": { count: 1, target: 2, updated_at: "2026-10-31T12:00:00.000Z" }, "2026-10-30": { count: 0, target: 2, updated_at: "2026-10-31T12:00:00.000Z" } } };
    const merged = mergeHabits(a, b);
    expect(merged.entries["2026-10-30"].count).toBe(0);
    expect(merged.entries["2026-10-31"].count).toBe(1);
    expect(sameHabit(merged, mergeHabits(b, a))).toBe(true);
    expect(sameHabit(merged, mergeHabits(merged, b))).toBe(true);
  });

  describe("Backup restoration and permanent deletion", () => {
    const encode = (habits: unknown[]) => JSON.stringify({ app: "Simply Habits", version: 1, habits });
    it("previews new, changed, unchanged and deletion-blocked habits using the exact sync merge", () => {
      const unchanged = Habit.create(crypto.randomUUID(), details, "c").toPrimitives();
      const merged = Habit.create(crypto.randomUUID(), details, "c").toPrimitives();
      const removed = Habit.create(crypto.randomUUID(), details, "c");
      const old = removed.toPrimitives();
      removed.delete("c");
      const incoming = [unchanged, { ...merged, name: "Updated", updated_at: "2099-01-01T00:00:00.000Z" }, old, Habit.create(crypto.randomUUID(), details, "c").toPrimitives()];
      const preview = previewBackup(incoming, [unchanged, merged, removed.toPrimitives()]);
      expect(preview).toMatchObject({ added: 1, merged: 1, unchanged: 1, blocked: 1 });
      expect(preview.items.map(item => item.outcome)).toEqual(["Keep newer or identical data", "Merge changes", "Blocked by permanent deletion", "New habit"]);
    });
    it("persists a deletion pause, blocks commands and resumes only after a confirmed active status", async () => {
      const window = new EventTarget();
      vi.stubGlobal("window", window);
      vi.stubGlobal("navigator", { onLine: false });
      vi.stubGlobal("BroadcastChannel", undefined);
      const runtime = new HabitRuntime(null);
      try {
        await runtime.start();
        await runtime.pauseForAccountDeletion();
        expect(runtime.snapshot().deletionPending).toBe(true);
        expect(await runtime.repository.deletionPending()).toBe(true);
        await expect(runtime.execute(new CreateHabit("c", { id, details }))).rejects.toThrow();
        await runtime.applyDeletionStatus({ deleted: false, pending: true, failed: true });
        expect(runtime.snapshot().deletionFailed).toBe(true);
        await runtime.applyDeletionStatus({ deleted: false, pending: false, failed: false });
        expect(runtime.snapshot().deletionPending).toBe(false);
        expect(await runtime.repository.deletionPending()).toBe(false);
        await runtime.execute(new CreateHabit("c", { id, details }));
        expect(runtime.snapshot().habits).toHaveLength(1);
        await runtime.clearLocalData();
      } finally { await runtime.close(); vi.unstubAllGlobals(); }
    });
    it("validates complete backups, duplicates and limits before writing", () => {
      const model = Habit.create(id, details, "c").toPrimitives();
      expect(parseBackup(encode([model]))).toEqual([model]);
      for (const invalid of ["{", "null", JSON.stringify({ app: "Other", version: 1, habits: [] }), encode([model, model]), encode([{ ...model, target: -1 }]), encode(Array.from({ length: 1001 }, () => model)), encode([{ ...model, deleted: true }])]) expect(() => parseBackup(invalid)).toThrow();
    });
    it("merges backup settings and entries without losing newer local edits and emits one committed event", async () => {
      const repo = new IndexedDBHabitRepository(crypto.randomUUID());
      const events: string[] = [];
      const container = createHabitsModule(repo, async event => { events.push(event.getPayload().action); });
      try {
        const h = Habit.create(id, details, "c");
        const backup = h.toPrimitives();
        h.edit({ ...details, name: "Newer name" }, "c");
        h.checkIn(localDate(), 1, "c");
        await repo.save(h);
        const another = Habit.create(crypto.randomUUID(), details, "c").toPrimitives();
        await container.commandBus.dispatch(new RestoreBackup("c", { habits: [backup, another] }));
        expect((await repo.find(id))?.toPrimitives()).toEqual(h.toPrimitives());
        expect(await repo.all()).toHaveLength(2);
        expect(await repo.pending()).toHaveLength(2);
        expect(events).toEqual(["backup-restored"]);
        await expect(container.commandBus.dispatch(new RestoreBackup("c", { habits: [another, { ...backup, target: 0 }] }))).rejects.toThrow();
        expect(events).toEqual(["backup-restored"]);
      } finally { await container.close(); await repo.close(); }
    });
    it("rolls back the whole restore transaction and clears habits plus outbox atomically", async () => {
      const repo = new IndexedDBHabitRepository(crypto.randomUUID());
      try {
        const a = Habit.create(id, details, "c").toPrimitives();
        const b = Habit.create(crypto.randomUUID(), details, "c").toPrimitives();
        await expect(repo.restore([a, { ...b, target: 0 }])).rejects.toThrow();
        expect(await repo.all()).toEqual([]);
        expect(await repo.pending()).toEqual([]);
        await repo.restore([a, b]); await repo.clear();
        expect(await repo.all()).toEqual([]);
        expect(await repo.pending()).toEqual([]);
      } finally { await repo.close(); }
    });
    it("sanitizes deletion, hides it in queries and prevents resurrection from stale cloud writes and backups", async () => {
      const repo = new IndexedDBHabitRepository(crypto.randomUUID());
      const events: string[] = [];
      const container = createHabitsModule(repo, async event => { events.push(event.getPayload().action); });
      try {
        const h = Habit.create(id, { ...details, description: "Private description" }, "c");
        h.checkIn(localDate(), 1, "c");
        const stale = h.toPrimitives();
        await repo.save(h);
        await container.commandBus.dispatch(new DeleteHabit("c", { id }));
        const tombstone = (await repo.find(id))!.toPrimitives();
        expect(tombstone).toMatchObject({ deleted: true, archived: true, name: "Deleted habit", description: "", entries: {} });
        expect(events).toEqual(["deleted"]);
        expect(await container.queryBus.dispatch(new ListHabits("c", {}))).toEqual([]);
        expect(mergeHabits(tombstone, stale)).toEqual(mergeHabits(stale, tombstone));
        await repo.reconcile([{ ...stale, updated_at: "2099-01-01T00:00:00.000Z" }]);
        await container.commandBus.dispatch(new RestoreBackup("c", { habits: [stale] }));
        expect((await repo.find(id))?.toPrimitives().deleted).toBe(true);
        expect(await container.queryBus.dispatch(new ListHabits("c", {}))).toEqual([]);
        const removed = Habit.fromPrimitives(tombstone);
        expect(() => removed.edit(details, "c")).toThrow("deleted");
        expect(() => removed.setArchived(false, "c")).toThrow("deleted");
        expect(() => removed.checkIn(localDate(), 1, "c")).toThrow("deleted");
      } finally { await container.close(); await repo.close(); }
    });
  });
  it("makes archive state durable without dropping history", () => {
    const a = Habit.create(id, details, "c").toPrimitives();
    const b = { ...a, archived: true, updated_at: new Date(Date.parse(a.updated_at) + 1).toISOString() };
    expect(mergeHabits(a, b).archived).toBe(true);
    expect(() => mergeHabits(a, { ...b, id: crypto.randomUUID() })).toThrow("different habits");
  });
});
