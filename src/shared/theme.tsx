"use client";

import { useEffect, useSyncExternalStore } from "react";
import { readPreference, writePreference } from "./ui/preference-storage";

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "simply-habits.theme";
const listeners = new Set<() => void>();
let preference: ThemePreference = "system";
let initialized = false;

function isTheme(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onSystemThemeChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    if (!listeners.size) media.removeEventListener("change", onSystemThemeChange);
  };
}
function notify() { for (const listener of listeners) listener(); }
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  preference = isTheme(event.newValue) ? event.newValue : "system";
  applyTheme(preference);
  notify();
}
function applyTheme(value: ThemePreference) {
  const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
function onSystemThemeChange() {
  if (preference === "system") applyTheme("system");
}
function getSnapshot() { return preference; }
function getServerSnapshot(): ThemePreference { return "system"; }
function initialize() {
  if (initialized) return;
  initialized = true;
  const saved = readPreference(STORAGE_KEY);
  preference = isTheme(saved) ? saved : "system";
  applyTheme(preference);
  notify();
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(initialize, []);
  function setTheme(next: ThemePreference) {
    preference = next;
    writePreference(STORAGE_KEY, next);
    applyTheme(next);
    notify();
  }
  return { theme: current, setTheme };
}

export function ThemeObserver() {
  useTheme();
  return null;
}
