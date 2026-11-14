import { timingSafeEqual, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { InMemoryDeadLetterStore, InMemoryEventBus, InMemoryEventStore } from "@schorts/shared-kernel/event-bus";
import { DomainEventRegistry } from "@schorts/shared-kernel/domain-events";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";
import { HttpError, apiFailure } from "@/shared/http/authenticated-request";
import { pushConfigured } from "@/notifications/infrastructure/web-push";
import { parsePreferences, dueReminders, ReminderDue, type ReminderPayload } from "@/notifications/domain/reminder";
import { DeliverReminder } from "@/notifications/application/deliver-reminder";
import { FirestoreHabitDAO } from "@/habits/infrastructure/firestore-habit.dao";
import { runDeletionJobs } from "@/accounts/delete-account/deletion-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEVICE_PAGE_SIZE = 100;
const SCAN_BUDGET = 20_000;
const RUN_BUDGET = 40_000;
const DELIVERY_BATCH_SIZE = 10;
const RETRY_DELAY = 5 * 60_000;
const JOB_RETENTION = 7 * 86_400_000;
type AdminDb = ReturnType<typeof firebaseAdmin>["db"];

type WorkerMetrics = {
  scanComplete: boolean;
  scanned: number;
  planned: number;
  queued: number;
  attempted: number;
  delivered: number;
  failed: number;
  expired: number;
  suppressed: number;
  queueBacklog: boolean;
};

function parseQueuedReminder(value: unknown): ReminderPayload {
  if (!value || typeof value !== "object"
    || !("deviceId" in value) || typeof value.deviceId !== "string"
    || !("uid" in value) || typeof value.uid !== "string"
    || !("key" in value) || typeof value.key !== "string"
    || !("title" in value) || typeof value.title !== "string"
    || !("body" in value) || typeof value.body !== "string"
    || !("dueAt" in value) || typeof value.dueAt !== "number" || !Number.isFinite(value.dueAt)) {
    throw new Error("Invalid queued reminder.");
  }
  return { deviceId: value.deviceId, uid: value.uid, key: value.key, title: value.title, body: value.body, dueAt: value.dueAt };
}

function timestampMillis(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (!value || typeof value !== "object" || !("toMillis" in value) || typeof value.toMillis !== "function") return undefined;
  return value.toMillis();
}

async function enqueueReminders(db: AdminDb, events: ReminderPayload[], now: number): Promise<number> {
  const records = events.map(payload => {
    const device = db.doc(`pushDevices/${payload.deviceId}`);
    return {
      payload,
      job: device.collection("reminderJobs").doc(payload.key),
      receipt: device.collection("deliveries").doc(payload.key),
      expiresAt: payload.dueAt + JOB_RETENTION,
    };
  });
  if (!records.length) return 0;
  return db.runTransaction(async tx => {
    const snapshots = await Promise.all(records.flatMap(record => [tx.get(record.job), tx.get(record.receipt)]));
    let queued = 0;
    records.forEach((record, index) => {
      const job = snapshots[index * 2];
      const receipt = snapshots[index * 2 + 1];
      if (record.expiresAt <= now || job.exists || receipt.data()?.sentAt) return;
      tx.create(record.job, {
        ...record.payload,
        attempts: 0,
        nextAttemptAt: now,
        expiresAt: new Date(record.expiresAt),
      });
      queued++;
    });
    return queued;
  });
}

async function saveScanProgress(
  db: AdminDb,
  owner: string,
  cursor: string | null,
  scanAt: number | null,
) {
  const lock = db.doc("system/reminder-worker");
  await db.runTransaction(async tx => {
    const current = await tx.get(lock);
    if (current.data()?.owner !== owner) throw new Error("Reminder worker lease was lost.");
    tx.update(lock, { scanCursor: cursor, scanAt, scanProgressAt: Date.now() });
  });
}

async function scanDevices(
  db: AdminDb,
  owner: string,
  cursor: string | null,
  scanAt: number | null,
  deadline: number,
  metrics: WorkerMetrics,
) {
  let nextCursor = cursor;
  let fixedScanAt = scanAt;
  if (fixedScanAt === null) {
    fixedScanAt = Date.now();
    nextCursor = null;
    await saveScanProgress(db, owner, null, fixedScanAt);
  }
  const scanTimestamp = fixedScanAt;
  if (scanTimestamp === null) throw new Error("Reminder scan timestamp was not initialized.");

  const devicesCollection = db.collection("pushDevices");
  while (Date.now() < deadline) {
    let query = devicesCollection.orderBy("__name__").limit(DEVICE_PAGE_SIZE);
    if (nextCursor) query = query.startAfter(nextCursor);
    const page = await query.get();
    if (page.empty) {
      await saveScanProgress(db, owner, null, null);
      metrics.scanComplete = true;
      return;
    }

    for (let offset = 0; offset < page.docs.length; offset += DELIVERY_BATCH_SIZE) {
      const devices = page.docs.slice(offset, offset + DELIVERY_BATCH_SIZE);
      await Promise.all(devices.map(async device => {
        metrics.scanned++;
        try {
          const data = device.data();
          if (typeof data.uid !== "string" || !data.uid) throw new Error("Push device has no account owner.");
          const preferences = parsePreferences(data.preferences);
          const habits = (await new FirestoreHabitDAO(db.collection(`users/${data.uid}/habits`)).getAll()).map(habit => habit.toPrimitives());
          const events = dueReminders(device.id, data.uid, preferences, habits, new Date(scanTimestamp), data.enabledAt);
          metrics.planned += events.length;
          metrics.queued += await enqueueReminders(db, events, Date.now());
        } catch (error) {
          metrics.failed++;
          console.error("Reminder device scan failed:", device.id, error);
        }
      }));
    }

    nextCursor = page.docs[page.docs.length - 1].id;
    if (page.docs.length < DEVICE_PAGE_SIZE) {
      await saveScanProgress(db, owner, null, null);
      metrics.scanComplete = true;
      return;
    }
    await saveScanProgress(db, owner, nextCursor, scanTimestamp);
  }
}

async function deliverQueuedReminders(
  db: AdminDb,
  bus: InMemoryEventBus,
  owner: string,
  deadline: number,
  metrics: WorkerMetrics,
) {
  while (Date.now() < deadline) {
    const jobs = await db.collectionGroup("reminderJobs")
      .where("nextAttemptAt", "<=", Date.now())
      .orderBy("nextAttemptAt")
      .limit(DELIVERY_BATCH_SIZE)
      .get();
    if (jobs.empty) return;

    await Promise.all(jobs.docs.map(async job => {
      metrics.attempted++;
      try {
        const data = job.data();
        const expiresAt = timestampMillis(data.expiresAt);
        if (expiresAt === undefined) throw new Error("Queued reminder has no valid expiry.");
        if (expiresAt <= Date.now()) {
          await job.ref.delete();
          metrics.expired++;
          return;
        }
        const payload = parseQueuedReminder(data);
        if (job.ref.parent.parent?.id !== payload.deviceId) throw new Error("Queued reminder device does not match its path.");
        const device = await db.doc(`pushDevices/${payload.deviceId}`).get();
        const deviceData = device.data();
        if (!deviceData || deviceData.uid !== payload.uid) {
          await job.ref.delete();
          metrics.suppressed++;
          return;
        }
        const preferences = parsePreferences(deviceData.preferences);
        const habits = (await new FirestoreHabitDAO(db.collection(`users/${payload.uid}/habits`)).getAll()).map(habit => habit.toPrimitives());
        const stillDue = dueReminders(payload.deviceId, payload.uid, preferences, habits, new Date(payload.dueAt), deviceData.enabledAt)
          .some(reminder => reminder.key === payload.key);
        if (!stillDue) {
          await job.ref.delete();
          metrics.suppressed++;
          return;
        }
        await bus.publish(new ReminderDue(owner, payload));
        await job.ref.delete();
        metrics.delivered++;
      } catch (error) {
        metrics.failed++;
        await db.runTransaction(async tx => {
          const current = await tx.get(job.ref);
          if (current.exists) {
            const attempts = current.data()?.attempts;
            tx.update(job.ref, {
              attempts: typeof attempts === "number" ? attempts + 1 : 1,
              lastAttemptAt: Date.now(),
              nextAttemptAt: Date.now() + RETRY_DELAY,
            });
          }
        });
        console.error("Reminder queued delivery failed:", job.id, error);
      }
    }));
  }
}

export async function GET(request: NextRequest) {
  let release: (() => Promise<void>) | undefined;
  const metrics: WorkerMetrics = {
    scanComplete: false, scanned: 0, planned: 0, queued: 0,
    attempted: 0, delivered: 0, failed: 0, expired: 0, suppressed: 0, queueBacklog: false,
  };
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) throw new HttpError("Set a CRON_SECRET of at least 32 characters.", 503);
    const token = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    if (Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new HttpError("Unauthorized scheduler.", 401);
    const { db, auth } = firebaseAdmin();
    const owner = randomUUID();
    const lock = db.doc("system/reminder-worker");
    const lease = await db.runTransaction(async tx => {
      const snapshot = await tx.get(lock);
      const data = snapshot.data();
      if ((data?.leaseUntil ?? 0) > Date.now()) return null;
      const scanCursor = typeof data?.scanCursor === "string" ? data.scanCursor : null;
      const scanAt = typeof data?.scanAt === "number" ? data.scanAt : null;
      tx.set(lock, { owner, leaseUntil: Date.now() + 120_000 }, { merge: true });
      return { scanCursor, scanAt };
    });
    if (!lease) return NextResponse.json({ skipped: "Another worker is active." });
    release = () => db.runTransaction(async tx => {
      const current = await tx.get(lock);
      if (current.data()?.owner !== owner) return;
      tx.update(lock, {
        owner: null,
        leaseUntil: 0,
        lastRunAt: Date.now(),
        lastRun: metrics,
        ...(metrics.failed === 0 ? { lastSuccessfulRunAt: Date.now() } : {}),
      });
    });

    const deletions = await runDeletionJobs(db, auth, Date.now() + 10_000);
    metrics.failed += deletions.failed;
    if (!pushConfigured()) {
      metrics.queueBacklog = !(await db.collectionGroup("reminderJobs").limit(1).get()).empty;
      if (deletions.failed) return NextResponse.json({ error: "Some account deletions failed. The next scheduler tick will retry.", ...metrics, deletions }, { status: 503 });
      return NextResponse.json({ ...metrics, deletions, push: "unconfigured" });
    }

    DomainEventRegistry.register(ReminderDue.NAME, ReminderDue);
    const bus = new InMemoryEventBus(new InMemoryEventStore(), {}, new InMemoryDeadLetterStore());
    bus.subscribe(ReminderDue.NAME, new DeliverReminder(db));
    const started = Date.now();
    try {
      await scanDevices(db, owner, lease.scanCursor, lease.scanAt, started + SCAN_BUDGET, metrics);
      await deliverQueuedReminders(db, bus, owner, started + RUN_BUDGET, metrics);
    } finally {
      await bus.close();
    }

    metrics.queueBacklog = !(await db.collectionGroup("reminderJobs").limit(1).get()).empty;
    const result = { ...metrics, deletions };
    if (metrics.failed || deletions.failed) return NextResponse.json({ error: "Some scheduled tasks failed. Inspect worker status and server logs; the next tick will retry.", ...result }, { status: 503 });
    return NextResponse.json(result);
  } catch (error) {
    metrics.failed++;
    return apiFailure(error, "Reminder worker");
  } finally {
    if (release) {
      await release();
      console.info("Reminder worker run:", metrics);
    }
  }
}
