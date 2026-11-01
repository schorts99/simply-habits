import { NextRequest, NextResponse } from "next/server";
import { authenticated, sameOrigin, boundedJson, HttpError, apiFailure } from "@/shared/http/authenticated-request";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new HttpError("Sign in to use this feature.", 401);
    const { db, auth } = firebaseAdmin();
    // A deleted user's signed token may only inspect its own deletion outcome, not read or write data.
    const identity = await auth.verifyIdToken(header.slice(7));
    if (!(await db.doc(`users/${identity.uid}`).get()).data()?.deleting) return NextResponse.json({ deleted: false });
    try { await auth.getUser(identity.uid); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return NextResponse.json({ deleted: true });
      throw error;
    }
    return NextResponse.json({ deleted: false });
  } catch (error) { return apiFailure(error, "Account deletion"); }
}
export async function DELETE(request: NextRequest) {
  try {
    sameOrigin(request);
    const { db, auth, uid, authTime } = await authenticated(request);
    if (!authTime || Date.now() / 1000 - authTime > 300) throw new HttpError("Sign in again before deleting your account.", 401);
    const body = await boundedJson(request);
    if (!body || typeof body !== "object" || !("confirmation" in body) || body.confirmation !== "DELETE") throw new HttpError("Type DELETE to confirm account deletion.", 400);
    const account = db.doc(`users/${uid}`);
    // Keep a minimal deletion marker so already-authorized/in-flight sync cannot recreate data.
    await account.set({ deleting: true, deletionStartedAt: Date.now() });
    for (const collection of await account.listCollections()) await db.recursiveDelete(collection);
    const devices = await db.collection("pushDevices").where("uid", "==", uid).get();
    for (const device of devices.docs) await db.recursiveDelete(device.ref);
    await auth.deleteUser(uid);
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiFailure(error, "Account deletion"); }
}
