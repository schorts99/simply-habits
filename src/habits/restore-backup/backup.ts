import { parseHabit, type HabitModel } from "../domain/habit.entity";
import { mergeHabits, sameHabit } from "@/sync/domain/merge-habits";

export type BackupPreview = { added: number; merged: number; unchanged: number; blocked: number; items: { name: string; outcome: "New habit" | "Merge changes" | "Keep newer or identical data" | "Blocked by permanent deletion" }[] };
export function previewBackup(incoming: HabitModel[], local: HabitModel[]): BackupPreview {
  const existing = new Map(local.map(habit => [habit.id, habit]));
  const preview: BackupPreview = { added: 0, merged: 0, unchanged: 0, blocked: 0, items: [] };
  for (const habit of incoming) {
    const current = existing.get(habit.id);
    let outcome: BackupPreview["items"][number]["outcome"];
    if (!current) { preview.added++; outcome = "New habit"; }
    else if (current.deleted) { preview.blocked++; outcome = "Blocked by permanent deletion"; }
    else if (sameHabit(current, mergeHabits(current, habit))) { preview.unchanged++; outcome = "Keep newer or identical data"; }
    else { preview.merged++; outcome = "Merge changes"; }
    preview.items.push({ name: habit.name, outcome });
  }
  return preview;
}

export const MAX_BACKUP_BYTES = 20_000_000;
export function parseBackup(text: string): HabitModel[] {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 20 MB limit.");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) { if (error instanceof SyntaxError) throw new Error("Choose a valid Simply Habits JSON backup."); throw error; }
  if (!value || typeof value !== "object" || !("app" in value) || value.app !== "Simply Habits" || !("version" in value) || value.version !== 1 || !("habits" in value) || !Array.isArray(value.habits) || value.habits.length > 1000) throw new Error("Choose a version 1 Simply Habits backup with at most 1,000 habits.");
  const habits = value.habits.map(parseHabit);
  if (habits.some(habit => habit.deleted) || new Set(habits.map(habit => habit.id)).size !== habits.length) throw new Error("Backup contains deleted or duplicate habits.");
  return habits;
}
