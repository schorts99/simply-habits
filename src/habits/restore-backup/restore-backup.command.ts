import { AbstractCommand, AbstractCommandHandler, type CommandHandlerContext } from "@schorts/shared-kernel/cqrs";
import { DomainEvent } from "@schorts/shared-kernel/domain-events";
import type { HabitModel } from "../domain/habit.entity";
import type { HabitRepository } from "../domain/habit.repository";
import { parseBackup } from "./backup";

export class HabitsRestored extends DomainEvent<{ count: number; action: "backup-restored" }> {
  static readonly NAME = "habits.backup_restored";
  getEventName(): string { return HabitsRestored.NAME; }
}
export class RestoreBackup extends AbstractCommand<{ habits: HabitModel[] }> {
  static readonly TYPE = "habits.restore-backup";
  getType(): string { return RestoreBackup.TYPE; }
}
export class RestoreBackupHandler extends AbstractCommandHandler<RestoreBackup, void> {
  constructor(private readonly repository: HabitRepository) { super(); }
  protected async execute(command: RestoreBackup, context: CommandHandlerContext): Promise<void> {
    const habits = parseBackup(JSON.stringify({ app: "Simply Habits", version: 1, habits: command.getPayload().habits }));
    await this.repository.restore(habits);
    context.events.push(new HabitsRestored(context.correlationId, { count: habits.length, action: "backup-restored" }));
  }
}
