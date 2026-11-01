import { AbstractCommand, AbstractCommandHandler, CommandValidationError, type CommandHandlerContext } from "@schorts/shared-kernel/cqrs";
import type { HabitRepository } from "../domain/habit.repository";

export class DeleteHabit extends AbstractCommand<{ id: string }> {
  static readonly TYPE = "habits.delete";
  getType(): string { return DeleteHabit.TYPE; }
}
export class DeleteHabitHandler extends AbstractCommandHandler<DeleteHabit, void> {
  constructor(private readonly repository: HabitRepository) { super(); }
  protected async execute(command: DeleteHabit, context: CommandHandlerContext): Promise<void> {
    const habit = await this.repository.find(command.getPayload().id);
    if (!habit) throw new CommandValidationError("This habit could not be found.");
    habit.delete(context.correlationId);
    await this.repository.save(habit);
    context.events.push(...habit.pullDomainEvents());
  }
}
