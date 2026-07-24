'use client';

import type { PersonalDriverWeekday } from '@/types/personal-driver';

interface WeekdaySelectorProps {
  allowedWeekdays: PersonalDriverWeekday[];
  selectedWeekdays: PersonalDriverWeekday[];
  onChange: (weekdays: PersonalDriverWeekday[]) => void;
  errorId?: string;
  hasError?: boolean;
}

const weekdays: Array<{ value: PersonalDriverWeekday; label: string }> = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];

export function WeekdaySelector({ allowedWeekdays, selectedWeekdays, onChange, errorId, hasError = false }: WeekdaySelectorProps) {
  const toggleWeekday = (weekday: PersonalDriverWeekday) => {
    if (!allowedWeekdays.includes(weekday)) {
      return;
    }

    onChange(
      selectedWeekdays.includes(weekday)
        ? selectedWeekdays.filter((selected) => selected !== weekday)
        : [...selectedWeekdays, weekday].sort((left, right) => left - right) as PersonalDriverWeekday[],
    );
  };

  return (
    <fieldset
      aria-describedby={hasError ? errorId : undefined}
      aria-invalid={hasError}
    >
      <legend className="mb-3 text-sm font-semibold text-white">Jours</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {weekdays.map(({ value, label }) => {
          const isAllowed = allowedWeekdays.includes(value);
          const isSelected = selectedWeekdays.includes(value);

          return (
            <label
              key={value}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
                isAllowed
                  ? 'cursor-pointer border-white/10 bg-white/5 text-slate-200'
                  : 'cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={!isAllowed}
                onChange={() => toggleWeekday(value)}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
