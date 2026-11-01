import type { HabitModel } from "./habit.entity";
import { localDate, shiftDate, weekday } from "@/shared/domain/calendar";

export function scheduled(habit: HabitModel, day: string): boolean {
  return !habit.archived && day >= habit.created_on && habit.days.includes(weekday(day));
}
export function complete(habit: HabitModel, day: string): boolean {
  const entry = habit.entries[day];
  return !!entry && entry.count >= entry.target;
}
export function progress(habits: HabitModel[], day: string): { completed: number; total: number; percent: number } {
  const due = habits.filter(h => scheduled(h, day));
  const completed = due.filter(h => complete(h, day)).length;
  return { completed, total: due.length, percent: due.length ? Math.round(completed / due.length * 100) : 0 };
}
export function streak(habit: HabitModel, today = localDate()): number {
  let result = 0;
  for (let day = today; day >= habit.created_on; day = shiftDate(day, -1)) {
    if (!habit.days.includes(weekday(day))) continue;
    if (day === today && !complete(habit, day)) continue;
    if (!complete(habit, day)) break;
    result++;
  }
  return result;
}
export function insightSummary(habits: HabitModel[], today = localDate()) {
  const active = habits.filter(h => !h.archived);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDate(today, i - 6);
    return { day, ...progress(active, day) };
  });
  const totals = week.reduce((sum, day) => ({ completed: sum.completed + day.completed, total: sum.total + day.total }), { completed: 0, total: 0 });
  const checkIns = habits.reduce((sum, h) => sum + Object.values(h.entries).filter(e => e.count >= e.target).length, 0);
  return { week, checkIns, bestStreak: Math.max(0, ...active.map(h => streak(h, today))), weeklyRate: totals.total ? Math.round(totals.completed / totals.total * 100) : 0 };
}
