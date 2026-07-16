'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { DocumentEntry } from '@/types/firestore-collections'
import {
  computeDriverDocumentsGlobalStatus,
  normalizeDriverDocuments,
  type DocStatus,
  type DriverDocumentStatusEntry,
} from '@/features/driver-documents/catalog'

export type { DocStatus }
export type DocumentStatusEntry = DriverDocumentStatusEntry

export function useDocumentStatus(uid: string | null) {
  const [documents, setDocuments] = useState<DocumentStatusEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [globalStatus, setGlobalStatus] = useState<'all_approved' | 'has_rejected' | 'pending'>('pending')

  useEffect(() => {
    if (!uid) {
      setDocuments([])
      setError(null)
      setLoading(false)
      return
    }

    const currentUid = uid
    let mounted = true
    setLoading(true)
    setError(null)

    const unsubscribe = onSnapshot(
      doc(db, 'drivers', currentUid, 'private', 'personal'),
      (snap) => {
        if (!mounted) {
          return
        }

        const rawDocuments = snap.data()?.documents as Record<string, DocumentEntry | undefined> | undefined
        const entries = normalizeDriverDocuments(rawDocuments)

        setDocuments(entries)
        setGlobalStatus(computeDriverDocumentsGlobalStatus(entries))
        setLoading(false)
      },
      (snapshotError) => {
        if (!mounted) {
          return
        }

        console.error('[useDocumentStatus] Sync error:', snapshotError)
        setError('Erreur de connexion aux données')
        setLoading(false)
      },
    )

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [uid])

  return { documents, loading, error, globalStatus }
}
