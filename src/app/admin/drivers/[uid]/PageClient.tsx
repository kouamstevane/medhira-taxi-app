'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, auth } from '@/config/firebase'
import { suspendDriver } from '@/services/admin.service'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { DriverCollection } from '@/types/firestore-collections'

const DOC_LABELS: Record<string, string> = {
  photoProfile: 'Photo de profil', permitConduire: 'Permis de conduire',
  casierJudiciaire: 'Casier judiciaire', historiqueConduire: 'Historique chauffeur',
  preuvePermitTravail: 'Permis de travail', plaqueImmatriculation: "Plaque d'immatriculation",
  permitCommercial: 'Permis commercial', plaqueImmatriculationCommerciale: 'Plaque commerciale',
  visiteTechniqueCommerciale: 'Visite technique', certificatVille: 'Certificat ville',
}

export default function AdminDriverDetailPage() {
  const params = useParams()
  const router = useRouter()
  const uid = params.uid as string
  const [driver, setDriver] = useState<DriverCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectModalKey, setRejectModalKey] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const isAdmin = useAdminAuth()

  useEffect(() => {
    if (!isAdmin) return
    const unsub = onSnapshot(doc(db, 'drivers', uid), (snap) => {
      setDriver(snap.exists() ? (snap.data() as DriverCollection) : null)
      setLoading(false)
    })
    return () => unsub()
  }, [uid, isAdmin])

  const manageDriver = async (action: string, documentKey?: string, reason?: string) => {
    setProcessing(action + (documentKey ?? ''))
    try {
      if (action === 'suspend') {
        const adminUid = auth.currentUser?.uid
        if (!adminUid) throw new Error('Non authentifié')
        await suspendDriver(uid, reason || 'Suspension administrative', adminUid)
      } else {
        if (!auth.currentUser) throw new Error('Non authentifié')
        const idToken = await auth.currentUser.getIdToken()
        const body: Record<string, unknown> = { action, driverId: uid }
        if (documentKey) body.documentKey = documentKey
        if (reason) {
          body.reason = reason
          body.documentRejectionReason = reason
        }
        const res = await fetch('/api/admin/manage-driver', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Erreur API')
      }
    } catch (err) {
      console.error('manageDriver error:', err)
      alert(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setProcessing(null)
    }
  }

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!driver) return <div className="min-h-screen bg-background flex items-center justify-center text-slate-400">Driver introuvable</div>

  const documents = driver.documents ?? {}
  const allRequiredApproved = Object.values(documents).every(d => d.status === 'approved')

  return (
    <div className="min-h-screen bg-background text-white p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-white">
            <MaterialIcon name="arrow_back" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{driver.firstName} {driver.lastName}</h1>
            <p className="text-slate-400 text-sm">{driver.email} — {driver.driverType ?? 'chauffeur'}</p>
          </div>
          <span className={`ml-auto px-3 py-1 rounded-lg text-xs font-medium ${
            driver.status === 'approved' ? 'bg-green-500/10 text-green-400' :
            driver.status === 'action_required' ? 'bg-red-500/10 text-red-400' :
            'bg-amber-500/10 text-amber-400'}`}>{driver.status}</span>
        </div>

        {/* Actions globales */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => manageDriver('approve')} disabled={driver.status === 'approved' || !allRequiredApproved}
            title={!allRequiredApproved ? 'Tous les documents doivent être approuvés' : undefined}
            className="px-4 h-9 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-xl disabled:opacity-40">
            ✅ Approuver le dossier complet
          </button>
          <button onClick={() => manageDriver('reject')}
            className="px-4 h-9 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
            ❌ Rejeter
          </button>
          <button onClick={() => manageDriver('suspend')}
            className="px-4 h-9 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm rounded-xl">
            ⏸️ Suspendre
          </button>
        </div>

        {/* Documents granulaires */}
        <div className="glass-card rounded-2xl border border-white/10 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Documents</h2>
          {Object.entries(documents).map(([key, entry]) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm font-medium text-white">{DOC_LABELS[key] ?? key}</p>
                <span className={`text-xs ${
                  entry.status === 'approved' ? 'text-green-400' :
                  entry.status === 'rejected' ? 'text-red-400' :
                  entry.status === 'pending' ? 'text-amber-400' : 'text-slate-500'}`}>
                  {entry.status}
                </span>
                {entry.rejectionReason && <p className="text-xs text-red-400">{entry.rejectionReason}</p>}
              </div>
              <div className="flex gap-2">
                {entry.url && (
                  <a href={entry.url as string} target="_blank" rel="noopener noreferrer"
                    className="px-2 h-7 bg-white/5 border border-white/10 text-slate-400 text-xs rounded-lg flex items-center gap-1">
                    <MaterialIcon name="open_in_new" className="text-[14px]" /> Voir
                  </a>
                )}
                {entry.status !== 'approved' && (
                  <button onClick={() => manageDriver('approve_document', key)}
                    disabled={processing === 'approve_document' + key}
                    className="px-3 h-7 bg-green-500/10 border border-green-500/20 text-green-400 text-xs rounded-lg">
                    Approuver
                  </button>
                )}
                {entry.status !== 'rejected' && (
                  <button
                    onClick={() => {
                      setRejectModalKey(key)
                      setRejectReason('')
                    }}
                    disabled={processing === 'reject_document' + key}
                    className="px-3 h-7 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg">
                    Rejeter
                  </button>
                )}
              </div>
            </div>
          ))}
          {Object.keys(documents).length === 0 && (
            <p className="text-slate-500 text-sm">Aucun document soumis.</p>
          )}
        </div>

        {/* Notation */}
        <div className="glass-card rounded-2xl border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Notation</h2>
          <p className="text-white">
            Note : <span className="text-amber-400 font-bold">{driver.rating?.toFixed(1) ?? '—'}</span>
            {' '}({driver.ratingsCount ?? 0} évaluation{(driver.ratingsCount ?? 0) > 1 ? 's' : ''})
          </p>
        </div>

        {/* Modal de rejet */}
        {rejectModalKey && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="glass-card rounded-2xl border border-white/10 p-6 w-full max-w-sm space-y-4">
              <h3 className="text-white font-bold text-lg">Rejeter le document</h3>
              <p className="text-slate-400 text-sm">{DOC_LABELS[rejectModalKey] ?? rejectModalKey}</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Raison du rejet…"
                maxLength={500}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setRejectModalKey(null)}
                  className="flex-1 h-10 bg-white/5 border border-white/10 text-slate-400 text-sm rounded-xl"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    manageDriver('reject_document', rejectModalKey, rejectReason || 'Document non conforme')
                    setRejectModalKey(null)
                  }}
                  className="flex-1 h-10 bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold rounded-xl"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
