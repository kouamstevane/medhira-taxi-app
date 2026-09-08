'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, query, collection, where, getDocs, limit } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { db, auth } from '@/config/firebase';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AdminAuth');
const adminStatusCache = new Map<string, boolean>();
const adminStatusChecks = new Map<string, Promise<boolean>>();

async function resolveAdminStatus(user: User): Promise<boolean> {
  const cachedStatus = adminStatusCache.get(user.uid);
  if (cachedStatus !== undefined) return cachedStatus;

  const existingCheck = adminStatusChecks.get(user.uid);
  if (existingCheck) return existingCheck;

  const check = (async () => {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    if (adminDoc.exists()) return true;

    const adminQuery = query(
      collection(db, 'admins'),
      where('userId', '==', user.uid),
      limit(1)
    );
    const adminSnapshot = await getDocs(adminQuery);
    return !adminSnapshot.empty;
  })();

  adminStatusChecks.set(user.uid, check);
  try {
    const status = await check;
    adminStatusCache.set(user.uid, status);
    return status;
  } finally {
    adminStatusChecks.delete(user.uid);
  }
}

/**
 * Hook pour vérifier les droits administrateur.
 * Redirige vers /login si non connecté, /dashboard si non admin.
 *
 * @returns isAdmin - null pendant la vérification, true/false après
 */
export function useAdminAuth(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) return;
      if (!user) {
        adminStatusCache.clear();
        adminStatusChecks.clear();
        setIsAdmin(false);
        router.push('/login');
        return;
      }

      setIsAdmin(null);
      void resolveAdminStatus(user)
        .then((adminStatus) => {
          if (!isMounted) return;
          setIsAdmin(adminStatus);
          if (!adminStatus) router.push('/dashboard');
        })
        .catch((err) => {
          logger.error('Erreur vérification admin', err instanceof Error ? err : new Error(String(err)));
          if (isMounted) setIsAdmin(false);
        });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router]);

  return isAdmin;
}
