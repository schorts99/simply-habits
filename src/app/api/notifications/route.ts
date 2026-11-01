import { NextRequest, NextResponse } from "next/server";
import { authenticated, sameOrigin, boundedJson, HttpError, apiFailure } from "@/shared/http/authenticated-request";
import { parsePreferences } from "@/notifications/domain/reminder";
import { deviceId, parseSubscription, pushConfigured } from "@/notifications/infrastructure/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { db, uid } = await authenticated(request);
    const id = request.nextUrl.searchParams.get("device");
    if (!id || !/^[a-f0-9]{64}$/.test(id)) throw new HttpError("Invalid device identifier.", 400);
    const stored = await db.collection("pushDevices").doc(id).get();
    const data = stored.data();
    return NextResponse.json({ configured: pushConfigured(), preferences: data?.uid === uid ? data.preferences : null });
  } catch (error) { return apiFailure(error, "Notification settings"); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const { db, uid } = await authenticated(request);
    if (!pushConfigured()) throw new HttpError("Web Push is not configured on this server.", 503);
    const body = await boundedJson(request);
    if (!body || typeof body !== "object" || !("subscription" in body) || !("preferences" in body)) throw new HttpError("Missing notification settings.", 400);
    const subscription = parseSubscription(body.subscription);
    let preferences;
    try { preferences = parsePreferences(body.preferences); } catch (error) { throw new HttpError(error instanceof Error ? error.message : "Invalid preferences.", 400); }
    const device = db.collection("pushDevices").doc(deviceId(subscription.endpoint));
    const habits = await Promise.all(Object.keys(preferences.habitTimes).map(id => db.doc(`users/${uid}/habits/${id}`).get()));
    if (habits.some(h => !h.exists || h.data()?.archived)) throw new HttpError("Sync your active habits before configuring their reminders.", 409);
    await db.runTransaction(async tx => {
      const old = await tx.get(device);
      if (old.exists && old.data()?.uid !== uid) throw new HttpError("This device is linked to another account. Disable its notifications before switching accounts.", 409);
      tx.set(device, { uid, subscription, preferences, enabledAt: old.data()?.enabledAt ?? Date.now(), updatedAt: Date.now() });
    });
    return NextResponse.json({ saved: true });
  } catch (error) { return apiFailure(error, "Notification settings"); }
}
export async function DELETE(request: NextRequest) {
  try {
    sameOrigin(request);
    const { db, uid } = await authenticated(request);
    const body = await boundedJson(request);
    if (!body || typeof body !== "object" || !("device" in body) || typeof body.device !== "string" || !/^[a-f0-9]{64}$/.test(body.device)) throw new HttpError("Invalid device identifier.", 400);
    const device = db.collection("pushDevices").doc(body.device);
    await db.runTransaction(async tx => {
      const stored = await tx.get(device);
      if (stored.exists && stored.data()?.uid !== uid) throw new HttpError("This device belongs to another account.", 403);
      tx.delete(device);
    });
    return NextResponse.json({ disabled: true });
  } catch (error) { return apiFailure(error, "Notification settings"); }
}
