// src/app/driver/documents/page.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav'
import { useDocumentStatus } from '@/hooks/useDocumentStatus'
import type { DocStatus } from '@/hooks/useDocumentStatus'

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
  const [filter, setFilter] = useState<Filter>('all')
  const { documents, loading } = useDocumentStatus(uid)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/driver/login'); return }
      setUid(user.uid)
    })
    return () => unsub()
  }, [router])

  const counts = useMemo(() => ({
    all: documents.length,
    not_submitted: documents.filter(d => d.status === 'not_submitted').length,
    pending: documents.filter(d => d.status === 'pending').length,
    approved: documents.filter(d => d.status === 'approved').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
  }), [documents])

  const filtered = useMemo(
    () => (filter === 'all' ? documents : documents.filter(d => d.status === filter)),
    [documents, filter]
  )

  const progress = documents.length === 0 ? 0 : counts.approved / documents.length
  const dashOffset = 2 * Math.PI * 42 * (1 - progress)

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'Tous' },
    { key: 'not_submitted', label: 'À téléverser' },
    { key: 'pending', label: 'En attente' },
    { key: 'approved', label: 'Approuvés' },
    { key: 'rejected', label: 'Rejetés' },
  ]

  return (
    <div className="min-h-screen bg-background text-slate-100 pb-28 font-sans antialiased">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-xl hover:bg-white/5 transition">
            <MaterialIcon name="arrow_back" className="text-primary text-[24px]" />
          </button>
          <h1 className="text-lg font-bold text-primary">Mes documents</h1>
          <button className="p-2 -mr-2 rounded-xl hover:bg-white/5 transition" aria-label="Aide">
            <MaterialIcon name="help_outline" className="text-primary text-[24px]" />
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-2">
        {/* Progression globale */}
        <div className="glass-card rounded-2xl p-5 flex items-center gap-5 mb-6 border border-white/5">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
              <circle
                cx="48" cy="48" r="42" fill="none"
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
              <span className="text-white font-bold text-lg">
                {counts.approved}/{counts.all || 10}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-xl leading-tight">Vérification en cours</h2>
            <p className="text-primary text-sm font-medium mt-1">
              {counts.approved} document{counts.approved > 1 ? 's' : ''} approuvé{counts.approved > 1 ? 's' : ''} sur {counts.all || 10}
            </p>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              Téléversez tous les documents requis pour activer votre compte chauffeur
            </p>
          </div>
        </div>

        {/* Filtres */}
        <div className="-mx-4 px-4 mb-5 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 w-max">
            {filters.map(({ key, label }) => {
              const active = filter === key
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-4 h-10 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
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

        {/* Liste */}
        {loading ? (
          <div className="flex justify-center mt-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            Aucun document dans cette catégorie
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => {
              const v = statusVisuals(doc.status)
              const showUploadBtn = doc.status === 'not_submitted' || doc.status === 'rejected'
              return (
                <button
                  key={doc.key}
                  onClick={() => router.push(`/driver/documents/${doc.key}`)}
                  className="glass-card w-full p-4 rounded-2xl flex items-center gap-3 hover:bg-white/[0.03] active:scale-[0.99] transition-all text-left"
                >
                  <div className={`w-12 h-12 rounded-xl ${v.bg} flex items-center justify-center flex-shrink-0`}>
                    <MaterialIcon name={v.icon} className={`text-[24px] ${v.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[15px] leading-tight">{doc.label}</p>
                    <p className={`text-[11px] font-bold mt-1 tracking-wide ${v.color}`}>{v.text}</p>
                    {doc.rejectionReason && (
                      <p className="text-xs text-red-400/80 mt-1 line-clamp-1">{doc.rejectionReason}</p>
                    )}
                  </div>
                  {showUploadBtn ? (
                    <span className="bg-gradient-to-r from-primary to-[#ffae33] text-black text-xs font-bold px-4 h-8 rounded-full flex items-center flex-shrink-0">
                      TÉLÉVERSER
                    </span>
                  ) : (
                    <MaterialIcon name="chevron_right" className="text-slate-500 text-[20px] flex-shrink-0" />
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
