import { parseHabit, type HabitModel } from "../domain/habit.entity";

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
