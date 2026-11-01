import "server-only";
import { EntityRegistry, FirestoreDAO, type CollectionReference } from "@schorts/firestore-admin-dao";
import { Habit, type HabitModel } from "../domain/habit.entity";

export class FirestoreHabitDAO extends FirestoreDAO<HabitModel, Habit> {
  constructor(collection: CollectionReference) {
    if (!EntityRegistry.has(collection.path)) EntityRegistry.register(collection.path, Habit);
    super(collection, "HARD");
  }
}
