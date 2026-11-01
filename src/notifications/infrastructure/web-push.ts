import "server-only";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { HttpError } from "@/shared/http/authenticated-request";

export type DeviceSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export const deviceId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");
export function parseSubscription(value: unknown): DeviceSubscription {
  if (!value || typeof value !== "object" || !("endpoint" in value) || typeof value.endpoint !== "string" || value.endpoint.length > 2048 || !("keys" in value) || !value.keys || typeof value.keys !== "object" || !("p256dh" in value.keys) || !("auth" in value.keys) || typeof value.keys.p256dh !== "string" || typeof value.keys.auth !== "string") throw new HttpError("Invalid push subscription.", 400);
  let url: URL;
  try { url = new URL(value.endpoint); } catch { throw new HttpError("Invalid push endpoint.", 400); }
  const allowed = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
  const validHost = allowed.includes(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !validHost || url.hash) throw new HttpError("This browser's push service is not supported.", 400);
  const { p256dh, auth } = value.keys;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth) || Buffer.from(p256dh, "base64url").length !== 65 || Buffer.from(p256dh, "base64url")[0] !== 4 || Buffer.from(auth, "base64url").length !== 16) throw new HttpError("Invalid push encryption keys.", 400);
  return { endpoint: url.href, keys: { p256dh, auth } };
}
export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}
export async function sendPush(subscription: DeviceSubscription, message: { title: string; body: string; tag: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new HttpError("Web Push is not configured.", 503);
  await webpush.sendNotification(subscription, JSON.stringify({ ...message, url: "/" }), {
    vapidDetails: { subject, publicKey, privateKey }, TTL: 600, urgency: "normal", timeout: 10_000,
  });
}
export function expiredPush(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && (error.statusCode === 404 || error.statusCode === 410);
}
