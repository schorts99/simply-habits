import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { NextRequest } from "next/server";
import { InMemoryEventBus, InMemoryEventStore } from "@schorts/shared-kernel/event-bus";
import { DomainEventRegistry } from "@schorts/shared-kernel/domain-events";
import { POST, GET, DELETE } from "@/app/api/notifications/route";
import { POST as testPush } from "@/app/api/notifications/test/route";
import { GET as tick } from "@/app/api/cron/reminders/route";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";
import { DeliverReminder } from "@/notifications/application/deliver-reminder";
import { deviceId } from "@/notifications/infrastructure/web-push";
import { ReminderDue, zonedClock } from "@/notifications/domain/reminder";
import { Habit, type HabitDetails } from "@/habits/domain/habit.entity";
import { FirestoreHabitDAO } from "@/habits/infrastructure/firestore-habit.dao";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
describe.skipIf(!authHost || !process.env.FIRESTORE_EMULATOR_HOST)("Web Push with Firestore/Auth emulators", () => {
  const accounts: { token: string; uid: string }[] = [];
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  const subscription = { endpoint: `https://fcm.googleapis.com/fcm/send/test-${crypto.randomUUID()}`, keys: { p256dh: pair.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
  const id = deviceId(subscription.endpoint);
  const origin = "http://localhost:3000";
  const preferences = { timezone: "UTC", habitTimes: {}, quotes: true, quoteTime: zonedClock(new Date(), "UTC").time };
  const accepted = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, headers: {}, body: "" });
  beforeAll(async () => {
    const keys = webpush.generateVAPIDKeys();
    vi.stubEnv("FIREBASE_PROJECT_ID", "demo-simply-habits");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
    vi.stubEnv("CRON_SECRET", randomBytes(32).toString("hex"));
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `push-${crypto.randomUUID()}@example.test`, password: "test-password-123", returnSecureToken: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Test account creation failed.");
      accounts.push({ token: body.idToken, uid: body.localId });
    }
  });
  afterAll(async () => {
    const { db, auth } = firebaseAdmin();
    await db.recursiveDelete(db.doc(`pushDevices/${id}`));
    await Promise.all(accounts.map(async a => {
      await db.recursiveDelete(db.collection(`users/${a.uid}/habits`));
      await auth.deleteUser(a.uid);
    }));
    accepted.mockRestore(); vi.unstubAllEnvs();
  });
  function request(path: string, method: string, body?: unknown, index = 0) {
    return new NextRequest(`${origin}${path}`, {
      method, headers: { Authorization: `Bearer ${accounts[index].token}`, Origin: origin, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  it("requires authentication and blocks cross-origin or malformed settings", async () => {
    expect((await POST(new NextRequest(`${origin}/api/notifications`, { method: "POST", headers: { Origin: origin }, body: "{}" }))).status).toBe(401);
    expect((await POST(new NextRequest(`${origin}/api/notifications`, { method: "POST", headers: { Origin: "https://other.test" }, body: "{}" }))).status).toBe(403);
    expect((await POST(request("/api/notifications", "POST", { subscription: { ...subscription, endpoint: "https://127.0.0.1/internal" }, preferences }))).status).toBe(400);
  });
  it("saves preferences, isolates ownership, and rejects unsynced habits", async () => {
    expect((await POST(request("/api/notifications", "POST", { subscription, preferences }))).status).toBe(200);
    const read = await GET(request(`/api/notifications?device=${id}`, "GET"));
    expect((await read.json()).preferences).toEqual(preferences);
    expect((await (await GET(request(`/api/notifications?device=${id}`, "GET", undefined, 1))).json()).preferences).toBeNull();
    expect((await POST(request("/api/notifications", "POST", { subscription, preferences }, 1))).status).toBe(409);
    expect((await DELETE(request("/api/notifications", "DELETE", { device: id }, 1))).status).toBe(403);
    expect((await POST(request("/api/notifications", "POST", { subscription, preferences: { ...preferences, habitTimes: { [crypto.randomUUID()]: "09:00" } } }))).status).toBe(409);
  });
  it("sends a rate-limited real-protocol test through an injected push transport", async () => {
    const response = await testPush(request("/api/notifications/test", "POST", { device: id }));
    expect(response.status).toBe(200);
    expect(accepted).toHaveBeenCalledOnce();
    expect((await testPush(request("/api/notifications/test", "POST", { device: id }))).status).toBe(429);
    expect((await testPush(request("/api/notifications/test", "POST", { device: id }, 1))).status).toBe(404);
    const { db } = firebaseAdmin();
    await db.doc(`pushDevices/${id}`).update({ preferences: { ...preferences, language: "es" }, lastTestAt: 0 });
    expect((await testPush(request("/api/notifications/test", "POST", { device: id }))).status).toBe(200);
    const message = accepted.mock.calls.at(-1)?.[1];
    if (typeof message !== "string") throw new Error("Push payload must be JSON text.");
    expect(JSON.parse(message)).toMatchObject({ title: "Tus pequeños recordatorios están listos", body: "Esta es una prueba de Simply Habits. Pequeños pasos. Buenos días." });
  });
  it("runs the protected scheduler and persists delivery deduplication", async () => {
    expect((await tick(new NextRequest(`${origin}/api/cron/reminders`))).status).toBe(401);
    const { db } = firebaseAdmin();
    await db.doc(`pushDevices/${id}`).update({ enabledAt: Date.now() - 900_000 });
    const cronRequest = () => new NextRequest(`${origin}/api/cron/reminders`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const first = await tick(cronRequest());
    expect(first.status).toBe(200);
    expect((await first.json()).planned).toBe(1);
    const count = accepted.mock.calls.length;
    expect((await tick(cronRequest())).status).toBe(200);
    expect(accepted.mock.calls.length).toBe(count);
  });
  it("validates synced active habits and skips completed goals in scheduling", async () => {
    const { db } = firebaseAdmin();
    const details: HabitDetails = { name: "Private habit", description: "", category: "Wellbeing", color: "sage", period: "Morning", target: 1, unit: "time", days: [0, 1, 2, 3, 4, 5, 6] };
    const h = Habit.create(crypto.randomUUID(), details, "test");
    const dao = new FirestoreHabitDAO(db.collection(`users/${accounts[0].uid}/habits`));
    await dao.save(h);
    const clock = zonedClock(new Date(), "UTC");
    const configured = { ...preferences, quotes: false, habitTimes: { [h.id.value]: clock.time } };
    expect((await POST(request("/api/notifications", "POST", { subscription, preferences: configured }))).status).toBe(200);
    // Use the UTC day explicitly; entity creation uses the machine's local day.
    const model = h.toPrimitives();
    model.entries[clock.day] = { count: 1, target: 1, updated_at: new Date().toISOString() };
    await dao.save(Habit.fromPrimitives(model));
    const before = accepted.mock.calls.length;
    expect((await tick(new NextRequest(`${origin}/api/cron/reminders`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }))).status).toBe(200);
    expect(accepted.mock.calls.length).toBe(before);
  });
  it("retries failures without marking success and removes expired subscriptions", async () => {
    const { db } = firebaseAdmin();
    const payload = { deviceId: id, uid: accounts[0].uid, key: "test-retry", title: "Test", body: "Test", dueAt: Date.now() };
    const sender = vi.fn().mockRejectedValueOnce(new Error("Push service unavailable")).mockResolvedValue(undefined);
    const subscriber = new DeliverReminder(db, sender);
    DomainEventRegistry.register(ReminderDue.NAME, ReminderDue);
    const bus = new InMemoryEventBus(new InMemoryEventStore());
    bus.subscribe(ReminderDue.NAME, subscriber);
    await expect(bus.publish(new ReminderDue("test", payload))).rejects.toThrow();
    await bus.publish(new ReminderDue("test", payload));
    await bus.publish(new ReminderDue("test", payload));
    expect(sender).toHaveBeenCalledTimes(2);
    await bus.close();
    const expired = new DeliverReminder(db, async () => { throw { statusCode: 410 }; });
    await expired.handle(new ReminderDue("test", { ...payload, key: "test-expired" }));
    expect((await db.doc(`pushDevices/${id}`).get()).exists).toBe(false);
  });
  it("disables only the owning device", async () => {
    expect((await POST(request("/api/notifications", "POST", { subscription, preferences }))).status).toBe(200);
    expect((await DELETE(request("/api/notifications", "DELETE", { device: id }))).status).toBe(200);
    expect((await (await GET(request(`/api/notifications?device=${id}`, "GET"))).json()).preferences).toBeNull();
  });
});
