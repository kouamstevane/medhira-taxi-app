const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCalendarDate(value: string): Date {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new Error('Invalid calendar date');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('Invalid calendar date');
  }
  return date;
}

function formatCalendarDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function validateWeekdays(weekdays: readonly number[]): void {
  if (weekdays.length === 0 || weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
    throw new Error('Invalid weekdays');
  }
  if (new Set(weekdays).size !== weekdays.length) throw new Error('Duplicate weekdays');
}

export function getPeriodEndDateExclusive(startDate: string): string {
  const date = parseCalendarDate(startDate);
  date.setUTCDate(date.getUTCDate() + 30);
  return formatCalendarDate(date);
}

export function countWeekdayOccurrences(
  startDate: string,
  periodEndDateExclusive: string,
  weekdays: readonly number[],
): number {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(periodEndDateExclusive);
  validateWeekdays(weekdays);
  if (end.getTime() <= start.getTime()) throw new Error('Period end must be after period start');

  const selectedWeekdays = new Set(weekdays);
  let occurrences = 0;
  for (const date = new Date(start); date.getTime() < end.getTime(); date.setUTCDate(date.getUTCDate() + 1)) {
    if (selectedWeekdays.has(date.getUTCDay())) occurrences += 1;
  }
  return occurrences;
}
