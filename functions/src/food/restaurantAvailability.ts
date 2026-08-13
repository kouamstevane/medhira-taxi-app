type OpeningHour = {
  open: string;
  close: string;
  closed?: boolean;
} | null;

type RestaurantAvailabilityData = {
  isOpen?: boolean;
  openingHours?: Record<string, OpeningHour>;
};

const DEFAULT_OPENING_HOURS: Record<string, { open: string; close: string; closed: boolean }> = {
  monday: { open: '09:00', close: '22:00', closed: false },
  tuesday: { open: '09:00', close: '22:00', closed: false },
  wednesday: { open: '09:00', close: '22:00', closed: false },
  thursday: { open: '09:00', close: '22:00', closed: false },
  friday: { open: '09:00', close: '22:00', closed: false },
  saturday: { open: '09:00', close: '22:00', closed: false },
  sunday: { open: '09:00', close: '22:00', closed: true },
};

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function isRestaurantOpenForOrdering(
  restaurant: RestaurantAvailabilityData,
  date: Date,
): boolean {
  if (!restaurant.openingHours) {
    return restaurant.isOpen !== false;
  }

  const key = DAY_KEYS[date.getDay()];
  const configured = restaurant.openingHours[key];
  const defaultHours = DEFAULT_OPENING_HOURS[key];
  const today = configured === null
    ? { ...defaultHours, closed: true }
    : {
        open: configured?.open || defaultHours.open,
        close: configured?.close || defaultHours.close,
        closed: configured?.closed === true,
      };

  if (today.closed || !TIME_PATTERN.test(today.open) || !TIME_PATTERN.test(today.close)) {
    return false;
  }

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  return currentMinutes >= timeToMinutes(today.open) && currentMinutes < timeToMinutes(today.close);
}
