import { EntityRegistry, IndexedDBDAO, IndexedDBUnitOfWork } from "@schorts/indexed-db-dao";
import { Habit, type HabitModel } from "../domain/habit.entity";
import type { HabitRepository } from "../domain/habit.repository";
import { mergeHabits, sameHabit } from "@/sync/domain/merge-habits";

const STORE = "habits";
const OUTBOX = "outbox";
const META = "metadata";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Local storage request failed."));
  });
}
function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      if (!req.result.objectStoreNames.contains(OUTBOX)) req.result.createObjectStore(OUTBOX, { keyPath: "id" });
      req.result.createObjectStore(META);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error("Unable to open local storage."));
    req.onblocked = () => reject(new Error("Close other Simply Habits tabs to upgrade local storage."));
  });
}
class HabitDAO extends IndexedDBDAO<HabitModel, Habit> {}

export class IndexedDBHabitRepository implements HabitRepository {
  private readonly db: Promise<IDBDatabase>;
  private readonly dao: HabitDAO;
  constructor(namespace: string) {
    if (!EntityRegistry.has(STORE)) EntityRegistry.register(STORE, Habit);
    this.db = openDatabase(`simply-habits-v1-${namespace}`);
    this.dao = new HabitDAO(this.db, STORE);
  }
  all(): Promise<Habit[]> { return this.dao.getAll(); }
  find(id: string): Promise<Habit | null> { return this.dao.findByID(id); }
  async deletionPending(): Promise<boolean> {
    return (await request((await this.db).transaction(META).objectStore(META).get("deletionPending"))) === true;
  }
  async setDeletionPending(pending: boolean): Promise<void> {
    const uow = new IndexedDBUnitOfWork(await this.db, [META]);
    await uow.begin();
    try {
      await request(uow.getStore(META).put(pending, "deletionPending"));
      await uow.commit();
    } catch (error) { if (uow.isActive()) await uow.rollback(); throw error; }
  }

  async save(habit: Habit): Promise<void> {
    const uow = new IndexedDBUnitOfWork(await this.db, [STORE, OUTBOX]);
    await uow.begin();
    try {
      await Promise.all([this.dao.save(habit, uow), request(uow.getStore(OUTBOX).put(habit.toPrimitives()))]);
      await uow.commit();
    } catch (error) {
      if (uow.isActive()) await uow.rollback();
      throw error;
    }
  }
  async pending(): Promise<HabitModel[]> {
    const db = await this.db;
    return request<HabitModel[]>(db.transaction(OUTBOX).objectStore(OUTBOX).getAll());
  }

  async restore(models: HabitModel[]): Promise<void> {
    const uow = new IndexedDBUnitOfWork(await this.db, [STORE, OUTBOX]);
    await uow.begin();
    try {
      for (const model of models) {
        const existing = await this.dao.findByID(model.id, uow);
        const merged = existing ? mergeHabits(existing.toPrimitives(), model) : model;
        await Promise.all([this.dao.save(Habit.fromPrimitives(merged), uow), request(uow.getStore(OUTBOX).put(merged))]);
      }
      await uow.commit();
    } catch (error) { if (uow.isActive()) await uow.rollback(); throw error; }
  }
  async clear(): Promise<void> {
    const uow = new IndexedDBUnitOfWork(await this.db, [STORE, OUTBOX]);
    await uow.begin();
    try {
      await Promise.all([request(uow.getStore(STORE).clear()), request(uow.getStore(OUTBOX).clear())]);
      await uow.commit();
    } catch (error) { if (uow.isActive()) await uow.rollback(); throw error; }
  }

  async reconcile(remote: HabitModel[]): Promise<void> {
    const uow = new IndexedDBUnitOfWork(await this.db, [STORE, OUTBOX]);
    await uow.begin();
    try {
      for (const model of remote) {
        const local = await this.dao.findByID(model.id, uow);
        const merged = local ? mergeHabits(local.toPrimitives(), model) : model;
        await Promise.all([
          this.dao.save(Habit.fromPrimitives(merged), uow),
          sameHabit(merged, model) ? request(uow.getStore(OUTBOX).delete(model.id)) : request(uow.getStore(OUTBOX).put(merged)),
        ]);
      }
      await uow.commit();
    } catch (error) {
      if (uow.isActive()) await uow.rollback();
      throw error;
    }
  }
  async close(): Promise<void> { (await this.db).close(); }
}
