import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("Service worker push handlers", () => {
  function worker() {
    const handlers = new Map<string, (event: unknown) => void>();
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const self = {
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      registration: { showNotification },
      location: { origin: "https://habits.example.com" },
      clients: { matchAll: vi.fn().mockResolvedValue([{ url: "https://habits.example.com/", focus, navigate }]), openWindow },
    };
    runInNewContext(readFileSync("scripts/service-worker.js", "utf8"), { self, URL, console, caches: {} });
    return { handlers, showNotification, focus, navigate, openWindow };
  }
  it("displays private notifications and ignores payload-controlled navigation URLs", async () => {
    const w = worker();
    let promise: Promise<void> | undefined;
    w.handlers.get("push")!({ data: { json: () => ({ title: "A gentle nudge", body: "Open your habits.", tag: "test", url: "https://other.example" }) }, waitUntil: (work: Promise<void>) => { promise = work; } });
    await promise;
    expect(w.showNotification).toHaveBeenCalledWith("A gentle nudge", expect.objectContaining({ body: "Open your habits.", tag: "test", data: { url: "/" } }));
    w.handlers.get("notificationclick")!({ notification: { close: vi.fn() }, waitUntil: (work: Promise<void>) => { promise = work; } });
    await promise;
    expect(w.focus).toHaveBeenCalled();
    expect(w.navigate).toHaveBeenCalledWith("/");
    expect(w.openWindow).not.toHaveBeenCalled();
  });
  it("always displays a safe fallback for malformed push data", async () => {
    const w = worker();
    let promise: Promise<void> | undefined;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    w.handlers.get("push")!({ data: { json: () => { throw new Error("Invalid JSON"); } }, waitUntil: (work: Promise<void>) => { promise = work; } });
    await promise;
    expect(w.showNotification).toHaveBeenCalledWith("Simply Habits", expect.objectContaining({ data: { url: "/" } }));
    log.mockRestore();
  });
});
