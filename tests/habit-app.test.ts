import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialSnapshot, type AppSnapshot } from "@/shared/application/habit-runtime";
import { Habit } from "@/habits/domain/habit.entity";
import { HabitApp } from "@/habits/ui/habit-app";
import { DataSettings } from "@/habits/ui/data-settings";

const state = vi.hoisted(() => ({ snapshot: null as AppSnapshot | null }));
vi.mock("@/shared/ui/use-habit-app", () => ({
  useHabitApp: () => ({ snapshot: state.snapshot, user: null, runtime: null, authBusy: false, authError: null, checkAccountDeletion: vi.fn(), deleteAccount: vi.fn() }),
}));
vi.mock("@/shared/ui/use-local-date", () => ({ useLocalDate: () => "2026-11-01" }));
afterEach(() => { state.snapshot = null; });

function button(html: string, name: string) {
  const found = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button => button.includes(name));
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}
describe("Deletion-pending interface", () => {
  it("disables habit mutation and offers enabled status/retry/export controls", () => {
    const habit = Habit.create(crypto.randomUUID(), { name: "Read", description: "", category: "Learning", color: "sage", period: "Anytime", target: 1, unit: "page", days: [0, 1, 2, 3, 4, 5, 6] }, "test", "2026-11-01").toPrimitives();
    state.snapshot = { ...initialSnapshot, loading: false, deletionPending: true, deletionFailed: true, habits: [habit] };
    const html = renderToStaticMarkup(createElement(HabitApp));
    expect(html).toContain("Account deletion pending");
    expect(html).toContain("Cleanup needs another attempt.");
    for (const name of ["New habit", 'aria-label="Edit Read"', 'aria-label="Check in Read"']) expect(button(html, name)).toContain("disabled");
    for (const name of ["Check deletion status", "Retry account deletion", "Download backup"]) expect(button(html, name)).not.toContain("disabled");
    state.snapshot = { ...state.snapshot, deletionPending: false };
    expect(button(renderToStaticMarkup(createElement(HabitApp)), "New habit")).not.toContain("disabled");
  });
  it("disables restore inputs and new deletion requests but retains export while pending", () => {
    const html = renderToStaticMarkup(createElement(DataSettings, {
      signedIn: true, disabled: false, deletionPending: true, habits: [],
      onPreview: async () => ({ added: 0, merged: 0, unchanged: 0, blocked: 0, items: [] }),
      onRestore: async () => {}, onClear: async () => {}, onDeleteAccount: async () => {}, onExport: () => {},
    }));
    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled/);
    expect(button(html, "Delete account and cloud data")).toContain("disabled");
    expect(button(html, "Download backup")).not.toContain("disabled");
  });
});
