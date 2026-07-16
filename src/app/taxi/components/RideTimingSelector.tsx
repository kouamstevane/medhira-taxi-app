'use client';

type RideTimingMode = 'immediate' | 'scheduled';

interface RideTimingSelectorProps {
  mode: RideTimingMode;
  scheduledDate: string;
  scheduledTime: string;
  onModeChange: (mode: RideTimingMode) => void;
  onScheduledDateChange: (value: string) => void;
  onScheduledTimeChange: (value: string) => void;
}

export const RideTimingSelector = ({
  mode,
  scheduledDate,
  scheduledTime,
  onModeChange,
  onScheduledDateChange,
  onScheduledTimeChange,
}: RideTimingSelectorProps) => {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-white mb-1">Quand souhaitez-vous partir ?</p>
        <p className="text-[11px] text-slate-400 mb-2">
          Choisissez un départ immédiat ou programmez la course pour plus tard.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1.5 border border-white/[0.06]">
          <button
            type="button"
            onClick={() => onModeChange('immediate')}
            aria-pressed={mode === 'immediate'}
            aria-label="Maintenant"
            className={`min-h-[64px] rounded-xl px-3 py-2.5 text-left transition-all ${
              mode === 'immediate'
                ? 'bg-primary text-white shadow-lg shadow-primary/20 ring-1 ring-primary/40'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <span className="block text-[13px] font-semibold leading-tight">Maintenant</span>
            <span className={`block mt-0.5 text-[11px] leading-snug ${mode === 'immediate' ? 'text-white/80' : 'text-slate-400'}`}>
              On cherche un chauffeur dès la confirmation.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange('scheduled')}
            aria-pressed={mode === 'scheduled'}
            aria-label="Programmer"
            className={`min-h-[64px] rounded-xl px-3 py-2.5 text-left transition-all ${
              mode === 'scheduled'
                ? 'bg-primary text-white shadow-lg shadow-primary/20 ring-1 ring-primary/40'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <span className="block text-[13px] font-semibold leading-tight">Programmer</span>
            <span className={`block mt-0.5 text-[11px] leading-snug ${mode === 'scheduled' ? 'text-white/80' : 'text-slate-400'}`}>
              Vous choisissez la date et l&apos;heure.
            </span>
          </button>
        </div>
      </div>

      {mode === 'scheduled' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
          <div>
            <label htmlFor="scheduled-date" className="block text-xs font-medium text-white mb-1.5">
              Date de départ
            </label>
            <input
              id="scheduled-date"
              type="date"
              value={scheduledDate}
              onChange={(event) => onScheduledDateChange(event.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-[#0F0F0F] px-3 py-2.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label htmlFor="scheduled-time" className="block text-xs font-medium text-white mb-1.5">
              Heure de départ
            </label>
            <input
              id="scheduled-time"
              type="time"
              value={scheduledTime}
              onChange={(event) => onScheduledTimeChange(event.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-[#0F0F0F] px-3 py-2.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <p className="sm:col-span-2 text-[11px] leading-relaxed text-slate-400">
            Le chauffeur sera recherché à l&apos;heure choisie. Vous pourrez modifier ou annuler avant le départ.
          </p>
        </div>
      )}
    </section>
  );
};

export type { RideTimingMode };
