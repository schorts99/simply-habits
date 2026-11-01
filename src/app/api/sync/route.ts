import { NextRequest, NextResponse } from "next/server";
import { FirestoreUnitOfWorkRunner } from "@schorts/firestore-admin-dao";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";
import { FirestoreHabitDAO } from "@/habits/infrastructure/firestore-habit.dao";
import { Habit, InvalidHabit, parseHabit } from "@/habits/domain/habit.entity";
import { mergeHabits } from "@/sync/domain/merge-habits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function authorize(request: NextRequest) {
  if (!process.env.FIREBASE_PROJECT_ID && !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new HttpError("Cloud sync is not configured on this server.", 503);
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) throw new HttpError("Sign in to sync your habits.", 401);
  const admin = firebaseAdmin();
  let uid: string;
  try { uid = (await admin.auth.verifyIdToken(token.slice(7), true)).uid; }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code.startsWith("auth/")) throw new HttpError("Your session has expired. Please sign in again.", 401);
    throw error;
  }
  if ((await admin.db.doc(`users/${uid}`).get()).data()?.deleting) throw new HttpError("This account is being deleted.", 403);
  return { ...admin, uid, dao: new FirestoreHabitDAO(admin.db.collection(`users/${uid}/habits`)) };
}
function failure(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof InvalidHabit || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof SyntaxError ? "Invalid JSON." : error.message }, { status: 400 });
  console.error("Cloud sync request failed:", error);
  return NextResponse.json({ error: "Cloud sync is temporarily unavailable. Your habits are safe on this device." }, { status: 503 });
}
async function readBody(request: NextRequest): Promise<unknown> {
  if (!request.body) throw new HttpError("Missing sync data.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new HttpError("Sync request is too large.", 413);
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function GET(request: NextRequest) {
  try {
    const { dao } = await authorize(request);
    return NextResponse.json({ habits: (await dao.getAll()).map(h => h.toPrimitives()) });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new HttpError("Invalid request origin.", 403);
    const { dao, db, uid } = await authorize(request);
    const body = await readBody(request);
    if (!body || typeof body !== "object" || !("habits" in body) || !Array.isArray(body.habits) || body.habits.length > 20) throw new HttpError("Send at most 20 habits per request.", 400);
    const incoming = body.habits.map(parseHabit);
    if (new Set(incoming.map(h => h.id)).size !== incoming.length) throw new HttpError("Duplicate habit identifiers.", 400);
    if (incoming.some(h => Buffer.byteLength(JSON.stringify(h)) > 750_000)) throw new HttpError("A habit exceeds the cloud storage limit.", 413);
    const merged = await new FirestoreUnitOfWorkRunner(db).run(async uow => {
      if ((await uow.get(db.doc(`users/${uid}`))).data()?.deleting) throw new HttpError("This account is being deleted.", 403);
      const existing = await Promise.all(incoming.map(h => dao.findByID(h.id, uow)));
      const results = incoming.map((h, i) => existing[i] ? mergeHabits(existing[i]!.toPrimitives(), h) : h);
      await Promise.all(results.map(h => dao.save(Habit.fromPrimitives(h), uow)));
      return results;
    });
    return NextResponse.json({ habits: merged });
  } catch (error) { return failure(error); }
}
