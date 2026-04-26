'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { useDriverRatings } from '@/hooks/useDriverRatings'
import type { DriverRating } from '@/types/firestore-collections'

type Period = '7days' | '30days' | 'all'

function StarDisplay({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <MaterialIcon key={s} name="star"
          className={`text-[16px] ${s <= score ? 'text-amber-400' : 'text-slate-600'}`} />
      ))}
    </div>
  )
}

function RatingRow({ rating }: { rating: DriverRating }) {
  const dateStr = (rating.createdAt as unknown as { toDate?: () => Date }).toDate?.()?.toLocaleDateString('fr-CA') ?? '—'
  return (
    <div className="glass-card rounded-2xl border border-white/10 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <StarDisplay score={rating.score} />
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <MaterialIcon name={rating.orderType === 'livraison' ? 'delivery_dining' : 'directions_car'} className="text-[14px]" />
          {dateStr}
        </div>
      </div>
      {rating.comment && <p className="text-sm text-slate-300 italic">&ldquo;{rating.comment}&rdquo;</p>}
    </div>
  )
}

export function EvaluationsTab({ uid, totalRatings, globalRating }: {
  uid: string
  totalRatings?: number
  globalRating?: number
}) {
  const [period, setPeriod] = useState<Period>('all')
  const { ratings, avgScore, loading } = useDriverRatings(uid, period)

  return (
    <div className="space-y-4">
      {/* Résumé global */}
      <div className="glass-card rounded-2xl border border-white/10 p-4 flex items-center gap-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-amber-400">{globalRating?.toFixed(1) ?? avgScore?.toFixed(1) ?? '—'}</p>
          <StarDisplay score={Math.round(globalRating ?? avgScore ?? 0)} />
        </div>
        <div>
          <p className="text-white font-semibold">{totalRatings ?? ratings.length} évaluation{(totalRatings ?? ratings.length) > 1 ? 's' : ''}</p>
          <p className="text-xs text-slate-400">Note globale</p>
        </div>
      </div>

      {/* Filtre période */}
      <div className="flex gap-2">
        {(['7days', '30days', 'all'] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={['flex-1 h-8 rounded-xl text-xs font-medium transition-all',
              period === p ? 'bg-primary text-white' : 'bg-white/5 text-slate-400'].join(' ')}>
            {p === '7days' ? '7 jours' : p === '30days' ? '30 jours' : 'Tout'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : ratings.length === 0 ? (
        <p className="text-slate-500 text-center py-8">Aucune évaluation pour cette période.</p>
      ) : (
        <div className="space-y-3">
          {ratings.map((r) => <RatingRow key={r.ratingId} rating={r} />)}
        </div>
      )}
    </div>
  )
}
