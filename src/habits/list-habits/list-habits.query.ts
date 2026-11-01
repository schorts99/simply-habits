import { AbstractQuery, AbstractQueryHandler } from "@schorts/shared-kernel/cqrs";
import type { HabitModel } from "../domain/habit.entity";
import type { HabitRepository } from "../domain/habit.repository";

export class ListHabits extends AbstractQuery<Record<string, never>> {
  static readonly TYPE = "habits.list";
  getType(): string { return ListHabits.TYPE; }
}
export class ListHabitsHandler extends AbstractQueryHandler<ListHabits, HabitModel[]> {
  constructor(private readonly repository: HabitRepository) { super(); }
  protected async execute(): Promise<HabitModel[]> {
    return (await this.repository.all()).map(h => h.toPrimitives()).filter(h => !h.deleted).sort((a, b) => a.created_on.localeCompare(b.created_on) || a.name.localeCompare(b.name));
  }
}
