// src/app/driver/documents/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav'
import { useDocumentStatus } from '@/hooks/useDocumentStatus'
import type { DocStatus } from '@/hooks/useDocumentStatus'

function statusColor(status: DocStatus): string {
  switch (status) {
    case 'approved': return 'text-green-400'
    case 'rejected': return 'text-red-400'
    case 'pending': return 'text-amber-400'
    default: return 'text-slate-500'
  }
}

function statusIcon(status: DocStatus): string {
  switch (status) {
    case 'approved': return 'check_circle'
    case 'rejected': return 'cancel'
    case 'pending': return 'hourglass_empty'
    default: return 'upload_file'
  }
}

function statusLabel(status: DocStatus): string {
  switch (status) {
    case 'approved': return 'Approuvé'
    case 'rejected': return 'Rejeté'
    case 'pending': return 'En cours de vérification'
    default: return 'Non soumis'
  }
}

export default function DriverDocumentsPage() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const { documents, loading, globalStatus } = useDocumentStatus(uid)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/driver/login'); return }
      setUid(user.uid)
    })
    return () => unsub()
  }, [router])

  return (
    <div className="min-h-screen bg-background text-slate-100 pb-28">
      <div className="max-w-lg mx-auto px-4 pt-8">
        <h1 className="text-2xl font-bold text-white mb-2">Mes documents</h1>

        {globalStatus === 'all_approved' && (
          <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-2">
            <MaterialIcon name="verified" className="text-green-400 text-[20px]" />
            <p className="text-sm text-green-400">Tous les documents sont approuvés</p>
          </div>
        )}
        {globalStatus === 'has_rejected' && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2">
            <MaterialIcon name="error" className="text-red-400 text-[20px]" />
            <p className="text-sm text-red-400">Certains documents ont été rejetés — re-téléversez-les</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center mt-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <button
                key={doc.key}
                onClick={() => router.push(`/driver/documents/${doc.key}`)}
                className="glass-card w-full p-4 rounded-2xl border border-white/10 flex items-center justify-between hover:border-white/20 transition-all"
              >
                <div className="flex items-center gap-3">
                  <MaterialIcon name={statusIcon(doc.status)} className={`text-[24px] ${statusColor(doc.status)}`} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">{doc.label}</p>
                    <p className={`text-xs ${statusColor(doc.status)}`}>{statusLabel(doc.status)}</p>
                    {doc.rejectionReason && (
                      <p className="text-xs text-red-400 mt-0.5">{doc.rejectionReason}</p>
                    )}
                  </div>
                </div>
                {(doc.status === 'rejected' || doc.status === 'not_submitted') && (
                  <MaterialIcon name="chevron_right" className="text-slate-500 text-[20px]" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <BottomNav items={driverNavItems} />
    </div>
  )
}
