import { parseHabit, type HabitModel } from "@/habits/domain/habit.entity";

function newest<T extends { updated_at: string }>(a: T, b: T): T {
  const comparison = a.updated_at.localeCompare(b.updated_at);
  // Stable tie-breaking makes both sides converge even when device clocks match.
  return comparison > 0 || (comparison === 0 && JSON.stringify(a) > JSON.stringify(b)) ? a : b;
}
export function mergeHabits(a: HabitModel, b: HabitModel): HabitModel {
  if (a.id !== b.id) throw new Error("Cannot merge different habits.");
  const merged = structuredClone(newest(a, b));
  merged.created_on = a.created_on < b.created_on ? a.created_on : b.created_on;
  merged.entries = {};
  for (const day of [...new Set([...Object.keys(a.entries), ...Object.keys(b.entries)])].sort()) {
    const left = a.entries[day], right = b.entries[day];
    merged.entries[day] = structuredClone(left && right ? newest(left, right) : left ?? right);
  }
  return parseHabit(merged);
}
export function sameHabit(a: HabitModel, b: HabitModel): boolean {
  const canonical = (h: HabitModel) => JSON.stringify({ ...h, entries: Object.fromEntries(Object.entries(h.entries).sort(([a], [b]) => a.localeCompare(b))) });
  return canonical(a) === canonical(b);
}
