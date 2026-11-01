import type { Habit } from "./habit.entity";

export interface HabitRepository {
  all(): Promise<Habit[]>;
  find(id: string): Promise<Habit | null>;
  save(habit: Habit): Promise<void>;
}
