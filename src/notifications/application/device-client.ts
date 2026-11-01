"use client";

import type { User } from "firebase/auth";
import type { PushPreferences } from "../domain/reminder";

export const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
export const supportsPush = () => typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export async function browserDeviceId(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function notificationRequest(user: User, path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : `Notification request failed (${response.status}).`);
  return data;
}
export async function existingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}
export async function enableDevice(user: User, preferences: PushPreferences): Promise<PushSubscription> {
  if (!supportsPush()) throw new Error("This browser doesn't support Web Push here. On iPhone or iPad, install the app to your home screen first (iOS 16.4+).");
  if (!vapidPublicKey) throw new Error("Web Push has not been configured yet.");
  if (Notification.permission !== "granted") throw new Error("Allow notifications in your browser settings to enable reminders.");
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) throw new Error("Finish installing the offline app shell, then try again.");
  const key = Uint8Array.from(atob(vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  try {
    await notificationRequest(user, "/api/notifications", "POST", { subscription: subscription.toJSON(), preferences });
  } catch (error) {
    if (!existing) await subscription.unsubscribe();
    throw error;
  }
  return subscription;
}
export async function disableDevice(user: User): Promise<void> {
  if (!supportsPush()) return;
  const subscription = await existingSubscription();
  if (!subscription) return;
  const id = await browserDeviceId(subscription.endpoint);
  // Remove the server record first so a failed request never leaves an orphaned active device.
  if (navigator.onLine) await notificationRequest(user, "/api/notifications", "DELETE", { device: id });
  if (!await subscription.unsubscribe()) throw new Error("The browser couldn't unsubscribe. Please try again.");
}
