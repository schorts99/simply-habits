"use client";

import { useSyncExternalStore } from "react";

let error: string | null = null;
const listeners = new Set<() => void>();
function failed(cause: unknown) {
  console.error("Preference storage failed:", cause);
  error = "Browser preference storage is unavailable. Changes work for this session but may not survive a reload.";
  listeners.forEach(listener => listener());
}
export function readPreference(key: string): string | null {
  try { return localStorage.getItem(key); }
  catch (cause) { failed(cause); return null; }
}
export function writePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); }
  catch (cause) { failed(cause); }
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function usePreferenceStorageError() {
  return useSyncExternalStore(subscribe, () => error, () => null);
}
