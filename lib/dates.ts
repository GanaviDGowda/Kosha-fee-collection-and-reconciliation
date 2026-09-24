// Dates are shown like "24 Sep 2026", times in IST. Due dates are plain calendar dates
// ("2026-08-15") and are formatted without any time-zone shift.

export const TIME_ZONE = "Asia/Kolkata";

// Day, month and year come from Intl (for the time zone), but month names are our own:
// newer ICU data abbreviates September as "Sept" in en-GB, and we want "24 Sep 2026".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const partsFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", year: "numeric", timeZone: TIME_ZONE });
const dateFmt = {
  format(d: Date): string {
    const parts = Object.fromEntries(partsFmt.formatToParts(d).map((p) => [p.type, p.value]));
    return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
  },
};
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const isoDateFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // A bare calendar date: pin it to midday IST so formatting never rolls it over.
  if (DATE_ONLY.test(value)) return new Date(`${value}T12:00:00+05:30`);
  return new Date(value);
}

/** "24 Sep 2026" */
export function formatDate(value: string | Date): string {
  return dateFmt.format(toDate(value));
}

/** "24 Sep 2026, 14:05 IST" */
export function formatDateTime(value: string | Date): string {
  const d = toDate(value);
  return `${dateFmt.format(d)}, ${timeFmt.format(d)} IST`;
}

/** Calendar date in IST as "YYYY-MM-DD". */
export function isoDateIST(value: string | Date = new Date()): string {
  return isoDateFmt.format(toDate(value));
}

/** Adds whole days to a "YYYY-MM-DD" date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
