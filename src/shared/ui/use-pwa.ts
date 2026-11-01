"use client";

import { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function usePwa() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const setDisplay = () => setInstalled(media.matches);
    setDisplay();
    media.addEventListener("change", setDisplay);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const completed = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", completed);
    let cancelled = false;
    const message = (event: MessageEvent) => { if (event.data?.type === "OFFLINE_READY") setOfflineReady(true); };
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.addEventListener("message", message);
      void navigator.serviceWorker.register("/sw.js").then(async registration => {
        if (cancelled) return;
        if (registration.waiting) setUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller && !cancelled) setUpdate(worker);
            if (worker.state === "redundant" && !cancelled) setError("Offline setup couldn't finish. Reconnect and reload to try again.");
          });
        });
        await navigator.serviceWorker.ready;
        if (!cancelled) setOfflineReady(true);
      }).catch(error => {
        console.error("Service worker setup failed:", error);
        if (!cancelled) setError("Offline setup couldn't finish. Reconnect and reload to try again.");
      });
    }
    return () => {
      cancelled = true;
      media.removeEventListener("change", setDisplay);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", completed);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, []);

  async function install() {
    if (!prompt) { setInstructions(true); return; }
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } catch (error) {
      console.error("Install prompt failed:", error);
      setError("Installation couldn't start. Try your browser's install menu.");
    }
  }
  function applyUpdate() {
    if (!update) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    update.postMessage({ type: "SKIP_WAITING" });
  }
  return { installed, offlineReady, update, error, instructions, install, applyUpdate, closeInstructions: () => setInstructions(false) };
}
