export function formatWhen(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return `${hours.toFixed(1)} h`;
}
