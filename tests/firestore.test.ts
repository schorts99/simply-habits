import { afterAll, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { getApps, initializeApp, getFirestore, FirestoreUnitOfWorkRunner } from "@schorts/firestore-admin-dao";
import { FirestoreHabitDAO } from "@/habits/infrastructure/firestore-habit.dao";
import { Habit, type HabitDetails } from "@/habits/domain/habit.entity";
import { localDate } from "@/shared/domain/calendar";

const host = process.env.FIRESTORE_EMULATOR_HOST;
describe.skipIf(!host)("Firestore DAO emulator", () => {
  const app = getApps().find(a => a.name === "habit-tests") ?? initializeApp({ projectId: "demo-simply-habits" }, "habit-tests");
  const db = getFirestore(app);
  const collection = db.collection(`users/test-${crypto.randomUUID()}/habits`);
  const dao = new FirestoreHabitDAO(collection);
  afterAll(async () => { await db.recursiveDelete(collection); await deleteApp(app); });
  it("round-trips an entity and updates it transactionally", async () => {
    const details: HabitDetails = { name: "Read", description: "", category: "Learning", color: "peach", period: "Evening", target: 1, unit: "time", days: [0, 1, 2, 3, 4, 5, 6] };
    const habit = Habit.create(crypto.randomUUID(), details, "test");
    await dao.save(habit);
    expect((await dao.findByID(habit.id.value))?.toPrimitives()).toEqual(habit.toPrimitives());
    await new FirestoreUnitOfWorkRunner(db).run(async uow => {
      const stored = await dao.findByID(habit.id.value, uow);
      if (!stored) throw new Error("Missing habit.");
      stored.checkIn(localDate(), 1, "test");
      await dao.save(stored, uow);
    });
    expect((await dao.findByID(habit.id.value))?.toPrimitives().entries[localDate()].count).toBe(1);
  });
});
