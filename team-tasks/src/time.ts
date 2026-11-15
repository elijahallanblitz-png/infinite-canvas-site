// Everything about clocks: Pacific time, quiet hours, due dates.
export const TZ = 'America/Los_Angeles';
const DAY = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'long',
});

export interface PacificTime { date: string; hour: number; minute: number; weekday: number }

export function pacific(ms: number): PacificTime {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday.toLowerCase()),
  };
}

/** Quiet hours: never send between 9:00 PM and 8:00 AM Pacific. */
export function isQuiet(ms: number): boolean {
  const { hour } = pacific(ms);
  return hour >= 21 || hour < 8;
}

/** The first moment at or after `ms` when sending is allowed. */
export function nextSendTime(ms: number): number {
  if (!isQuiet(ms)) return ms;
  let t = Math.floor(ms / 3_600_000) * 3_600_000 + 3_600_000;
  for (let i = 0; i < 14 && isQuiet(t); i++) t += 3_600_000;
  return t;
}

/** The digest goes out in the 9:00 AM Pacific hour, Monday to Friday. */
export function isDigestHour(ms: number): boolean {
  const p = pacific(ms);
  return p.weekday >= 1 && p.weekday <= 5 && p.hour === 9;
}

// ---- Calendar date maths on YYYY-MM-DD strings (no time zones involved) ----
export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}
export function weekdayOf(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
}
/** "This week" means this Friday. From Friday on, it means Sunday. */
export function endOfWeek(today: string): string {
  const wd = weekdayOf(today);
  return wd >= 1 && wd <= 4 ? addDays(today, 5 - wd) : addDays(today, (7 - wd) % 7);
}

/**
 * Turn spoken or typed due dates into YYYY-MM-DD.
 * Returns null for "no due date", undefined when it cannot be understood.
 */
export function parseDue(input: unknown, today: string): string | null | undefined {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') return undefined;
  const s = input.trim().toLowerCase().replace(/[.,]/g, '').replace(/^(due|by|on|this|coming)\s+/, '');
  if (s === '' || s === 'none' || s === 'no date' || s === 'clear' || s === 'never') return null;
  if (isDate(s)) return s;
  if (s === 'today' || s === 'tonight' || s === 'eod') return today;
  if (s === 'tomorrow' || s === 'tmrw') return addDays(today, 1);
  if (s === 'week' || s === 'end of week' || s === 'end of the week' || s === 'eow') return endOfWeek(today);
  if (s === 'next week') return addDays(today, ((8 - weekdayOf(today)) % 7) || 7);
  const next = /^next\s+(\w+)$/.exec(s);
  const dayName = next ? next[1] : s;
  const wd = WEEKDAYS.findIndex((w) => w === dayName || (dayName.length >= 3 && w.startsWith(dayName)));
  if (wd >= 0) {
    const ahead = ((wd - weekdayOf(today) + 7) % 7) || 7; // always the next one, never today
    return addDays(today, ahead + (next && ahead < 7 - weekdayOf(today) ? 7 : 0));
  }
  const inDays = /^in\s+(\d{1,3})\s+days?$/.exec(s);
  if (inDays) return addDays(today, Number(inDays[1]));
  // "nov 20", "november 20th", "11/20", "11/20/2026"
  const year = Number(today.slice(0, 4));
  let m: RegExpExecArray | null;
  let month = -1, day = -1, y = year, explicitYear = false;
  if ((m = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/.exec(s))) {
    month = MONTHS.indexOf(m[1].slice(0, 3)); day = Number(m[2]);
    if (m[3]) { y = Number(m[3]); explicitYear = true; }
  } else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s))) {
    month = Number(m[1]) - 1; day = Number(m[2]);
    if (m[3]) { y = Number(m[3].length === 2 ? '20' + m[3] : m[3]); explicitYear = true; }
  }
  if (month >= 0 && day > 0) {
    const mk = (yy: number) => `${yy}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    let d = mk(y);
    if (!isDate(d)) return undefined;
    if (!explicitYear && d < today) d = mk(y + 1); // a bare "Jan 5" said in December means next January
    return isDate(d) ? d : undefined;
  }
  return undefined;
}

/** "today", "tomorrow", "Wed", "Nov 28" — for messages and Claude replies. */
export function describeDue(due: string, today: string): string {
  const n = daysBetween(today, due);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  const d = new Date(due + 'T00:00:00Z');
  if (n > 1 && n < 7) return d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
