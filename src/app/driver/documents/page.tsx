'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav'
import { useDocumentStatus } from '@/hooks/useDocumentStatus'
import type { DocStatus } from '@/hooks/useDocumentStatus'
import { getDriverDocumentsSummary } from './documents-summary'

type Filter = 'all' | 'not_submitted' | 'pending' | 'approved' | 'rejected'

function statusVisuals(status: DocStatus) {
  switch (status) {
    case 'approved':
      return { icon: 'check_circle', text: 'APPROUVÉ', color: 'text-green-400', bg: 'bg-green-500/10' }
    case 'pending':
      return { icon: 'hourglass_empty', text: 'EN COURS DE VÉRIFICATION', color: 'text-amber-400', bg: 'bg-amber-500/10' }
    case 'rejected':
      return { icon: 'cancel', text: 'REJETÉ', color: 'text-red-400', bg: 'bg-red-500/10' }
    default:
      return { icon: 'upload_file', text: 'NON SOUMIS', color: 'text-slate-400', bg: 'bg-white/5' }
  }
}

export default function DriverDocumentsPage() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const { documents, loading, error, globalStatus } = useDocumentStatus(uid)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAuthResolved(true)
        router.push('/driver/login')
        return
      }

      setUid(user.uid)
      setAuthResolved(true)
    })

    return () => unsubscribe()
  }, [router])

  const counts = useMemo(() => ({
    all: documents.length,
    not_submitted: documents.filter((document) => document.status === 'not_submitted').length,
    pending: documents.filter((document) => document.status === 'pending').length,
    approved: documents.filter((document) => document.status === 'approved').length,
    rejected: documents.filter((document) => document.status === 'rejected').length,
  }), [documents])

  const filteredDocuments = useMemo(
    () => (filter === 'all' ? documents : documents.filter((document) => document.status === filter)),
    [documents, filter],
  )

  const summary = useMemo(() => getDriverDocumentsSummary({
    approved: counts.approved,
    rejected: counts.rejected,
    pending: counts.pending,
    notSubmitted: counts.not_submitted,
    total: counts.all || documents.length || 10,
    globalStatus,
  }), [counts, documents.length, globalStatus])

  const progress = documents.length === 0 ? 0 : counts.approved / documents.length
  const dashOffset = 2 * Math.PI * 42 * (1 - progress)
  const isPageLoading = !authResolved || loading

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'Tous' },
    { key: 'not_submitted', label: 'À téléverser' },
    { key: 'pending', label: 'En attente' },
    { key: 'approved', label: 'Approuvés' },
    { key: 'rejected', label: 'Rejetés' },
  ]

  return (
    <div className="min-h-screen bg-background pb-28 font-sans text-slate-100 antialiased">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <button onClick={() => router.back()} className="rounded-xl p-2 -ml-2 transition hover:bg-white/5">
            <MaterialIcon name="arrow_back" className="text-[24px] text-primary" />
          </button>
          <h1 className="text-lg font-bold text-primary">Mes documents</h1>
          <button className="rounded-xl p-2 -mr-2 transition hover:bg-white/5" aria-label="Aide">
            <MaterialIcon name="help_outline" className="text-[24px] text-primary" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-2">
        {isPageLoading ? (
          <div className="glass-card mb-6 flex min-h-48 items-center justify-center rounded-2xl border border-white/5 p-5">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="glass-card mb-6 flex items-center gap-5 rounded-2xl border border-white/5 p-5">
            <div className="relative h-24 w-24 flex-shrink-0">
              <svg className="-rotate-90 h-24 w-24" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  fill="none"
                  stroke="url(#docProgress)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
                <defs>
                  <linearGradient id="docProgress" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f29200" />
                    <stop offset="100%" stopColor="#ffb86d" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white">
                  {counts.approved}/{counts.all || 10}
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold leading-tight text-white">{summary.title}</h2>
              <p className="mt-1 text-sm font-medium text-primary">{summary.subtitle}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{summary.helper}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!isPageLoading && (
          <div className="-mx-4 mb-5 overflow-x-auto px-4 no-scrollbar">
            <div className="flex w-max gap-2">
              {filters.map(({ key, label }) => {
                const active = filter === key

                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`h-10 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-all ${
                      active
                        ? 'bg-gradient-to-r from-primary to-[#ffae33] text-black'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {label} ({counts[key]})
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {isPageLoading ? (
          <div className="mt-16 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Aucun document dans cette catégorie
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDocuments.map((document) => {
              const visual = statusVisuals(document.status)
              const showUploadButton = document.status === 'not_submitted' || document.status === 'rejected'

              return (
                <button
                  key={document.key}
                  onClick={() => router.push(`/driver/documents/${document.key}`)}
                  className="glass-card flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-all hover:bg-white/[0.03] active:scale-[0.99]"
                >
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${visual.bg}`}>
                    <MaterialIcon name={visual.icon} className={`text-[24px] ${visual.color}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-tight text-white">{document.label}</p>
                    <p className={`mt-1 text-[11px] font-bold tracking-wide ${visual.color}`}>{visual.text}</p>
                    {document.rejectionReason && (
                      <p className="mt-1 line-clamp-1 text-xs text-red-400/80">{document.rejectionReason}</p>
                    )}
                  </div>

                  {showUploadButton ? (
                    <span className="flex h-8 flex-shrink-0 items-center rounded-full bg-gradient-to-r from-primary to-[#ffae33] px-4 text-xs font-bold text-black">
                      TÉLÉVERSER
                    </span>
                  ) : (
                    <MaterialIcon name="chevron_right" className="flex-shrink-0 text-[20px] text-slate-500" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav items={driverNavItems} />
    </div>
  )
}
