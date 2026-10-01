'use client';

import type { PersonalDriverWeekday } from '@/types/personal-driver';
import { useTranslation } from '@/hooks/useTranslation';

interface WeekdaySelectorProps {
  allowedWeekdays: PersonalDriverWeekday[];
  selectedWeekdays: PersonalDriverWeekday[];
  onChange: (weekdays: PersonalDriverWeekday[]) => void;
  errorId?: string;
  hasError?: boolean;
}

const weekdayOrder: PersonalDriverWeekday[] = [1, 2, 3, 4, 5, 6, 0];

export function WeekdaySelector({ allowedWeekdays, selectedWeekdays, onChange, errorId, hasError = false }: WeekdaySelectorProps) {
  const { t } = useTranslation('personalDriver');
  const excludesWeekend = !allowedWeekdays.includes(6) || !allowedWeekdays.includes(0);

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
      <legend className="mb-3 text-sm font-semibold text-white">{t('days')}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {weekdayOrder.map((value) => {
          const isAllowed = allowedWeekdays.includes(value);
          const isSelected = selectedWeekdays.includes(value);
          const label = t(`weekday${value}` as 'weekday0' | 'weekday1' | 'weekday2' | 'weekday3' | 'weekday4' | 'weekday5' | 'weekday6');

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
      {excludesWeekend && (
        <p className="mt-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs leading-5 text-slate-300">
          {t('basicWeekdayNotice')}
        </p>
      )}
    </fieldset>
  );
}
