import type { User } from "firebase/auth";
import { parseHabit, type HabitModel } from "@/habits/domain/habit.entity";

async function cloudRequest(user: User, models?: HabitModel[]): Promise<HabitModel[]> {
  const response = await fetch("/api/sync", {
    method: models ? "POST" : "GET",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(models ? { "Content-Type": "application/json" } : {}) },
    ...(models ? { body: JSON.stringify({ habits: models }) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Cloud sync failed (${response.status}).`;
    throw new Error(message);
  }
  if (!body || typeof body !== "object" || !("habits" in body) || !Array.isArray(body.habits)) throw new Error("The cloud returned an invalid response.");
  return body.habits.map(parseHabit);
}
export async function synchronize(user: User, pending: HabitModel[], accept: (models: HabitModel[]) => Promise<void>): Promise<void> {
  let batch: HabitModel[] = [], bytes = 0;
  for (const habit of pending) {
    const size = new TextEncoder().encode(JSON.stringify(habit)).length;
    if (batch.length && (batch.length === 20 || bytes + size > 1_800_000)) {
      await accept(await cloudRequest(user, batch));
      batch = []; bytes = 0;
    }
    batch.push(habit); bytes += size;
  }
  if (batch.length) await accept(await cloudRequest(user, batch));
  await accept(await cloudRequest(user));
}
