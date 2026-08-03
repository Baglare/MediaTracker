import type { GoalPeriodWindow, GoalSchedule } from "./types";

export type GoalDateResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "date_invalid" | "timezone_invalid" | "instant_invalid"; message: string };

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const ISO_INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDateOnly(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

export function isValidDateOnly(value: unknown): value is string {
  return typeof value === "string" && parseDateOnly(value) !== null;
}

export function isValidIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match || !isValidDateOnly(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  return hour <= 23 && minute <= 59 && second <= 59
    && offsetHour <= 23 && offsetMinute <= 59
    && Number.isFinite(Date.parse(value));
}

function formatDateOnly(value: CivilDate): string {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

// Gregorian civil-date arithmetic. Date-only values are never parsed through Date.
function daysFromCivil({ year, month, day }: CivilDate): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number): CivilDate {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524)
      - Math.floor(dayOfEra / 146096)) / 365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

export function addGoalCalendarDays(date: string, amount: number): string {
  const parsed = parseDateOnly(date);
  if (!parsed || !Number.isInteger(amount)) throw new Error("invalid_goal_calendar_date");
  return formatDateOnly(civilFromDays(daysFromCivil(parsed) + amount));
}

function mondayIndex(date: string): number {
  const parsed = parseDateOnly(date);
  if (!parsed) throw new Error("invalid_goal_calendar_date");
  // 1970-01-01 was Thursday, which is index 3 when Monday is zero.
  return ((daysFromCivil(parsed) + 3) % 7 + 7) % 7;
}

export function isValidIanaTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.trim() !== timeZone || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function dateOnlyInTimeZone(
  instant: string | Date,
  timeZone: string,
): GoalDateResult<string> {
  if (!isValidIanaTimeZone(timeZone)) {
    return { ok: false, code: "timezone_invalid", message: "Geçerli bir IANA timezone gereklidir." };
  }
  if (typeof instant === "string" && !isValidIsoInstant(instant)) {
    return { ok: false, code: "instant_invalid", message: "Geçerli bir ISO instant gereklidir." };
  }
  const date = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
  if (!Number.isFinite(date.getTime())) {
    return { ok: false, code: "instant_invalid", message: "Geçerli bir ISO instant gereklidir." };
  }
  const parts = new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  const value = `${read("year")}-${read("month")}-${read("day")}`;
  return isValidDateOnly(value)
    ? { ok: true, value }
    : { ok: false, code: "date_invalid", message: "Timezone yerel tarihi çözümlenemedi." };
}

export function validateGoalScheduleRange(schedule: GoalSchedule): GoalDateResult<GoalSchedule> {
  if (!isValidDateOnly(schedule.startsOn)) {
    return { ok: false, code: "date_invalid", message: "startsOn YYYY-MM-DD olmalıdır." };
  }
  if (schedule.endsOn !== undefined && !isValidDateOnly(schedule.endsOn)) {
    return { ok: false, code: "date_invalid", message: "endsOn YYYY-MM-DD olmalıdır." };
  }
  if (schedule.endsOn !== undefined && schedule.endsOn < schedule.startsOn) {
    return { ok: false, code: "date_invalid", message: "endsOn startsOn değerinden önce olamaz." };
  }
  if (schedule.kind !== "one_time" && !isValidIanaTimeZone(schedule.timeZone)) {
    return { ok: false, code: "timezone_invalid", message: "Recurring hedef geçerli IANA timezone taşımalıdır." };
  }
  return { ok: true, value: schedule };
}

function clampPeriod(
  start: string,
  end: string,
  schedule: GoalSchedule,
): GoalPeriodWindow {
  return {
    start: start < schedule.startsOn ? schedule.startsOn : start,
    end: schedule.endsOn && end > schedule.endsOn ? schedule.endsOn : end,
  };
}

export function resolveGoalPeriod(
  schedule: GoalSchedule,
  referenceDate: string,
): GoalDateResult<GoalPeriodWindow | null> {
  const validation = validateGoalScheduleRange(schedule);
  if (!validation.ok) return validation;
  if (!isValidDateOnly(referenceDate)) {
    return { ok: false, code: "date_invalid", message: "referenceDate YYYY-MM-DD olmalıdır." };
  }
  if (referenceDate < schedule.startsOn || (schedule.endsOn && referenceDate > schedule.endsOn)) {
    return { ok: true, value: null };
  }
  if (schedule.kind === "one_time") {
    return { ok: true, value: { start: schedule.startsOn, end: schedule.endsOn } };
  }
  if (schedule.kind === "weekly") {
    const start = addGoalCalendarDays(referenceDate, -mondayIndex(referenceDate));
    return { ok: true, value: clampPeriod(start, addGoalCalendarDays(start, 6), schedule) };
  }
  const parsed = parseDateOnly(referenceDate)!;
  const start = formatDateOnly({ year: parsed.year, month: parsed.month, day: 1 });
  const end = formatDateOnly({
    year: parsed.year,
    month: parsed.month,
    day: daysInMonth(parsed.year, parsed.month),
  });
  return { ok: true, value: clampPeriod(start, end, schedule) };
}

export function isScheduleActiveOn(schedule: GoalSchedule, date: string): GoalDateResult<boolean> {
  const period = resolveGoalPeriod(schedule, date);
  return period.ok ? { ok: true, value: period.value !== null } : period;
}
