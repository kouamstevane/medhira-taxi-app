'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/config/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav'
import { useDriverStore } from '@/store/driverStore'
import { useDriverActivity, type ActivityRecord } from '@/hooks/useDriverActivity'
import { EvaluationsTab } from './components/EvaluationsTab'
import { formatCurrencyWithCode } from '@/utils/format'
import { CURRENCY_CODE } from '@/utils/constants'

type Tab = 'historique' | 'gains' | 'evaluations'

function RecordItem({ record }: { record: ActivityRecord }) {
  return (
    <div className="glass-card rounded-2xl border border-white/10 p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${record.type === 'taxi' ? 'bg-primary/10' : 'bg-amber-500/10'}`}>
          <MaterialIcon name={record.type === 'taxi' ? 'directions_car' : 'delivery_dining'}
            className={record.type === 'taxi' ? 'text-primary text-[20px]' : 'text-amber-400 text-[20px]'} />
        </div>
        <div>
          <p className="text-sm font-medium text-white truncate max-w-[180px]">{record.description}</p>
          <p className="text-xs text-slate-500">{record.date}</p>
        </div>
      </div>
      <p className="font-bold text-white shrink-0">{formatCurrencyWithCode(record.amount, CURRENCY_CODE)}</p>
    </div>
  )
}

export default function DriverActivitePage() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('historique')
  const { driver } = useDriverStore()
  const { records, totals, loading } = useDriverActivity(uid ?? '')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/driver/login'); return }
      setUid(user.uid)
    })
    return () => unsub()
  }, [router])

  const today = new Date().toDateString()
  const todayTotal = records.filter(r => new Date(r.date).toDateString() === today)
    .reduce((s, r) => s + r.amount, 0)

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'historique', label: 'Historique', icon: 'history' },
    { key: 'gains',      label: 'Gains',      icon: 'payments' },
    { key: 'evaluations', label: 'Évaluations', icon: 'star' },
  ]

  return (
    <div className="min-h-screen bg-background text-slate-100 pb-28">
      <div className="max-w-lg mx-auto px-4 pt-8">
        <h1 className="text-2xl font-bold text-white mb-6">Activité</h1>

        {/* Onglets — 3 onglets */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-2xl p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={['flex-1 h-10 rounded-xl text-xs font-medium capitalize transition-all flex items-center justify-center gap-1',
                tab === t.key ? 'bg-primary text-white' : 'text-slate-400'].join(' ')}>
              <MaterialIcon name={t.icon} className="text-[14px]" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'evaluations' && uid ? (
          <EvaluationsTab
            uid={uid}
            totalRatings={driver?.ratingsCount}
            globalRating={driver?.rating}
          />
        ) : loading ? (
          <div className="flex justify-center mt-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'historique' ? (
          <div className="space-y-3">
            {records.length === 0 ? (
              <p className="text-slate-500 text-center mt-12">Aucune activité pour l&apos;instant.</p>
            ) : records.map((r) => <RecordItem key={r.id} record={r} />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl border border-white/10 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Aujourd&apos;hui</p>
                  <p className="text-2xl font-bold text-white">{formatCurrencyWithCode(todayTotal, CURRENCY_CODE)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total cumulé</p>
                  <p className="text-xl font-bold text-primary">{formatCurrencyWithCode(totals.total, CURRENCY_CODE)}</p>
                </div>
              </div>
              {totals.taxi > 0 && totals.livraison > 0 && (
                <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <MaterialIcon name="directions_car" className="text-primary text-[20px]" />
                    <p className="text-xs text-slate-400 mt-1">Taxi</p>
                    <p className="font-bold text-white">{formatCurrencyWithCode(totals.taxi, CURRENCY_CODE)}</p>
                  </div>
                  <div className="text-center">
                    <MaterialIcon name="delivery_dining" className="text-amber-400 text-[20px]" />
                    <p className="text-xs text-slate-400 mt-1">Livraison</p>
                    <p className="font-bold text-white">{formatCurrencyWithCode(totals.livraison, CURRENCY_CODE)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <BottomNav items={driverNavItems} />
    </div>
  )
}
