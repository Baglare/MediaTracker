import {
  getReleaseEventCalendarDate,
  selectReleaseEventsForMonth,
  sortReleaseEvents,
  type ReleaseCalendarSelectorOptions,
  type ReleaseEvent,
} from "@/features/calendar/domain/release-calendar";

export const RELEASE_CALENDAR_HORIZON_DAYS = 90;
export const RELEASE_MONTH_EVENT_LIMIT = 3;
export const RELEASE_CALENDAR_FIRST_MONTH = "0001-01";
export const RELEASE_CALENDAR_LAST_MONTH = "9999-12";

interface CivilDateParts {
  year: number;
  month: number;
  day: number;
}

export interface ReleaseMonthDay {
  date: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  inHorizon: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: ReleaseEvent[];
  visibleEvents: ReleaseEvent[];
  overflowCount: number;
}

export interface ReleaseMonthGrid {
  month: string;
  weeks: ReleaseMonthDay[][];
  days: ReleaseMonthDay[];
}

function parseDate(value: string): CivilDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function parseMonth(value: string): Pick<CivilDateParts, "year" | "month"> | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function formatDate(parts: CivilDateParts): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function addReleaseCalendarDays(value: string, amount: number): string {
  const parsed = parseDate(value);
  if (!parsed || !Number.isInteger(amount)) {
    throw new RangeError("date ve amount geçerli olmalıdır.");
  }
  const result = { ...parsed };
  const direction = amount < 0 ? -1 : 1;
  for (let index = 0; index < Math.abs(amount); index += 1) {
    result.day += direction;
    if (result.day > daysInMonth(result.year, result.month)) {
      result.day = 1;
      result.month += 1;
      if (result.month > 12) {
        result.month = 1;
        result.year += 1;
      }
    } else if (result.day < 1) {
      result.month -= 1;
      if (result.month < 1) {
        result.month = 12;
        result.year -= 1;
      }
      result.day = daysInMonth(result.year, result.month);
    }
  }
  return formatDate(result);
}

function mondayIndex(year: number, month: number, day: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const adjustedYear = month < 3 ? year - 1 : year;
  const sundayIndex = (
    adjustedYear
    + Math.floor(adjustedYear / 4)
    - Math.floor(adjustedYear / 100)
    + Math.floor(adjustedYear / 400)
    + offsets[month - 1]
    + day
  ) % 7;
  return (sundayIndex + 6) % 7;
}

export function shiftReleaseMonth(month: string, amount: number): string {
  const parsed = parseMonth(month);
  if (!parsed || !Number.isInteger(amount)) {
    throw new RangeError("month ve amount geçerli olmalıdır.");
  }
  const index = parsed.year * 12 + parsed.month - 1 + amount;
  const year = Math.floor(index / 12);
  const nextMonth = ((index % 12) + 12) % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function releaseMonthNavigationBounds(today: string): {
  firstMonth: string;
  lastMonth: string;
  horizonDate: string;
} {
  if (!parseDate(today)) throw new RangeError("today geçerli YYYY-MM-DD olmalıdır.");
  const horizonDate = addReleaseCalendarDays(today, RELEASE_CALENDAR_HORIZON_DAYS);
  return {
    firstMonth: RELEASE_CALENDAR_FIRST_MONTH,
    lastMonth: RELEASE_CALENDAR_LAST_MONTH,
    horizonDate,
  };
}

export function canNavigateReleaseMonth(
  currentMonth: string,
  direction: -1 | 1,
  today: string,
): boolean {
  const bounds = releaseMonthNavigationBounds(today);
  if (direction === -1 && currentMonth <= bounds.firstMonth) return false;
  if (direction === 1 && currentMonth >= bounds.lastMonth) return false;
  const target = shiftReleaseMonth(currentMonth, direction);
  return target >= bounds.firstMonth && target <= bounds.lastMonth;
}

export function buildReleaseMonthGrid(input: {
  events: readonly ReleaseEvent[];
  month: string;
  today: string;
  selectedDate?: string;
  options?: ReleaseCalendarSelectorOptions;
}): ReleaseMonthGrid {
  const parsedMonth = parseMonth(input.month);
  if (!parsedMonth || !parseDate(input.today)) {
    throw new RangeError("month ve today geçerli olmalıdır.");
  }
  const { horizonDate } = releaseMonthNavigationBounds(input.today);
  const firstDate = `${input.month}-01`;
  const leadingDays = mondayIndex(parsedMonth.year, parsedMonth.month, 1);
  const gridStart = addReleaseCalendarDays(firstDate, -leadingDays);
  const cellCount = Math.ceil(
    (leadingDays + daysInMonth(parsedMonth.year, parsedMonth.month)) / 7,
  ) * 7;
  const monthEvents = selectReleaseEventsForMonth(
    input.events,
    input.month,
    input.options,
  );
  const eventsByDate = new Map<string, ReleaseEvent[]>();
  for (const event of monthEvents) {
    const date = getReleaseEventCalendarDate(event, input.options);
    if (!date) continue;
    if (event.origin.kind === "provider" && (date < input.today || date > horizonDate)) continue;
    const current = eventsByDate.get(date) ?? [];
    current.push(event);
    eventsByDate.set(date, current);
  }
  const days = Array.from({ length: cellCount }, (_, index): ReleaseMonthDay => {
    const date = addReleaseCalendarDays(gridStart, index);
    const events = sortReleaseEvents(eventsByDate.get(date) ?? []);
    return {
      date,
      dayNumber: Number(date.slice(8, 10)),
      inCurrentMonth: date.slice(0, 7) === input.month,
      inHorizon: date >= input.today && date <= horizonDate,
      isToday: date === input.today,
      isSelected: date === input.selectedDate,
      events,
      visibleEvents: events.slice(0, RELEASE_MONTH_EVENT_LIMIT),
      overflowCount: Math.max(0, events.length - RELEASE_MONTH_EVENT_LIMIT),
    };
  });
  return {
    month: input.month,
    days,
    weeks: Array.from(
      { length: days.length / 7 },
      (_, index) => days.slice(index * 7, index * 7 + 7),
    ),
  };
}
