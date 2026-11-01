import { NextRequest, NextResponse } from "next/server";
import { authenticated, sameOrigin, boundedJson, HttpError, apiFailure } from "@/shared/http/authenticated-request";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";
import { enqueueDeletion } from "@/accounts/delete-account/deletion-worker";

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
    const job = (await db.doc(`accountDeletions/${identity.uid}`).get()).data();
    if (job?.completed) return NextResponse.json({ deleted: true, pending: false, failed: false });
    if (job) return NextResponse.json({ deleted: false, pending: true, failed: job.failed === true });
    if (!(await db.doc(`users/${identity.uid}`).get()).data()?.deleting) return NextResponse.json({ deleted: false, pending: false, failed: false });
    try { await auth.getUser(identity.uid); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return NextResponse.json({ deleted: true, pending: false, failed: false });
      throw error;
    }
    return NextResponse.json({ deleted: false, pending: true, failed: true });
  } catch (error) { return apiFailure(error, "Account deletion"); }
}
export async function DELETE(request: NextRequest) {
  try {
    sameOrigin(request);
    const { db, uid, authTime } = await authenticated(request);
    if (!authTime || Date.now() / 1000 - authTime > 300) throw new HttpError("Sign in again before deleting your account.", 401);
    const body = await boundedJson(request);
    if (!body || typeof body !== "object" || !("confirmation" in body) || body.confirmation !== "DELETE") throw new HttpError("Type DELETE to confirm account deletion.", 400);
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) throw new HttpError("Account deletion requires the configured cleanup scheduler. Contact support.", 503);
    await enqueueDeletion(db, uid);
    return NextResponse.json({ deleted: false, pending: true, failed: false }, { status: 202 });
  } catch (error) { return apiFailure(error, "Account deletion"); }
}
