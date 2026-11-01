"use client";

import { useSyncExternalStore } from "react";
import { localDate } from "@/shared/domain/calendar";

function subscribe(listener: () => void) {
  const timer = setInterval(listener, 60_000);
  window.addEventListener("focus", listener);
  return () => { clearInterval(timer); window.removeEventListener("focus", listener); };
}
const serverDate = () => "";

export function useLocalDate(): string {
  return useSyncExternalStore(subscribe, localDate, serverDate);
}
