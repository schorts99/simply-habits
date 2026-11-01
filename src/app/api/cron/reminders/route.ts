import { timingSafeEqual, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { InMemoryDeadLetterStore, InMemoryEventBus, InMemoryEventStore } from "@schorts/shared-kernel/event-bus";
import { DomainEventRegistry } from "@schorts/shared-kernel/domain-events";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";
import { HttpError, apiFailure } from "@/shared/http/authenticated-request";
import { pushConfigured } from "@/notifications/infrastructure/web-push";
import { parsePreferences, dueReminders, ReminderDue } from "@/notifications/domain/reminder";
import { DeliverReminder } from "@/notifications/application/deliver-reminder";
import { FirestoreHabitDAO } from "@/habits/infrastructure/firestore-habit.dao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  let release: (() => Promise<void>) | undefined;
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) throw new HttpError("Set a CRON_SECRET of at least 32 characters.", 503);
    const token = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    if (Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new HttpError("Unauthorized scheduler.", 401);
    if (!pushConfigured()) throw new HttpError("Web Push is not configured.", 503);
    const { db } = firebaseAdmin();
    const owner = randomUUID();
    const lock = db.doc("system/reminder-worker");
    const acquired = await db.runTransaction(async tx => {
      const snapshot = await tx.get(lock);
      if ((snapshot.data()?.leaseUntil ?? 0) > Date.now()) return false;
      tx.set(lock, { owner, leaseUntil: Date.now() + 120_000 });
      return true;
    });
    if (!acquired) return NextResponse.json({ skipped: "Another worker is active." });
    release = () => db.runTransaction(async tx => { const current = await tx.get(lock); if (current.data()?.owner === owner) tx.delete(lock); });
    const devices = await db.collection("pushDevices").limit(501).get();
    if (devices.size > 500) throw new HttpError("Reminder worker capacity exceeded. Configure a paginated background worker before adding more devices.", 503);
    DomainEventRegistry.register(ReminderDue.NAME, ReminderDue);
    const deadLetters = new InMemoryDeadLetterStore();
    const bus = new InMemoryEventBus(new InMemoryEventStore(), {}, deadLetters);
    bus.subscribe(ReminderDue.NAME, new DeliverReminder(db));
    const now = new Date();
    let planned = 0, failed = 0;
    const started = Date.now();
    try {
      for (const device of devices.docs) {
        if (Date.now() - started > 40_000) throw new HttpError("Reminder worker exceeded its time budget. Scale the scheduled worker.", 503);
        try {
          const data = device.data();
          const preferences = parsePreferences(data.preferences);
          const habits = (await new FirestoreHabitDAO(db.collection(`users/${data.uid}/habits`)).getAll()).map(h => h.toPrimitives());
          const events = dueReminders(device.id, data.uid, preferences, habits, now, data.enabledAt);
          for (const payload of events) {
            planned++;
            await bus.publish(new ReminderDue(owner, payload));
          }
        } catch (error) { failed++; console.error("Reminder device delivery failed:", device.id, error); }
      }
    } finally { await bus.close(); }
    if (failed) return NextResponse.json({ error: "Some reminders could not be delivered. Inspect server logs; the next tick will retry within the recovery window.", planned, failed }, { status: 503 });
    return NextResponse.json({ planned, failed });
  } catch (error) { return apiFailure(error, "Reminder worker"); }
  finally { if (release) await release(); }
}
