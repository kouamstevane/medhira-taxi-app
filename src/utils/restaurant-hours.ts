import { RESTAURANT_DAYS, type RestaurantDayKey } from '@/utils/restaurant-constants';

export type RestaurantOpeningHour = {
  open: string;
  close: string;
  closed: boolean;
};

export type RestaurantOpeningHours = Record<RestaurantDayKey, RestaurantOpeningHour>;

type StoredRestaurantOpeningHour = {
  open: string;
  close: string;
  closed?: boolean;
} | null;

const DEFAULT_OPENING_HOURS: RestaurantOpeningHours = Object.fromEntries(
  RESTAURANT_DAYS.map(({ key }) => [key, { open: '09:00', close: '22:00', closed: key === 'sunday' }]),
) as RestaurantOpeningHours;

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_INDEX_TO_KEY: RestaurantDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function normalizeOpeningHours(
  value?: Record<string, StoredRestaurantOpeningHour>,
): RestaurantOpeningHours {
  return Object.fromEntries(
    RESTAURANT_DAYS.map(({ key }) => {
      const storedDay = value?.[key];
      const defaultDay = DEFAULT_OPENING_HOURS[key];

      if (storedDay === undefined) {
        return [key, { ...defaultDay }];
      }

      if (storedDay === null) {
        return [key, { ...defaultDay, closed: true }];
      }

      return [key, {
        open: storedDay.open || defaultDay.open,
        close: storedDay.close || defaultDay.close,
        closed: storedDay.closed === true,
      }];
    }),
  ) as RestaurantOpeningHours;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function validateOpeningHours(hours: RestaurantOpeningHours): string | null {
  const openDays = RESTAURANT_DAYS.filter(({ key }) => !hours[key].closed);

  if (openDays.length === 0) {
    return 'Au moins un jour doit être ouvert.';
  }

  for (const { key, label } of openDays) {
    const day = hours[key];

    if (!TIME_PATTERN.test(day.open) || !TIME_PATTERN.test(day.close)) {
      return `Renseignez des horaires valides pour ${label.toLowerCase()}.`;
    }

    if (timeToMinutes(day.close) <= timeToMinutes(day.open)) {
      return `L’heure de fermeture doit être après l’heure d’ouverture pour ${label.toLowerCase()}.`;
    }
  }

  return null;
}

export function getOpeningHoursForDate(
  hours: RestaurantOpeningHours,
  date: Date,
): RestaurantOpeningHour & { key: RestaurantDayKey; label: string } {
  const key = DAY_INDEX_TO_KEY[date.getDay()];
  const label = RESTAURANT_DAYS.find((day) => day.key === key)?.label ?? key;

  return { ...hours[key], key, label };
}
