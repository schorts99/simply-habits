import type { AbstractCommand } from "@schorts/shared-kernel/cqrs";
import type { User } from "firebase/auth";
import { createHabitsModule } from "@/habits/bootstrap";
import { IndexedDBHabitRepository } from "@/habits/infrastructure/indexed-db-habit.repository";
import { ListHabits } from "@/habits/list-habits/list-habits.query";
import type { HabitModel } from "@/habits/domain/habit.entity";
import { synchronize } from "@/sync/application/sync-client";
import { Habit } from "@/habits/domain/habit.entity";
import { mergeHabits } from "@/sync/domain/merge-habits";

export type AppSnapshot = {
  habits: HabitModel[];
  loading: boolean;
  online: boolean;
  pending: number;
  syncing: boolean;
  error: string | null;
  lastSync: string | null;
};
export const initialSnapshot: AppSnapshot = { habits: [], loading: true, online: true, pending: 0, syncing: false, error: null, lastSync: null };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if ("originalError" in error && error.originalError instanceof Error) return error.originalError.message;
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export class HabitRuntime {
  readonly repository: IndexedDBHabitRepository;
  private readonly module;
  private listeners = new Set<() => void>();
  private state: AppSnapshot = initialSnapshot;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private retryTimer?: ReturnType<typeof setInterval>;
  private channel?: BroadcastChannel;
  private syncRequested = false;

  constructor(readonly user: User | null) {
    this.repository = new IndexedDBHabitRepository(user?.uid ?? "guest");
    this.module = createHabitsModule(this.repository, async () => {
      await this.refresh();
      this.channel?.postMessage("changed");
      this.requestSync();
    });
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(values: Partial<AppSnapshot>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...values };
    this.listeners.forEach(listener => listener());
  }
  clearError = () => this.update({ error: null });
  reportError = (error: unknown) => { console.error("Simply Habits:", error); this.update({ error: errorMessage(error), loading: false }); };

  async start() {
    try {
      this.update({ online: navigator.onLine });
      await this.refresh();
      this.update({ loading: false });
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel(`simply-habits-${this.user?.uid ?? "guest"}`);
        this.channel.onmessage = event => {
          void this.refresh().catch(this.reportError);
          if (event.data === "changed") this.requestSync();
        };
      }
      window.addEventListener("online", this.online);
      window.addEventListener("offline", this.offline);
      window.addEventListener("focus", this.focus);
      this.retryTimer = setInterval(() => this.requestSync(), 30_000);
      this.requestSync();
    } catch (error) { this.reportError(error); }
  }
  private online = () => { this.update({ online: true }); this.requestSync(); };
  private offline = () => this.update({ online: false });
  private focus = () => { void this.refresh().catch(this.reportError); this.requestSync(); };
  async refresh() {
    const habits = await this.module.queryBus.dispatch<ListHabits, HabitModel[]>(new ListHabits(crypto.randomUUID(), {}));
    this.update({ habits, pending: (await this.repository.pending()).length });
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const locked = async (): Promise<T> => {
      if (navigator.locks) return await navigator.locks.request(`simply-habits-write-${this.user?.uid ?? "guest"}`, work);
      return await work();
    };
    const result = this.queue.then(locked, locked);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async execute(command: AbstractCommand): Promise<void> {
    try {
      await this.exclusive(async () => {
        if (this.disposed) throw new Error("This account is no longer active.");
        await this.module.commandBus.dispatch(command);
      });
    } catch (error) {
      await this.refresh().catch(this.reportError);
      this.reportError(error);
      throw error;
    }
  }
  requestSync = () => {
    if (!this.user || !this.state.online || this.disposed) return;
    if (this.state.syncing) { this.syncRequested = true; return; }
    void this.sync();
  };
  private async sync() {
    if (!this.user) return;
    this.update({ syncing: true });
    this.syncRequested = false;
    try {
      await synchronize(this.user, await this.repository.pending(), async remote => {
        await this.exclusive(async () => {
          if (this.disposed) return;
          await this.repository.reconcile(remote);
          await this.refresh();
        });
      });
      this.update({ lastSync: new Date().toISOString(), error: null });
      this.channel?.postMessage("synced");
    } catch (error) {
      this.reportError(error);
    } finally {
      this.update({ syncing: false });
      if (this.syncRequested && !this.state.error) this.requestSync();
    }
  }
  async importGuestHabits() {
    const guest = new IndexedDBHabitRepository("guest");
    try {
      const habits = await guest.all();
      await this.exclusive(async () => {
        for (const habit of habits) {
          const existing = await this.repository.find(habit.id.value);
          await this.repository.save(existing ? Habit.fromPrimitives(mergeHabits(existing.toPrimitives(), habit.toPrimitives())) : habit);
        }
      });
      await this.refresh();
      this.requestSync();
    } finally { await guest.close(); }
  }
  async close() {
    this.disposed = true;
    clearInterval(this.retryTimer);
    window.removeEventListener("online", this.online);
    window.removeEventListener("offline", this.offline);
    window.removeEventListener("focus", this.focus);
    this.channel?.close();
    await this.queue;
    await this.module.close();
    await this.repository.close();
  }
}
