'use client'
import { useEffect, useRef, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/config/firebase'

interface Options<T> {
  uid: string
  collectionPath: string
  activeStatuses: readonly string[]
  mapDoc: (doc: QueryDocumentSnapshot<DocumentData>) => T
  logTag?: string
  pageSize?: number
}

export function useDriverAssignedDocs<T>({
  uid,
  collectionPath,
  activeStatuses,
  mapDoc,
  logTag,
  pageSize = 5,
}: Options<T>): { items: T[]; loading: boolean } {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const mapDocRef = useRef(mapDoc)
  const logTagRef = useRef(logTag)
  mapDocRef.current = mapDoc
  logTagRef.current = logTag

  useEffect(() => {
    if (!uid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, collectionPath),
      where('driverId', '==', uid),
      where('status', 'in', activeStatuses),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => mapDocRef.current(d)))
        setLoading(false)
      },
      (err) => {
        if (logTagRef.current) console.error(`[${logTagRef.current}] sync error:`, err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [uid, collectionPath, activeStatuses, pageSize])

  return { items, loading }
}
