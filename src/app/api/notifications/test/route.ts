import { NextRequest, NextResponse } from "next/server";
import { authenticated, sameOrigin, boundedJson, HttpError, apiFailure } from "@/shared/http/authenticated-request";
import { expiredPush, parseSubscription, sendPush } from "@/notifications/infrastructure/web-push";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const { db, uid } = await authenticated(request);
    const body = await boundedJson(request);
    if (!body || typeof body !== "object" || !("device" in body) || typeof body.device !== "string" || !/^[a-f0-9]{64}$/.test(body.device)) throw new HttpError("Invalid device identifier.", 400);
    const ref = db.doc(`pushDevices/${body.device}`);
    const subscription = await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists || doc.data()?.uid !== uid) throw new HttpError("Enable notifications on this device first.", 404);
      if ((doc.data()?.lastTestAt ?? 0) > Date.now() - 60_000) throw new HttpError("Wait one minute before sending another test.", 429);
      tx.update(ref, { lastTestAt: Date.now() });
      return parseSubscription(doc.data()!.subscription);
    });
    try { await sendPush(subscription, { title: "Your little reminders are ready", body: "This is a test from Simply Habits. Small steps. Good days.", tag: "simply-habits-test" }); }
    catch (error) {
      if (expiredPush(error)) { await ref.delete(); throw new HttpError("This subscription expired. Disable and enable notifications again.", 410); }
      throw error;
    }
    return NextResponse.json({ accepted: true });
  } catch (error) { return apiFailure(error, "Test notification"); }
}
