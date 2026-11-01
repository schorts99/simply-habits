import type { AbstractCommand } from "@schorts/shared-kernel/cqrs";
import type { User } from "firebase/auth";
import { createHabitsModule } from "@/habits/bootstrap";
import { IndexedDBHabitRepository } from "@/habits/infrastructure/indexed-db-habit.repository";
import { ListHabits } from "@/habits/list-habits/list-habits.query";
import type { HabitModel } from "@/habits/domain/habit.entity";
import { synchronize } from "@/sync/application/sync-client";
import { Habit } from "@/habits/domain/habit.entity";
import { mergeHabits } from "@/sync/domain/merge-habits";
import { RestoreBackup } from "@/habits/restore-backup/restore-backup.command";
import { getDeletionStatus, type DeletionStatus } from "@/accounts/delete-account/delete-account.client";
import { previewBackup } from "@/habits/restore-backup/backup";

export type AppSnapshot = {
  habits: HabitModel[];
  loading: boolean;
  online: boolean;
  pending: number;
  syncing: boolean;
  error: string | null;
  lastSync: string | null;
  deletionPending: boolean;
  deletionFailed: boolean;
  accountDeleted: boolean;
};
export const initialSnapshot: AppSnapshot = { habits: [], loading: true, online: true, pending: 0, syncing: false, error: null, lastSync: null, deletionPending: false, deletionFailed: false, accountDeleted: false };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if ("originalError" in error && error.originalError instanceof Error) return errorMessage(error.originalError);
    if ("code" in error && typeof error.code === "string" && error.code.startsWith("auth/")) {
      if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") return "Sign-in was cancelled. Please try again when ready.";
      if (error.code === "auth/popup-blocked") return "Allow popups for this site and try signing in again.";
      if (error.code === "auth/network-request-failed") return "Check your internet connection and try again.";
      if (error.code === "auth/requires-recent-login" || error.code === "auth/user-token-expired" || error.code === "auth/invalid-user-token") return "Your session has expired. Please sign in again.";
      return "Google sign-in failed. Please try again or contact support.";
    }
    if (error.name === "QuotaExceededError") return "Browser storage is full. Export your habits and free up space before trying again.";
    if (error.name === "SecurityError" || error.name === "InvalidStateError" || error.name === "UnknownError") return "Browser storage is unavailable. Allow site storage or use another browser; your changes could not be saved.";
    if (error.name === "TimeoutError" || error.name === "AbortError") return "The request timed out or was interrupted. Please try again.";
    if (error.message === "Failed to fetch" || error.message === "Load failed") return "Check your internet connection and try again.";
    if (/^Notification request failed \(\d+\)\.$/.test(error.message)) return "Notification request failed. Please try again.";
    if (/^Cloud sync failed \(\d+\)\.$/.test(error.message)) return "Cloud sync failed. Please try again.";
    if (error.name === "NotReadableError") return "The selected file could not be read. Choose it again.";
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
  private deletingAccount = false;
  private syncTask?: Promise<void>;

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
      if (this.user && await this.repository.deletionPending()) {
        this.deletingAccount = true;
        this.update({ deletionPending: true });
      }
      await this.refresh();
      this.update({ loading: false });
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel(`simply-habits-${this.user?.uid ?? "guest"}`);
        this.channel.onmessage = event => {
          if (event.data === "account-deleted") {
            this.deletingAccount = true;
            this.update({ deletionPending: true, accountDeleted: true });
            return;
          }
          if (event.data === "account-deleting") {
            void this.pauseForAccountDeletion(false).catch(this.reportError);
            return;
          }
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
        if (this.deletingAccount || await this.repository.deletionPending()) throw new Error("This account is being deleted.");
        await this.module.commandBus.dispatch(command);
      });
    } catch (error) {
      await this.refresh().catch(this.reportError);
      this.reportError(error);
      throw error;
    }
  }
  requestSync = () => {
    if (!this.user || !this.state.online || this.disposed || this.deletingAccount) return;
    if (this.state.syncing) { this.syncRequested = true; return; }
    this.syncTask = this.sync();
  };
  private async sync() {
    if (!this.user) return;
    this.update({ syncing: true });
    this.syncRequested = false;
    try {
      const deletion = await getDeletionStatus(await this.user.getIdToken());
      if (deletion.pending || deletion.deleted) {
        await this.applyDeletionStatus(deletion);
        return;
      }
      await synchronize(this.user, await this.repository.pending(), async remote => {
        await this.exclusive(async () => {
          if (this.disposed || this.deletingAccount) return;
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
    if (this.deletingAccount) return;
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
  async restoreBackup(models: HabitModel[]) {
    await this.execute(new RestoreBackup(crypto.randomUUID(), { habits: models }));
  }
  async previewBackup(models: HabitModel[]) {
    return this.exclusive(async () => previewBackup(models, (await this.repository.all()).map(habit => habit.toPrimitives())));
  }
  async clearLocalData() {
    if (this.user) throw new Error("Sign out before clearing local habits.");
    await this.exclusive(() => this.repository.clear());
    await this.refresh();
    this.channel?.postMessage("changed");
  }
  async clearAccountVault() {
    await this.exclusive(async () => {
      if (!this.disposed) await this.repository.clear();
      else {
        if (!this.user) throw new Error("Sign in to use this feature.");
        const repository = new IndexedDBHabitRepository(this.user.uid);
        try { await repository.clear(); }
        finally { await repository.close(); }
      }
    });
    if (!this.disposed) await this.refresh();
  }
  async pauseForAccountDeletion(broadcast = true) {
    this.deletingAccount = true;
    this.update({ deletionPending: true });
    await this.syncTask;
    await this.exclusive(() => this.repository.setDeletionPending(true));
    if (broadcast) this.channel?.postMessage("account-deleting");
  }
  async applyDeletionStatus(status: DeletionStatus) {
    if (this.disposed) return;
    this.deletingAccount = status.pending || status.deleted;
    await this.exclusive(() => this.repository.setDeletionPending(this.deletingAccount));
    this.update({ deletionPending: this.deletingAccount, deletionFailed: status.failed, accountDeleted: status.deleted });
    if (!this.deletingAccount) this.requestSync();
  }
  notifyAccountDeleted() {
    this.channel?.postMessage("account-deleted");
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
