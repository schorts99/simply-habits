import { AbstractCommand, AbstractCommandHandler, CommandValidationError, type CommandHandlerContext } from "@schorts/shared-kernel/cqrs";
import { InvalidHabit, type HabitDetails } from "../domain/habit.entity";
import type { HabitRepository } from "../domain/habit.repository";

export class EditHabit extends AbstractCommand<{ id: string; details?: HabitDetails; archived?: boolean }> {
  static readonly TYPE = "habits.edit";
  getType(): string { return EditHabit.TYPE; }
}
export class EditHabitHandler extends AbstractCommandHandler<EditHabit, void> {
  constructor(private readonly repository: HabitRepository) { super(); }
  protected async execute(command: EditHabit, context: CommandHandlerContext): Promise<void> {
    const { id, details, archived } = command.getPayload();
    const habit = await this.repository.find(id);
    if (!habit) throw new CommandValidationError("This habit could not be found.");
    if (details === undefined && archived === undefined) throw new CommandValidationError("No habit changes provided.");
    try {
      if (details) habit.edit(details, context.correlationId);
      if (archived !== undefined) habit.setArchived(archived, context.correlationId);
    } catch (error) {
      if (error instanceof InvalidHabit) throw new CommandValidationError(error.message);
      throw error;
    }
    await this.repository.save(habit);
    context.events.push(...habit.pullDomainEvents());
  }
}
