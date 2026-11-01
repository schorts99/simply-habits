import { AbstractCommand, AbstractCommandHandler, CommandValidationError, type CommandHandlerContext } from "@schorts/shared-kernel/cqrs";
import { InvalidHabit } from "../domain/habit.entity";
import type { HabitRepository } from "../domain/habit.repository";

export class CheckInHabit extends AbstractCommand<{ id: string; day: string; delta: number }> {
  static readonly TYPE = "habits.check_in";
  getType(): string { return CheckInHabit.TYPE; }
}
export class CheckInHabitHandler extends AbstractCommandHandler<CheckInHabit, void> {
  constructor(private readonly repository: HabitRepository) { super(); }
  protected async execute(command: CheckInHabit, context: CommandHandlerContext): Promise<void> {
    const { id, day, delta } = command.getPayload();
    const habit = await this.repository.find(id);
    if (!habit) throw new CommandValidationError("This habit could not be found.");
    try { habit.checkIn(day, delta, context.correlationId); }
    catch (error) {
      if (error instanceof InvalidHabit) throw new CommandValidationError(error.message);
      throw error;
    }
    await this.repository.save(habit);
    context.events.push(...habit.pullDomainEvents());
  }
}
