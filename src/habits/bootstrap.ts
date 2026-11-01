import { CommandRegistry, InMemoryCommandBus, InMemoryQueryBus, QueryRegistry } from "@schorts/shared-kernel/cqrs";
import { DomainEventRegistry } from "@schorts/shared-kernel/domain-events";
import { AbstractEventSubscriber, InMemoryEventBus, InMemoryEventStore, InMemoryDeadLetterStore } from "@schorts/shared-kernel/event-bus";
import { HabitChanged } from "./domain/habit.entity";
import type { HabitRepository } from "./domain/habit.repository";
import { CreateHabit, CreateHabitHandler } from "./create-habit/create-habit.command";
import { EditHabit, EditHabitHandler } from "./edit-habit/edit-habit.command";
import { CheckInHabit, CheckInHabitHandler } from "./check-in/check-in.command";
import { ListHabits, ListHabitsHandler } from "./list-habits/list-habits.query";
import { DeleteHabit, DeleteHabitHandler } from "./delete-habit/delete-habit.command";
import { RestoreBackup, RestoreBackupHandler, HabitsRestored } from "./restore-backup/restore-backup.command";

class RefreshHabits extends AbstractEventSubscriber<HabitChanged | HabitsRestored> {
  constructor(private readonly onChange: (event: HabitChanged | HabitsRestored) => Promise<void>) { super(); }
  getName(): string { return "habits.refresh-and-request-sync"; }
  subscribedTo(): string[] { return [HabitChanged.NAME, HabitsRestored.NAME]; }
  async handle(event: HabitChanged | HabitsRestored): Promise<void> { await this.onChange(event); }
}

export function createHabitsModule(repository: HabitRepository, onChange: (event: HabitChanged | HabitsRestored) => Promise<void>) {
  const deadLetters = new InMemoryDeadLetterStore();
  const eventBus = new InMemoryEventBus(new InMemoryEventStore(), {}, deadLetters);
  const commandBus = new InMemoryCommandBus({ eventBus });
  commandBus.setConfig({ autoPublishEvents: true });
  const queryBus = new InMemoryQueryBus();
  CommandRegistry.register(CreateHabit.TYPE, CreateHabit);
  CommandRegistry.register(DeleteHabit.TYPE, DeleteHabit);
  CommandRegistry.register(RestoreBackup.TYPE, RestoreBackup);
  CommandRegistry.register(EditHabit.TYPE, EditHabit);
  CommandRegistry.register(CheckInHabit.TYPE, CheckInHabit);
  QueryRegistry.register(ListHabits.TYPE, ListHabits);
  DomainEventRegistry.register(HabitChanged.NAME, HabitChanged);
  DomainEventRegistry.register(HabitsRestored.NAME, HabitsRestored);
  commandBus.register(CreateHabit.TYPE, new CreateHabitHandler(repository));
  commandBus.register(DeleteHabit.TYPE, new DeleteHabitHandler(repository));
  commandBus.register(RestoreBackup.TYPE, new RestoreBackupHandler(repository));
  commandBus.register(EditHabit.TYPE, new EditHabitHandler(repository));
  commandBus.register(CheckInHabit.TYPE, new CheckInHabitHandler(repository));
  queryBus.register(ListHabits.TYPE, new ListHabitsHandler(repository));
  const subscriber = new RefreshHabits(onChange);
  eventBus.subscribe(HabitChanged.NAME, subscriber);
  eventBus.subscribe(HabitsRestored.NAME, subscriber);
  return {
    commandBus, queryBus, eventBus, deadLetters,
    async close() { await commandBus.close(); await queryBus.close(); await eventBus.close(); },
  };
}
