export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateObject(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

export function shiftDate(day: string, amount: number): string {
  const date = dateObject(day);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

export function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(dateObject(value).getTime()) && localDate(dateObject(value)) === value;
}

export function weekday(day: string): number {
  return dateObject(day).getDay();
}
