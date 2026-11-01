import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { firebaseAdmin } from "@/sync/infrastructure/firebase-admin";

export class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function authenticated(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new HttpError("Sign in to use this feature.", 401);
  if (!process.env.FIREBASE_PROJECT_ID && !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new HttpError("Firebase is not configured on this server.", 503);
  const admin = firebaseAdmin();
  try {
    const identity = await admin.auth.verifyIdToken(header.slice(7), true);
    return { ...admin, uid: identity.uid, authTime: identity.auth_time };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code.startsWith("auth/")) throw new HttpError("Your session has expired. Please sign in again.", 401);
    throw error;
  }
}
export function sameOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) throw new HttpError("Invalid request origin.", 403);
}
export async function boundedJson(request: NextRequest, limit = 16_384): Promise<unknown> {
  if (!request.body) throw new HttpError("Missing request data.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > limit) { await reader.cancel(); throw new HttpError("Request is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch (error) { if (error instanceof SyntaxError) throw new HttpError("Invalid JSON.", 400); throw error; }
}
export function apiFailure(error: unknown, label: string) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${label} failed:`, error);
  return NextResponse.json({ error: `${label} is temporarily unavailable. Please try again.` }, { status: 503 });
}
