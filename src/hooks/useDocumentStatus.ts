// src/hooks/useDocumentStatus.ts
'use client'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { DocumentEntry } from '@/types/firestore-collections'

export type DocStatus = 'pending' | 'approved' | 'rejected' | 'not_submitted'

export interface DocumentStatusEntry {
  key: string
  label: string
  status: DocStatus
  url: string | null
  rejectionReason?: string
}

const DOC_LABELS: Record<string, string> = {
  photoProfile: 'Photo de profil',
  permitConduire: 'Permis de conduire',
  casierJudiciaire: 'Casier judiciaire',
  historiqueConduire: 'Historique chauffeur',
  preuvePermitTravail: 'Permis de travail',
  plaqueImmatriculation: "Plaque d'immatriculation",
  permitCommercial: 'Permis commercial',
  plaqueImmatriculationCommerciale: 'Plaque commerciale',
  visiteTechniqueCommerciale: 'Visite technique commerciale',
  certificatVille: 'Certificat ville',
}

export function useDocumentStatus(uid: string | null) {
  const [documents, setDocuments] = useState<DocumentStatusEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [globalStatus, setGlobalStatus] = useState<'all_approved' | 'has_rejected' | 'pending'>('pending')

  useEffect(() => {
    if (!uid) return
    const unsub = onSnapshot(doc(db, 'drivers', uid), (snap) => {
      const data = snap.data()
      const rawDocs = (data?.documents ?? {}) as Record<string, DocumentEntry>

      const entries: DocumentStatusEntry[] = Object.entries(rawDocs).map(([key, entry]) => ({
        key,
        label: DOC_LABELS[key] ?? key,
        status: entry.status,
        url: entry.url,
        rejectionReason: entry.rejectionReason,
      }))

      setDocuments(entries)

      const allApproved = entries.length > 0 && entries.every(e => e.status === 'approved')
      const hasRejected = entries.some(e => e.status === 'rejected')
      setGlobalStatus(allApproved ? 'all_approved' : hasRejected ? 'has_rejected' : 'pending')
      setLoading(false)
    })
    return () => unsub()
  }, [uid])

  return { documents, loading, globalStatus }
}
