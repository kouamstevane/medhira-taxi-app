'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { cn } from '@/lib/utils';
import { driverFieldClassName, driverPrimaryButtonClassName, driverSecondaryButtonClassName } from '@/app/driver/register/components/driverOnboardingStyles';
import { RESTAURANT_DAYS } from '@/utils/restaurant-constants';
import type { Step4Data } from '@/hooks/useRestaurantRegistration';
import { useTranslation } from '@/hooks/useTranslation';

interface Step4HoursProps {
  onSubmit: (data: Step4Data) => Promise<void>;
  onBack: () => void;
  initialData?: Partial<Step4Data>;
  loading: boolean;
  onChange?: (hours: Step4Data['openingHours']) => void;
  error?: string | null;
}

const DEFAULT_HOURS: Step4Data['openingHours'] = Object.fromEntries(
  RESTAURANT_DAYS.map(({ key }) => [key, { open: '09:00', close: '22:00', closed: key === 'sunday' }])
) as Step4Data['openingHours'];

export function Step4Hours({ onSubmit, onBack, initialData, loading, onChange, error: submissionError }: Step4HoursProps) {
  const { t } = useTranslation('restaurant');
  const [hours, setHours] = useState<Step4Data['openingHours']>(
    initialData?.openingHours || DEFAULT_HOURS
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const error = submissionError || validationError;

  useEffect(() => {
    const errorElement = errorRef.current;
    if (!errorElement || !error) return;

    errorElement.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    errorElement.focus({ preventScroll: true });
  }, [error]);

  useEffect(() => {
    if (!validationError) return;
    const timer = setTimeout(() => setValidationError(null), 5000);
    return () => clearTimeout(timer);
  }, [validationError]);

  const updateDay = (key: string, field: string, value: string | boolean) => {
    const next = {
      ...hours,
      [key]: { ...hours[key], [field]: value },
    };
    setHours(next);
    onChange?.(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const openDays = Object.entries(hours).filter(([, v]) => !v.closed);
    if (openDays.length === 0) {
      const msg = t('atLeastOneDayOpenError');
      setValidationError(msg);
      return;
    }

    await onSubmit({ openingHours: hours });
  };

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">{t('step4Title')}</h2>
        <p className="text-gray-400 mb-6">{t('step4Subtitle')}</p>

        {error && (
          <div
            ref={errorRef}
            className="mb-4 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center justify-between gap-2 transition-all duration-300 animate-in fade-in"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            tabIndex={-1}
          >
            <div className="flex items-center gap-2 min-w-0">
              <MaterialIcon name="error_outline" size="sm" className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setValidationError(null)}
              className="p-1 rounded-lg text-red-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              aria-label={t('closeAlert')}
            >
              <MaterialIcon name="close" size="sm" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {RESTAURANT_DAYS.map(({ key, label }) => {
            const day = hours[key];
            const dayLabel = t(`days.${key}` as never) || label;
            return (
              <div key={key} className="glass-card p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{dayLabel}</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-400">{t('closedDay')}</span>
                    <input
                      type="checkbox"
                      checked={day.closed}
                      onChange={(e) => updateDay(key, 'closed', e.target.checked)}
                      className="w-4 h-4 rounded"
                      aria-label={t('dayClosedLabel', { label: dayLabel })}
                    />
                  </label>
                </div>
                {!day.closed && (
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={day.open}
                      onChange={(e) => updateDay(key, 'open', e.target.value)}
                      className={cn(driverFieldClassName, 'min-w-0 text-sm')}
                      aria-label={t('dayOpenLabel', { label: dayLabel })}
                    />
                    <span className="text-gray-400 self-center">—</span>
                    <input
                      type="time"
                      value={day.close}
                      onChange={(e) => updateDay(key, 'close', e.target.value)}
                      className={cn(driverFieldClassName, 'min-w-0 text-sm')}
                      aria-label={t('dayCloseLabel', { label: dayLabel })}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onBack} className={cn(driverSecondaryButtonClassName, 'flex-1')} aria-label={t('back')}>
              {t('back')}
            </button>
            <button type="submit" disabled={loading} className={cn(driverPrimaryButtonClassName, 'flex-[2] gap-2')} aria-label={t('submitFile')}>
              {loading ? <span className="animate-spin">⏳</span> : <MaterialIcon name="send" />}
              {loading ? t('submittingFile') : t('submitMyFile')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
