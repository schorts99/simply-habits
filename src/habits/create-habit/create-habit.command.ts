import { AbstractCommand, AbstractCommandHandler, CommandValidationError, type CommandHandlerContext } from "@schorts/shared-kernel/cqrs";
import { Habit, InvalidHabit, type HabitDetails } from "../domain/habit.entity";
import type { HabitRepository } from "../domain/habit.repository";

export class CreateHabit extends AbstractCommand<{ id: string; details: HabitDetails }> {
  static readonly TYPE = "habits.create";
  getType(): string { return CreateHabit.TYPE; }
}
export class CreateHabitHandler extends AbstractCommandHandler<CreateHabit, void> {
  constructor(private readonly repository: HabitRepository) { super(); }
  protected async execute(command: CreateHabit, context: CommandHandlerContext): Promise<void> {
    const { id, details } = command.getPayload();
    if (await this.repository.find(id)) throw new CommandValidationError("This habit already exists.");
    let habit: Habit;
    try { habit = Habit.create(id, details, context.correlationId); }
    catch (error) {
      if (error instanceof InvalidHabit) throw new CommandValidationError(error.message);
      throw error;
    }
    await this.repository.save(habit);
    context.events.push(...habit.pullDomainEvents());
  }
}
