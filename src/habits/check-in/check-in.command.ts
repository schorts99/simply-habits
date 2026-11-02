import { AbstractCommand, AbstractCommandHandler, CommandValidationError, type CommandHandlerContext } from "@schorts/shared-kernel/cqrs";
import { InvalidHabit, type QuitOutcome } from "../domain/habit.entity";
import type { HabitRepository } from "../domain/habit.repository";

export type CheckInChange = number | QuitOutcome;
export class CheckInHabit extends AbstractCommand<{ id: string; day: string; delta: number } | { id: string; day: string; outcome: QuitOutcome }> {
  static readonly TYPE = "habits.check_in";
  getType(): string { return CheckInHabit.TYPE; }
}
export class CheckInHabitHandler extends AbstractCommandHandler<CheckInHabit, void> {
  constructor(private readonly repository: HabitRepository) { super(); }
  protected async execute(command: CheckInHabit, context: CommandHandlerContext): Promise<void> {
    const payload = command.getPayload();
    const { id, day } = payload;
    const habit = await this.repository.find(id);
    if (!habit) throw new CommandValidationError("This habit could not be found.");
    try {
      if ("outcome" in payload) habit.recordOutcome(day, payload.outcome, context.correlationId);
      else habit.checkIn(day, payload.delta, context.correlationId);
    }
    catch (error) {
      if (error instanceof InvalidHabit) throw new CommandValidationError(error.message);
      throw error;
    }
    await this.repository.save(habit);
    context.events.push(...habit.pullDomainEvents());
  }
}
