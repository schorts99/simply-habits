import { Entity } from "@schorts/shared-kernel/entities";
import { UUIDValue } from "@schorts/shared-kernel/value-objects";
import { DomainEvent } from "@schorts/shared-kernel/domain-events";
import { isCalendarDate, localDate, weekday } from "@/shared/domain/calendar";

export const CATEGORIES = ["Wellbeing", "Movement", "Learning", "Focus", "Everyday"] as const;
export const COLORS = ["sage", "peach", "lavender", "blue", "sand"] as const;
export const PERIODS = ["Morning", "Afternoon", "Evening", "Anytime"] as const;
export type HabitCategory = typeof CATEGORIES[number];
export type HabitColor = typeof COLORS[number];
export type HabitPeriod = typeof PERIODS[number];

export type HabitDetails = {
  name: string;
  description: string;
  category: HabitCategory;
  color: HabitColor;
  period: HabitPeriod;
  target: number;
  unit: string;
  days: number[];
};
export type CheckIn = { count: number; target: number; updated_at: string };
export type HabitModel = HabitDetails & {
  id: string;
  created_on: string;
  updated_at: string;
  archived: boolean;
  deleted?: boolean;
  entries: Record<string, CheckIn>;
};

export class HabitId extends UUIDValue {
  readonly attributeName = "habitId";
}
export class InvalidHabit extends Error {}

export class HabitChanged extends DomainEvent<{ habitId: string; action: "created" | "edited" | "checked-in" | "archived" | "restored" | "deleted" }> {
  static readonly NAME = "habits.habit_changed";
  getEventName(): string { return HabitChanged.NAME; }
}

function validStamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function validateDetails(data: HabitDetails): void {
  if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 80) throw new InvalidHabit("Give your habit a name between 1 and 80 characters.");
  if (typeof data.description !== "string" || data.description.length > 240) throw new InvalidHabit("Keep the description under 240 characters.");
  if (!CATEGORIES.includes(data.category) || !COLORS.includes(data.color) || !PERIODS.includes(data.period)) throw new InvalidHabit("Choose a valid category, color, and time of day.");
  if (!Number.isInteger(data.target) || data.target < 1 || data.target > 1000) throw new InvalidHabit("The daily target must be a whole number from 1 to 1,000.");
  if (typeof data.unit !== "string" || !data.unit.trim() || data.unit.trim().length > 24) throw new InvalidHabit("Add a unit, such as glasses or minutes (up to 24 characters).");
  if (!Array.isArray(data.days) || !data.days.length || data.days.length > 7 || new Set(data.days).size !== data.days.length || data.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new InvalidHabit("Choose at least one day of the week.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHabit(value: unknown): HabitModel {
  if (!isRecord(value)) throw new InvalidHabit("Invalid habit data.");
  const { id, name, description, category, color, period, target, unit, days, created_on, updated_at, archived, entries } = value;
  if (typeof id !== "string" || !new HabitId(id).isValid || typeof name !== "string" || typeof description !== "string" || !CATEGORIES.some(v => v === category) || !COLORS.some(v => v === color) || !PERIODS.some(v => v === period) || typeof target !== "number" || typeof unit !== "string" || !Array.isArray(days) || !days.every(d => typeof d === "number") || !isCalendarDate(created_on) || !validStamp(updated_at) || typeof archived !== "boolean" || !isRecord(entries)) throw new InvalidHabit("Invalid habit data.");
  const details: HabitDetails = {
    name, description, category: CATEGORIES.find(v => v === category)!, color: COLORS.find(v => v === color)!,
    period: PERIODS.find(v => v === period)!, target, unit, days,
  };
  validateDetails(details);
  if ("deleted" in value && typeof value.deleted !== "boolean") throw new InvalidHabit("Invalid habit data.");
  const parsed: Record<string, CheckIn> = {};
  if (Object.keys(entries).length > 36500) throw new InvalidHabit("This habit has too many history entries.");
  for (const [day, entry] of Object.entries(entries)) {
    if (!isCalendarDate(day) || day < created_on || !isRecord(entry) || !Number.isInteger(entry.count) || typeof entry.count !== "number" || entry.count < 0 || !Number.isInteger(entry.target) || typeof entry.target !== "number" || entry.target < 1 || entry.target > 1000 || entry.count > entry.target || !validStamp(entry.updated_at)) throw new InvalidHabit("Invalid check-in history.");
    parsed[day] = { count: entry.count, target: entry.target, updated_at: entry.updated_at };
  }
  const model = { id, ...details, created_on, updated_at, archived, entries: parsed };
  return value.deleted === true ? deletedHabit(model) : model;
}

export function deletedHabit(model: HabitModel): HabitModel {
  return { ...model, name: "Deleted habit", description: "", category: "Everyday", color: "sage", period: "Anytime", target: 1, unit: "time", days: [0, 1, 2, 3, 4, 5, 6], archived: true, deleted: true, entries: {} };
}

export class Habit extends Entity<HabitId, HabitModel> {
  private data!: HabitModel;

  static create(id: string, details: HabitDetails, correlationId: string, today = localDate()): Habit {
    validateDetails(details);
    if (!new HabitId(id).isValid) throw new InvalidHabit("Invalid habit identifier.");
    const habit = new Habit(new HabitId(id));
    habit.data = { ...structuredClone(details), name: details.name.trim(), unit: details.unit.trim(), id, created_on: today, updated_at: new Date().toISOString(), archived: false, entries: {} };
    habit.changed("created", correlationId);
    return habit;
  }

  edit(details: HabitDetails, correlationId: string): void {
    if (this.data.deleted) throw new InvalidHabit("This habit has been deleted.");
    validateDetails(details);
    this.data = { ...this.data, ...structuredClone(details), name: details.name.trim(), unit: details.unit.trim(), updated_at: this.nextStamp() };
    this.changed("edited", correlationId);
  }

  checkIn(day: string, delta: number, correlationId: string, today = localDate()): void {
    if (this.data.deleted) throw new InvalidHabit("This habit has been deleted.");
    if (!isCalendarDate(day) || day > today || day < this.data.created_on) throw new InvalidHabit("Check-ins must be on or after the habit's start date, and not in the future.");
    if (this.data.archived || !this.data.days.includes(weekday(day))) throw new InvalidHabit("This habit isn't scheduled for that day.");
    if (delta !== 1 && delta !== -1) throw new InvalidHabit("A check-in changes progress by one.");
    const previous = this.data.entries[day];
    const target = previous?.target ?? this.data.target;
    const count = (previous?.count ?? 0) + delta;
    if (count < 0 || count > target) throw new InvalidHabit("Your progress is already at its limit.");
    this.data.entries[day] = { count, target, updated_at: this.nextStamp() };
    this.changed("checked-in", correlationId);
  }

  setArchived(archived: boolean, correlationId: string): void {
    if (this.data.deleted) throw new InvalidHabit("This habit has been deleted.");
    this.data.archived = archived;
    this.data.updated_at = this.nextStamp();
    this.changed(archived ? "archived" : "restored", correlationId);
  }

  delete(correlationId: string): void {
    this.data = deletedHabit({ ...this.data, updated_at: this.nextStamp() });
    this.changed("deleted", correlationId);
  }

  private nextStamp(): string {
    const latest = Math.max(Date.parse(this.data.updated_at), ...Object.values(this.data.entries).map(e => Date.parse(e.updated_at)));
    return new Date(Math.max(Date.now(), latest + 1)).toISOString();
  }

  private changed(action: "created" | "edited" | "checked-in" | "archived" | "restored" | "deleted", correlationId: string): void {
    this.recordDomainEvent(new HabitChanged(correlationId, { habitId: this.id.value, action }));
  }
  toPrimitives(): HabitModel { return structuredClone(this.data); }
  protected override createId(id: unknown): HabitId { return new HabitId(String(id)); }
  protected override restoreFromPrimitives(data: HabitModel): void { this.data = parseHabit(data); }
}
