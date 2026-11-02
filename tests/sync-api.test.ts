import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/sync/route";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";
import { Habit, type HabitDetails } from "@/habits/domain/habit.entity";
import { localDate } from "@/shared/domain/calendar";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
describe.skipIf(!authHost || !process.env.FIRESTORE_EMULATOR_HOST)("Authenticated sync API", () => {
  const accounts: { token: string; uid: string }[] = [];
  const details: HabitDetails = { name: "Read", description: "", category: "Learning", color: "peach", period: "Evening", target: 2, unit: "pages", days: [0, 1, 2, 3, 4, 5, 6] };
  const habit = Habit.create(crypto.randomUUID(), details, "test");
  const origin = "http://localhost:3000";
  beforeAll(async () => {
    process.env.FIREBASE_PROJECT_ID = "demo-simply-habits";
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `test-${crypto.randomUUID()}@example.test`, password: "test-password-123", returnSecureToken: true }) });
      const body = await response.json();
      if (!response.ok || typeof body.idToken !== "string" || typeof body.localId !== "string") throw new Error("Could not create emulator test account.");
      accounts.push({ token: body.idToken, uid: body.localId });
    }
  });
  afterAll(async () => {
    const { auth, db } = firebaseAdmin();
    await Promise.all(accounts.map(async account => {
      await db.recursiveDelete(db.collection(`users/${account.uid}/habits`));
      await auth.deleteUser(account.uid);
    }));
  });
  function post(body: unknown, token = accounts[0].token, requestOrigin = origin) {
    return POST(new NextRequest(`${origin}/api/sync`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  }
  function get(token: string) {
    return GET(new NextRequest(`${origin}/api/sync`, { headers: { Authorization: `Bearer ${token}` } }));
  }
  it("rejects missing/invalid identities and cross-origin writes", async () => {
    expect((await GET(new NextRequest(`${origin}/api/sync`))).status).toBe(401);
    expect((await get("not-a-valid-token")).status).toBe(401);
    expect((await post({ habits: [] }, accounts[0].token, "https://other.example")).status).toBe(403);
  });
  it("round-trips authenticated habits and prevents cross-account reads", async () => {
    const response = await post({ habits: [habit.toPrimitives()] });
    expect(response.status).toBe(200);
    expect((await response.json()).habits[0]).toEqual(habit.toPrimitives());
    expect((await (await get(accounts[0].token)).json()).habits).toHaveLength(1);
    expect((await (await get(accounts[1].token)).json()).habits).toEqual([]);
  });
  it("retains a newer remote check-in when an old client retries", async () => {
    const stale = habit.toPrimitives();
    habit.checkIn(localDate(), 1, "test");
    expect((await post({ habits: [habit.toPrimitives()] })).status).toBe(200);
    const retried = await post({ habits: [stale] });
    expect((await retried.json()).habits[0].entries[localDate()].count).toBe(1);
  });
  it("rejects malformed, duplicated and oversized batch data", async () => {
    const invalidHabit = await post({ habits: [{ ...habit.toPrimitives(), target: -1 }] });
    expect(invalidHabit.status).toBe(400);
    expect(await invalidHabit.json()).toEqual({ error: "The daily target must be a whole number from 1 to 1,000." });
    const invalidJson = await POST(new NextRequest(`${origin}/api/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accounts[0].token}`, Origin: origin, "Content-Type": "application/json" },
      body: "{",
    }));
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({ error: "Invalid JSON." });
    expect((await post({ habits: [habit.toPrimitives(), habit.toPrimitives()] })).status).toBe(400);
    expect((await post({ habits: Array.from({ length: 21 }, () => habit.toPrimitives()) })).status).toBe(400);
  });
  it("round-trips quit outcomes and keeps undo when a stale device retries", async () => {
    const quit = Habit.create(crypto.randomUUID(), { ...details, kind: "quit", target: 1, unit: "day" }, "test");
    quit.recordOutcome(localDate(), "success", "test");
    const stale = quit.toPrimitives();
    expect((await post({ habits: [stale] })).status).toBe(200);
    quit.recordOutcome(localDate(), "lapse", "test");
    const lapse = await post({ habits: [quit.toPrimitives()] });
    expect((await lapse.json()).habits[0].entries[localDate()].outcome).toBe("lapse");
    quit.recordOutcome(localDate(), "unknown", "test");
    expect((await post({ habits: [quit.toPrimitives()] })).status).toBe(200);
    const retry = await post({ habits: [stale] });
    expect((await retry.json()).habits[0].entries[localDate()].outcome).toBe("unknown");
    const wrongType = { ...quit.toPrimitives(), kind: "build", entries: {} };
    expect((await post({ habits: [wrongType] })).status).toBe(400);
  });
});
