import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET as status } from "@/app/api/account/route";
import { POST as sync, GET as read } from "@/app/api/sync/route";
import { POST as subscribe } from "@/app/api/notifications/route";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";
import { Habit, type HabitDetails } from "@/habits/domain/habit.entity";
import { DeliverReminder } from "@/notifications/application/deliver-reminder";
import { ReminderDue } from "@/notifications/domain/reminder";
import webpush from "web-push";
import { createECDH, randomBytes } from "node:crypto";
import { processDeletion } from "@/accounts/delete-account/deletion-worker";
import { GET as tick } from "@/app/api/cron/reminders/route";
import { Transaction } from "firebase-admin/firestore";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
describe.skipIf(!authHost || !process.env.FIRESTORE_EMULATOR_HOST)("Account deletion", () => {
  const accounts: { uid: string; token: string }[] = [];
  const device = `account-delete-${crypto.randomUUID()}`;
  const origin = "http://localhost:3000";
  const details: HabitDetails = { name: "Private", description: "Private text", category: "Focus", color: "sage", period: "Anytime", target: 1, unit: "time", days: [0, 1, 2, 3, 4, 5, 6] };
  const model = Habit.create(crypto.randomUUID(), details, "test").toPrimitives();
  function request(path: string, method: string, body?: unknown, index = 0) {
    return new NextRequest(`${origin}${path}`, { method, headers: { Origin: origin, Authorization: `Bearer ${accounts[index].token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  beforeAll(async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "demo-simply-habits");
    vi.stubEnv("CRON_SECRET", randomBytes(32).toString("hex"));
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `delete-${crypto.randomUUID()}@example.test`, password: "test-password-123", returnSecureToken: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Emulator account creation failed.");
      accounts.push({ uid: body.localId, token: body.idToken });
    }
  });
  afterAll(async () => {
    const { db, auth } = firebaseAdmin();
    for (const account of accounts) {
      await db.recursiveDelete(db.doc(`users/${account.uid}`));
      await db.doc(`accountDeletions/${account.uid}`).delete();
      try { await auth.deleteUser(account.uid); }
      catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "auth/user-not-found") throw error; }
    }
    await db.recursiveDelete(db.doc(`pushDevices/${device}`));
    vi.unstubAllEnvs();
  });
  it("requires same-origin authentication, explicit confirmation and recent sign-in", async () => {
    expect((await DELETE(new NextRequest(`${origin}/api/account`, { method: "DELETE", headers: { Origin: origin }, body: '{"confirmation":"DELETE"}' }))).status).toBe(401);
    expect((await DELETE(new NextRequest(`${origin}/api/account`, { method: "DELETE", headers: { Origin: "https://other.test" } }))).status).toBe(403);
    expect((await DELETE(request("/api/account", "DELETE", { confirmation: "no" }))).status).toBe(400);
    const { auth } = firebaseAdmin();
    const original = await auth.verifyIdToken(accounts[0].token, true);
    const old = vi.spyOn(auth, "verifyIdToken").mockResolvedValueOnce({ ...original, auth_time: Math.floor(Date.now() / 1000) - 301 });
    try { expect((await DELETE(request("/api/account", "DELETE", { confirmation: "DELETE" }))).status).toBe(401); }
    finally { old.mockRestore(); }
    const secret = process.env.CRON_SECRET!;
    vi.stubEnv("CRON_SECRET", "");
    try {
      expect((await DELETE(request("/api/account", "DELETE", { confirmation: "DELETE" }))).status).toBe(503);
      expect((await firebaseAdmin().db.doc(`accountDeletions/${accounts[0].uid}`).get()).exists).toBe(false);
    } finally { vi.stubEnv("CRON_SECRET", secret); }
  });
  it("blocks sync and pushes immediately during deletion, including receipt completion after a provider send", async () => {
    const { db } = firebaseAdmin();
    const pair = createECDH("prime256v1"); pair.generateKeys();
    const subscription = { endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`, keys: { p256dh: pair.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
    await db.doc(`pushDevices/${device}`).set({ uid: accounts[0].uid, subscription });
    const sender = vi.fn(async () => {
      await db.doc(`users/${accounts[0].uid}`).set({ deleting: true });
      await db.recursiveDelete(db.doc(`pushDevices/${device}`));
    });
    await new DeliverReminder(db, sender).handle(new ReminderDue("test", { uid: accounts[0].uid, deviceId: device, key: "inflight", title: "Test", body: "Test", dueAt: Date.now() }));
    expect(sender).toHaveBeenCalledOnce();
    expect((await db.collection(`pushDevices/${device}/deliveries`).get()).empty).toBe(true);
    expect((await sync(request("/api/sync", "POST", { habits: [model] }))).status).toBe(403);
    expect((await read(request("/api/sync", "GET"))).status).toBe(403);
    const keys = webpush.generateVAPIDKeys();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
    expect((await subscribe(request("/api/notifications", "POST", { subscription, preferences: { timezone: "UTC", habitTimes: {}, quotes: false, quoteTime: "09:00" } }))).status).toBe(403);
    const skipped = vi.fn();
    await new DeliverReminder(db, skipped).handle(new ReminderDue("test", { uid: accounts[0].uid, deviceId: device, key: "blocked", title: "Test", body: "Test", dueAt: Date.now() }));
    expect(skipped).not.toHaveBeenCalled();
  });
  it("reports partial failures without deleting authentication so the user can retry", async () => {
    const { db, auth } = firebaseAdmin();
    const batch = db.batch();
    for (let i = 0; i < 80; i++) batch.set(db.doc(`users/${accounts[0].uid}/habits/habit-${i}`), model);
    batch.set(db.doc(`users/${accounts[0].uid}/habits/${model.id}`), model);
    batch.set(db.doc(`users/${accounts[0].uid}/extra/document/nested/child`), { private: "remove" });
    batch.set(db.doc(`users/${accounts[1].uid}/habits/${model.id}`), model);
    batch.set(db.doc(`pushDevices/${device}`), { uid: accounts[0].uid });
    batch.set(db.doc(`pushDevices/${device}/deliveries/receipt`), { sentAt: 1 });
    await batch.commit();
    expect((await DELETE(request("/api/account", "DELETE", { confirmation: "DELETE" }))).status).toBe(202);
    expect((await db.doc(`users/${accounts[0].uid}/habits/${model.id}`).get()).exists).toBe(true);
    expect(await processDeletion(db, auth, accounts[0].uid, Date.now() - 1)).toBe(false);
    expect((await db.doc(`accountDeletions/${accounts[0].uid}`).get()).data()?.leaseUntil).toBe(0);
    await db.doc(`accountDeletions/${accounts[0].uid}`).update({ leaseUntil: Date.now() + 120_000 });
    expect(await processDeletion(db, auth, accounts[0].uid, Date.now() + 10_000)).toBe(false);
    await db.doc(`accountDeletions/${accounts[0].uid}`).update({ leaseUntil: 0 });
    const failure = vi.spyOn(auth, "deleteUser").mockRejectedValueOnce(new Error("Injected cleanup failure"));
    const counts = new Map<Transaction, number>();
    const originalDelete = Transaction.prototype.delete;
    const writes = vi.spyOn(Transaction.prototype, "delete").mockImplementation(function (this: Transaction, ref) {
      counts.set(this, (counts.get(this) ?? 0) + 1);
      return originalDelete.call(this, ref);
    });
    try {
      await expect(processDeletion(db, auth, accounts[0].uid, Date.now() + 10_000)).rejects.toThrow("Injected cleanup failure");
      expect(Math.max(...counts.values())).toBe(25);
    } finally { failure.mockRestore(); writes.mockRestore(); }
    expect((await auth.getUser(accounts[0].uid)).uid).toBe(accounts[0].uid);
    expect((await db.doc(`users/${accounts[0].uid}`).get()).data()?.deleting).toBe(true);
    expect(await (await status(request("/api/account", "GET"))).json()).toEqual({ deleted: false, pending: true, failed: true });
    expect((await db.doc(`accountDeletions/${accounts[0].uid}`).get()).data()?.phase).toBe("auth");
  });
  it("removes app data and Firebase identity, isolates other accounts, and confirms lost-response outcomes", async () => {
    const { db, auth } = firebaseAdmin();
    const identity = await auth.verifyIdToken(accounts[0].token);
    const response = await DELETE(request("/api/account", "DELETE", { confirmation: "DELETE" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ deleted: false, pending: true, failed: false });
    expect(await processDeletion(db, auth, accounts[0].uid, Date.now() + 10_000)).toBe(true);
    await expect(auth.getUser(accounts[0].uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await db.collection(`users/${accounts[0].uid}/habits`).get()).empty).toBe(true);
    expect((await db.doc(`users/${accounts[0].uid}/extra/document/nested/child`).get()).exists).toBe(false);
    expect((await db.doc(`pushDevices/${device}`).get()).exists).toBe(false);
    expect((await db.collection(`pushDevices/${device}/deliveries`).get()).empty).toBe(true);
    expect((await db.doc(`users/${accounts[1].uid}/habits/${model.id}`).get()).exists).toBe(true);
    // Unlike production, the emulator forces a user-existence check even with checkRevoked=false.
    const verification = vi.spyOn(auth, "verifyIdToken").mockResolvedValueOnce(identity);
    try {
      const outcome = await status(request("/api/account", "GET"));
      expect(outcome.status).toBe(200);
      expect((await outcome.json()).deleted).toBe(true);
    } finally { verification.mockRestore(); }
    expect((await sync(request("/api/sync", "POST", { habits: [model] }))).status).toBe(401);
    expect((await db.collection(`users/${accounts[0].uid}/habits`).get()).empty).toBe(true);
  });
  it("runs queued cleanup from the protected scheduler even without configured push", async () => {
    const { db, auth } = firebaseAdmin();
    expect((await DELETE(request("/api/account", "DELETE", { confirmation: "DELETE" }, 1))).status).toBe(202);
    vi.stubEnv("CRON_SECRET", randomBytes(32).toString("hex"));
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect((await tick(new NextRequest(`${origin}/api/cron/reminders`))).status).toBe(401);
    const response = await tick(new NextRequest(`${origin}/api/cron/reminders`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(response.status).toBe(200);
    expect((await response.json()).deletions.completed).toBe(1);
    expect((await db.collection(`users/${accounts[1].uid}/habits`).get()).empty).toBe(true);
    await expect(auth.getUser(accounts[1].uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });
});
